import AVFoundation
import CoreImage
import Foundation
import ImageIO

struct FocusBracketingConfiguration {
  let near: Double
  let far: Double
  let frameCount: Int

  init(options: [String: Any]) throws {
    guard let near = options["nearLensPosition"] as? Double,
          let far = options["farLensPosition"] as? Double,
          let count = options["frameCount"] as? Double,
          near.isFinite, far.isFinite, count.isFinite,
          near >= 0, far <= 1, near < far,
          count >= 3, count <= 20, count.rounded() == count else {
      throw StackingError.invalidFocusRange
    }
    self.near = near
    self.far = far
    frameCount = Int(count)
  }

  var positions: [Float] {
    (0..<frameCount).map { index in
      Float(index == frameCount - 1 ? far : near + Double(index) * (far - near) / Double(frameCount - 1))
    }
  }

  func metadata(confirmed: [Float]) -> [String: Any] {
    ["nearLensPosition": near, "farLensPosition": far, "frameCount": frameCount,
     "confirmedLensPositions": confirmed.map(Double.init)]
  }

  static func supports(isVirtual: Bool, customFocus: Bool, lockedFocus: Bool,
                       lockedExposure: Bool, lockedWhiteBalance: Bool) -> Bool {
    !isVirtual && customFocus && lockedFocus && lockedExposure && lockedWhiteBalance
  }

  #if os(iOS)
  static func supports(_ device: AVCaptureDevice) -> Bool {
    supports(isVirtual: device.isVirtualDevice, customFocus: device.isLockingFocusWithCustomLensPositionSupported,
      lockedFocus: device.isFocusModeSupported(.locked), lockedExposure: device.isExposureModeSupported(.locked),
      lockedWhiteBalance: device.isWhiteBalanceModeSupported(.locked))
  }
  #endif
}

// Resolves exactly once across AVFoundation callbacks, timeout and cancellation.
// The watchdog runs off sessionQueue, so a stalled camera cannot block cleanup.
final class StackingAsyncWait<Value>: @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: CheckedContinuation<Value, Error>?
  private var timer: DispatchSourceTimer?

  init(_ continuation: CheckedContinuation<Value, Error>, timeout: TimeInterval,
       isCancelled: @escaping () -> Bool) {
    self.continuation = continuation
    let deadline = Date().addingTimeInterval(timeout)
    let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .userInitiated))
    self.timer = timer
    timer.setEventHandler { [weak self] in
      guard let self else { return }
      if isCancelled() { self.finish(.failure(StackingError.cancelled)) }
      else if Date() >= deadline { self.finish(.failure(StackingError.adjustmentTimedOut)) }
    }
    timer.schedule(deadline: .now() + 0.05, repeating: 0.05)
    timer.resume()
  }

  func finish(_ result: Result<Value, Error>) {
    lock.lock()
    let continuation = self.continuation
    self.continuation = nil
    let timer = self.timer
    self.timer = nil
    lock.unlock()
    timer?.cancel()
    continuation?.resume(with: result)
  }
}

// Corners are counterclockwise: bottom-left, bottom-right, top-right, top-left.
// Bounding extents alone include transparent triangles after a perspective warp.
struct FocusFrameRegistration {
  let corners: [CGPoint]

  init?(corners: [CGPoint], referenceExtent: CGRect) {
    guard corners.count == 4, corners.allSatisfy({ $0.x.isFinite && $0.y.isFinite }) else { return nil }
    let center = CGPoint(x: referenceExtent.midX, y: referenceExtent.midY)
    for i in 0..<4 {
      let a = corners[i], b = corners[(i + 1) % 4], c = corners[(i + 2) % 4]
      let edge = hypot(b.x - a.x, b.y - a.y)
      let referenceSide = i % 2 == 0 ? referenceExtent.width : referenceExtent.height
      guard edge >= referenceSide * 0.65, edge <= referenceSide * 1.5,
            Self.cross(a, b, c) > 0, Self.cross(a, b, center) > 0 else { return nil }
    }
    self.corners = corners
  }

  static func identity(_ extent: CGRect) -> FocusFrameRegistration {
    FocusFrameRegistration(corners: [CGPoint(x: extent.minX, y: extent.minY),
      CGPoint(x: extent.maxX, y: extent.minY), CGPoint(x: extent.maxX, y: extent.maxY),
      CGPoint(x: extent.minX, y: extent.maxY)], referenceExtent: extent)!
  }

  private static func cross(_ a: CGPoint, _ b: CGPoint, _ c: CGPoint) -> CGFloat {
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  }

  func apply(to image: CIImage) -> CIImage {
    image.applyingFilter("CIPerspectiveTransform", parameters: [
      "inputBottomLeft": CIVector(cgPoint: corners[0]), "inputBottomRight": CIVector(cgPoint: corners[1]),
      "inputTopRight": CIVector(cgPoint: corners[2]), "inputTopLeft": CIVector(cgPoint: corners[3])
    ])
  }

  // Largest centered rectangle with the reference aspect ratio that satisfies
  // every polygon half-plane. Insetting removes the resampling boundary.
  static func commonCrop(_ registrations: [FocusFrameRegistration], reference: CGRect) throws -> CGRect {
    var scale: CGFloat = 1
    for registration in registrations {
      for i in 0..<4 {
        let a = registration.corners[i], b = registration.corners[(i + 1) % 4]
        let dx = b.x - a.x, dy = b.y - a.y
        let margin = cross(a, b, CGPoint(x: reference.midX, y: reference.midY))
        let radius = abs(dy) * reference.width / 2 + abs(dx) * reference.height / 2
        guard margin > 0, radius > 0 else { throw StackingError.alignmentFailed }
        scale = min(scale, margin / radius)
      }
    }
    guard scale >= 0.65 else { throw StackingError.alignmentFailed }
    let rect = CGRect(x: reference.midX - reference.width * scale / 2,
                      y: reference.midY - reference.height * scale / 2,
                      width: reference.width * scale, height: reference.height * scale).insetBy(dx: 3, dy: 3)
    // Round inward; CGRect.integral would reintroduce invalid pixels.
    let result = CGRect(x: ceil(rect.minX), y: ceil(rect.minY),
                        width: floor(rect.maxX) - ceil(rect.minX), height: floor(rect.maxY) - ceil(rect.minY))
    guard result.width >= 32, result.height >= 32 else { throw StackingError.alignmentFailed }
    return result
  }
}

final class FocusBracketingStrategy: StackingStrategy {
  let id: StackingStrategyID = .focusBracketing

  func capturePlan(sceneLuminance: Double, options: [String: Any]) -> StackingCapturePlan {
    let count = (try? FocusBracketingConfiguration(options: options).frameCount) ?? 10
    return StackingCapturePlan(targetFrameCount: count, minimumFrameCount: count,
      maximumDuration: 120, frameSource: FullResolutionPhotoFrameSource())
  }

  func compose(frames: [StoredFrame], context: CIContext, options: [String: Any],
               progress: (Int, Int, Int) -> Void, isCancelled: () -> Bool
  ) throws -> (image: CIImage, accepted: Int, rejected: Int, reference: StoredFrame) {
    let config = try FocusBracketingConfiguration(options: options)
    guard frames.count == config.frameCount else { throw StackingError.insufficientFrames }
    let middle = frames.count / 2
    let reference = frames[middle]
    let aligner = FrameAligner(context: context)
    // Keep only the reference's registration proxy resident, at its original
    // coordinate size. The remaining sources are decoded one at a time.
    let (extent, proxy) = try autoreleasepool { () throws -> (CGRect, CIImage) in
      let image = try load(reference)
      let extent = image.extent
      let scale = min(1, 640 / max(extent.width, extent.height))
      let small = try materialize(image.transformed(by: CGAffineTransform(scaleX: scale, y: scale)), context)
      let proxy = small.transformed(by: CGAffineTransform(scaleX: extent.width / small.extent.width,
        y: extent.height / small.extent.height)).cropped(to: extent)
      return (extent, proxy)
    }
    var registrations: [FocusFrameRegistration] = []
    for (index, frame) in frames.enumerated() {
      try checkCancelled(isCancelled)
      let registration = try autoreleasepool { () throws -> FocusFrameRegistration in
        let image = try load(frame)
        guard abs(image.extent.width - extent.width) < 1, abs(image.extent.height - extent.height) < 1 else {
          throw StackingError.alignmentFailed
        }
        if index == middle { return .identity(extent) }
        guard let registration = aligner.registration(image, to: proxy) else { throw StackingError.alignmentFailed }
        return registration
      }
      registrations.append(registration)
      // First half of processing is alignment, exposed as analyzing.
      progress(index + 1, 0, index + 1)
    }
    let crop = try FocusFrameRegistration.commonCrop(registrations, reference: extent)
    let compositor = FocusStackCompositor(context: context)
    let image = try compositor.compose(count: frames.count, extent: crop,
      referenceIndex: middle, isCancelled: isCancelled,
      source: { index in registrations[index].apply(to: try self.load(frames[index])).cropped(to: crop) },
      progress: { processed in progress(frames.count, 0, frames.count + processed) })
    return (image, frames.count, 0, reference)
  }

  private func load(_ frame: StoredFrame) throws -> CIImage {
    guard let image = CIImage(contentsOf: frame.url, options: [.applyOrientationProperty: true]) else {
      throw StackingError.missingImageData
    }
    return image
  }

  private func materialize(_ image: CIImage, _ context: CIContext) throws -> CIImage {
    try FocusStackCompositor.materialize(image, context: context)
  }

  private func checkCancelled(_ cancelled: () -> Bool) throws {
    if cancelled() { throw StackingError.cancelled }
  }
}

// Streaming focus selection followed by a five-level Laplacian pyramid blend.
// Only a compact label map and the accumulated pyramid survive each frame.
final class FocusStackCompositor {
  private let context: CIContext
  private let absolute = CIColorKernel(source: """
    kernel vec4 absoluteFocus(__sample value) {
      float score = abs(value.r);
      return vec4(score, score, score, 1.0);
    }
  """)
  private let select = CIColorKernel(source: """
    kernel vec4 selectFocus(__sample best, __sample score, float index) {
      // A small hysteresis reduces switching from noise in flat regions.
      if (score.r > max(0.0001, best.r * 1.03)) return vec4(score.r, index, 0.0, 1.0);
      return best;
    }
  """)
  private let labels = CIColorKernel(source: """
    kernel vec4 focusLabels(__sample best) { return vec4(best.g, best.g, best.g, 1.0); }
  """)
  private let mask = CIColorKernel(source: """
    kernel vec4 focusMask(__sample label, float index) {
      float weight = 1.0 - step(0.1, abs(label.r - index));
      return vec4(weight, weight, weight, 1.0);
    }
  """)
  private let difference = CIColorKernel(source: """
    kernel vec4 focusDifference(__sample fine, __sample coarse) {
      return vec4(fine.rgb - coarse.rgb, 1.0);
    }
  """)
  private let accumulate = CIColorKernel(source: """
    kernel vec4 focusAccumulate(__sample previous, __sample band, __sample weight) {
      return vec4(previous.rgb + band.rgb * weight.r, 1.0);
    }
  """)
  private let add = CIColorKernel(source: """
    kernel vec4 focusAdd(__sample fine, __sample coarse) {
      return vec4(fine.rgb + coarse.rgb, 1.0);
    }
  """)

  init(context: CIContext) { self.context = context }

  static func materialize(_ image: CIImage, context: CIContext) throws -> CIImage {
    let extent = image.extent.integral
    guard !extent.isEmpty, let rendered = context.createCGImage(image, from: extent,
      format: .RGBAh, colorSpace: CGColorSpace(name: CGColorSpace.extendedLinearSRGB)) else {
      throw StackingError.cannotCreateOutput
    }
    return CIImage(cgImage: rendered).transformed(by: CGAffineTransform(translationX: extent.minX, y: extent.minY))
  }

  private func render(_ image: CIImage) throws -> CIImage { try Self.materialize(image, context: context) }

  private func resized(_ image: CIImage, to extent: CGRect) -> CIImage {
    image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
      .transformed(by: CGAffineTransform(scaleX: extent.width / image.extent.width, y: extent.height / image.extent.height))
      .transformed(by: CGAffineTransform(translationX: extent.minX, y: extent.minY)).cropped(to: extent)
  }

  private func downsample(_ image: CIImage) -> CIImage {
    let extent = CGRect(x: 0, y: 0, width: ceil(image.extent.width / 2), height: ceil(image.extent.height / 2))
    return resized(image.clampedToExtent().applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1])
      .cropped(to: image.extent), to: extent)
  }

  private func score(_ image: CIImage, extent: CGRect) throws -> CIImage {
    let luma = resized(image, to: extent).clampedToExtent()
      .applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0])
      .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 0.6])
      .applyingFilter("CIConvolution3X3", parameters: [
        "inputWeights": CIVector(values: [0, 1, 0, 1, -4, 1, 0, 1, 0], count: 9), "inputBias": 0
      ]).cropped(to: extent)
    guard let absolute = absolute?.apply(extent: extent, arguments: [luma]) else { throw StackingError.cannotCreateOutput }
    return try render(absolute.clampedToExtent().applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1.5])
      .cropped(to: extent))
  }

  func compose(count: Int, extent: CGRect, referenceIndex: Int, isCancelled: () -> Bool,
               source: (Int) throws -> CIImage, progress: (Int) -> Void) throws -> CIImage {
    guard count >= 3, count <= 20, (0..<count).contains(referenceIndex),
          let select, let labels, let mask, let difference, let accumulate, let add else {
      throw StackingError.cannotCreateOutput
    }
    let baseExtent = CGRect(origin: .zero, size: extent.size)
    let proxyScale = min(1, 1536 / max(extent.width, extent.height))
    let proxyExtent = CGRect(x: 0, y: 0, width: max(1, floor(extent.width * proxyScale)),
                             height: max(1, floor(extent.height * proxyScale)))
    var best = CIImage(color: CIColor(red: 0, green: CGFloat(referenceIndex), blue: 0, alpha: 1)).cropped(to: proxyExtent)
    let order = [referenceIndex] + (0..<count).filter { $0 != referenceIndex }
    for (processed, index) in order.enumerated() {
      if isCancelled() { throw StackingError.cancelled }
      best = try autoreleasepool {
        let sharpness = try score(source(index), extent: proxyExtent)
        guard let selected = select.apply(extent: proxyExtent, arguments: [best, sharpness, Float(index)]) else {
          throw StackingError.cannotCreateOutput
        }
        return try render(selected)
      }
      progress(processed + 1)
    }
    guard let labelImage = labels.apply(extent: proxyExtent, arguments: [best]) else { throw StackingError.cannotCreateOutput }
    let regularized = try render(labelImage.clampedToExtent().applyingFilter("CIMedianFilter").cropped(to: proxyExtent))
    // Masks partition the image; applying the same Gaussian to each keeps their
    // sum equal to one, including edges through clamping.
    var accumulated: [CIImage?] = Array(repeating: nil, count: 5)
    for index in 0..<count {
      if isCancelled() { throw StackingError.cancelled }
      try autoreleasepool {
        guard let binary = mask.apply(extent: proxyExtent, arguments: [regularized, Float(index)]) else {
          throw StackingError.cannotCreateOutput
        }
        let soft = binary.clampedToExtent().applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 2])
          .cropped(to: proxyExtent)
        var weight = try render(resized(soft, to: baseExtent))
        var current = try render(resized(source(index), to: baseExtent))
        for level in 0..<5 {
          if isCancelled() { throw StackingError.cancelled }
          let bounds = current.extent
          let next = level < 4 ? try render(downsample(current)) : nil
          let band: CIImage
          if let next {
            guard let detail = difference.apply(extent: bounds, arguments: [current, resized(next, to: bounds)]) else {
              throw StackingError.cannotCreateOutput
            }
            band = detail
          } else { band = current }
          let previous = accumulated[level] ?? CIImage(color: .black).cropped(to: bounds)
          guard let combined = accumulate.apply(extent: bounds, arguments: [previous, band, weight]) else {
            throw StackingError.cannotCreateOutput
          }
          accumulated[level] = try render(combined)
          if let next {
            current = next
            weight = try render(downsample(weight))
          }
        }
      }
      progress(count + index + 1)
    }
    guard var result = accumulated[4] else { throw StackingError.cannotCreateOutput }
    accumulated[4] = nil
    for level in stride(from: 3, through: 0, by: -1) {
      if isCancelled() { throw StackingError.cancelled }
      guard let band = accumulated[level],
            let reconstructed = add.apply(extent: band.extent, arguments: [band, resized(result, to: band.extent)]) else {
        throw StackingError.cannotCreateOutput
      }
      result = try render(reconstructed)
      accumulated[level] = nil
    }
    return result
  }
}

#if os(iOS)
struct FocusCaptureSettings {
  let device: AVCaptureDevice
  let exposureMode: AVCaptureDevice.ExposureMode
  let whiteBalanceMode: AVCaptureDevice.WhiteBalanceMode
  let focusMode: AVCaptureDevice.FocusMode
  let lensPosition: Float

  init(device: AVCaptureDevice) {
    self.device = device
    exposureMode = device.exposureMode
    whiteBalanceMode = device.whiteBalanceMode
    focusMode = device.focusMode
    lensPosition = device.lensPosition
  }
}

#endif
