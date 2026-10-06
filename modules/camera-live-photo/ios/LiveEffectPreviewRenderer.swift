import AVFoundation
import CoreImage
import Foundation
import UIKit

// Shared by the three AVFoundation camera views. Core Image does all pixel work
// off the capture queue; a new frame is dropped while one is being rendered.
final class LiveEffectPreviewRenderer {
  let imageView = UIImageView()

  private let context = CIContext(options: [
    .useSoftwareRenderer: false,
    .workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
    .outputColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
  ])
  private let queue = DispatchQueue(label: "dev.komorebi.live-effect-preview", qos: .userInteractive)
  private let lock = NSLock()
  private var inFlight = false
  private var lastFrameAt = CFAbsoluteTime(0)
  private var generation = 0
  private var frameNumber = 0
  private var lutSize = 0
  private var cubeData: Data?
  private var lutDomain: [Double] = [0, 0, 0, 1, 1, 1]
  private var grainStrength = 0.0
  private var halation: [Double] = []
  private var hasPresentedFirstFrame = false
  private var portraitEnabled = false
  private var portraitAperture = 4.5
  private var portraitFocusPoint: CGPoint?
  private var lastPresentedAt = CFAbsoluteTime(0)
  private var freshnessTimer: Timer?

  private static let grainKernel = CIColorKernel(source: """
    kernel vec4 grain(__sample image, __sample random, float strength) {
      float luma = dot(image.rgb, vec3(0.2126, 0.7152, 0.0722));
      float noise = (random.r - 0.5) * strength * (1.15 - 0.5 * luma);
      return vec4(clamp(image.rgb + noise, 0.0, 1.0), image.a);
    }
  """)
  private static let halationKernel = CIColorKernel(source: """
    kernel vec4 halo(__sample image, __sample nearby,
                     float threshold, float softness, float contrast, float intensity) {
      float peak = max(image.r, max(image.g, image.b));
      float local = dot(nearby.rgb, vec3(0.2126, 0.7152, 0.0722));
      float light = smoothstep(threshold - softness, threshold + softness, peak);
      float edge = smoothstep(contrast * 0.5, contrast * 1.5, peak - local);
      float alpha = light * edge * intensity;
      return vec4(alpha, alpha * 0.18, alpha * 0.055, alpha);
    }
  """)

  init() {
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.isUserInteractionEnabled = false
    imageView.isHidden = true
    imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    freshnessTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
      guard let self else { return }
      self.lock.lock()
      let stale = self.portraitEnabled && CFAbsoluteTimeGetCurrent() - self.lastPresentedAt > 0.4
      self.lock.unlock()
      if stale { self.imageView.image = nil; self.imageView.isHidden = true }
    }
  }

  deinit { freshnessTimer?.invalidate() }

  static func exifOrientation(for orientation: AVCaptureVideoOrientation) -> Int32 {
    switch orientation {
    case .portrait: return 6
    case .portraitUpsideDown: return 8
    case .landscapeLeft: return 3
    case .landscapeRight: return 1
    @unknown default: return 6
    }
  }

  func setLut(size: Int, values: [Double]) {
    lock.lock()
    lutSize = size
    cubeData = Self.makeCubeData(size: size, values: values)
    generation += 1
    let enabled = isEnabled
    lock.unlock()
    updateVisibility(enabled)
  }

  func setGrainStrength(_ strength: Double) {
    lock.lock()
    grainStrength = max(0, strength)
    generation += 1
    let enabled = isEnabled
    lock.unlock()
    updateVisibility(enabled)
  }

  func setLutDomain(_ values: [Double]) {
    lock.lock()
    lutDomain = values.count == 6 ? values : [0, 0, 0, 1, 1, 1]
    generation += 1
    lock.unlock()
  }

  func setHalation(_ parameters: [Double]) {
    lock.lock()
    halation = parameters
    generation += 1
    let enabled = isEnabled
    lock.unlock()
    updateVisibility(enabled)
  }

  func setPortrait(aperture: Double, focusPoint: CGPoint?) {
    lock.lock()
    let focusChanged = portraitFocusPoint != focusPoint
    if !portraitEnabled || focusChanged { generation += 1 }
    portraitEnabled = true
    portraitAperture = aperture.isFinite ? max(1.4, min(16, aperture)) : 4.5
    portraitFocusPoint = focusPoint
    lock.unlock()
  }

  private var isEnabled: Bool {
    // Keep the zero-copy AVCaptureVideoPreviewLayer as the canonical preview
    // when no visual effect is active. Rendering every frame through Core
    // Image -> CGImage -> UIImage needlessly throttles all native modes and
    // puts continuous allocation pressure on the main thread.
    portraitEnabled || cubeData != nil || grainStrength > 0 || halation.count >= 6
  }

  private func updateVisibility(_ enabled: Bool) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if !enabled { self.imageView.image = nil }
      self.imageView.isHidden = !enabled || self.imageView.image == nil
    }
  }

  func submit(_ pixelBuffer: CVPixelBuffer, orientation: Int32, mirrored: Bool, depthData: AVDepthData? = nil) {
    let now = CFAbsoluteTimeGetCurrent()
    lock.lock()
    guard isEnabled, !inFlight, now - lastFrameAt >= 1.0 / (portraitEnabled ? 12.0 : 30.0) else {
      lock.unlock()
      return
    }
    inFlight = true
    lastFrameAt = now
    frameNumber += 1
    let currentFrame = frameNumber
    let currentGeneration = generation
    let size = lutSize
    let cube = cubeData
    let domain = lutDomain
    let grain = grainStrength
    let halo = halation
    let portrait = portraitEnabled
    let aperture = portraitAperture
    let focusPoint = portraitFocusPoint
    lock.unlock()

    queue.async { [weak self] in
      guard let self else { return }
      autoreleasepool {
        var image = CIImage(cvPixelBuffer: pixelBuffer)
        // Effects still need an intermediate bitmap. 720p keeps LUT, grain
        // and halation previews responsive while the full-resolution photo
        // output remains untouched.
        let scale = min(1.0, (portrait ? 540.0 : 720.0) / max(image.extent.width, image.extent.height))
        image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        var hasPortraitBlur = false
        if portrait, let depthData,
           [kCVPixelFormatType_DisparityFloat16, kCVPixelFormatType_DisparityFloat32,
            kCVPixelFormatType_DepthFloat16, kCVPixelFormatType_DepthFloat32].contains(depthData.depthDataType),
           CVPixelBufferGetWidth(depthData.depthDataMap) > 0,
           CVPixelBufferGetHeight(depthData.depthDataMap) > 0 {
          let disparity = depthData.converting(toDepthDataType: kCVPixelFormatType_DisparityFloat32)
          let buffer = disparity.depthDataMap
          if let focus = Self.focusDisparity(in: buffer, point: focusPoint ?? CGPoint(x: 0.5, y: 0.5)) {
            let tolerance = max(0.025, focus * 0.15)
            let depth = CIImage(cvPixelBuffer: buffer, options: [.colorSpace: NSNull()])
            let inverseVariance = 1 / (tolerance * tolerance)
            let coefficients = CIVector(x: focus * focus * inverseVariance,
              y: -2 * focus * inverseVariance, z: inverseVariance, w: 0)
            // Blur both sides of the tapped focal plane. Depth is scalar data,
            // so it must not pass through an sRGB color conversion.
            let mask = depth.applyingFilter("CIColorPolynomial", parameters: [
              "inputRedCoefficients": coefficients,
              "inputGreenCoefficients": coefficients,
              "inputBlueCoefficients": coefficients,
              "inputAlphaCoefficients": CIVector(x: 1, y: 0, z: 0, w: 0),
            ]).applyingFilter("CIColorClamp", parameters: [
              "inputMinComponents": CIVector(x: 0, y: 0, z: 0, w: 0),
              "inputMaxComponents": CIVector(x: 1, y: 1, z: 1, w: 1),
            ]).transformed(by: CGAffineTransform(
              scaleX: image.extent.width / depth.extent.width,
              y: image.extent.height / depth.extent.height
            )).clampedToExtent().applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1.5])
              .cropped(to: image.extent)
            let radius = max(0, (16 - aperture) / 14.6) * 12
            let blurred = image.clampedToExtent().applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: radius])
              .cropped(to: image.extent)
            image = blurred.applyingFilter("CIBlendWithMask", parameters: [
              kCIInputBackgroundImageKey: image, kCIInputMaskImageKey: mask,
            ]).cropped(to: image.extent)
            hasPortraitBlur = true
          }
        }
        if portrait && !hasPortraitBlur && cube == nil && grain == 0 && halo.count < 6 {
          self.lock.lock()
          self.inFlight = false
          self.lock.unlock()
          self.updateVisibility(false)
          return
        }
        if orientation != 1 { image = image.oriented(forExifOrientation: orientation) }
        if mirrored { image = image.oriented(.upMirrored) }
        let extent = image.extent

        if let cube, size >= 2 {
          if domain != [0, 0, 0, 1, 1, 1] {
            let scale = (0..<3).map { 1 / max(0.0001, domain[$0 + 3] - domain[$0]) }
            image = image.applyingFilter("CIColorMatrix", parameters: [
              "inputRVector": CIVector(x: CGFloat(scale[0]), y: 0, z: 0, w: 0),
              "inputGVector": CIVector(x: 0, y: CGFloat(scale[1]), z: 0, w: 0),
              "inputBVector": CIVector(x: 0, y: 0, z: CGFloat(scale[2]), w: 0),
              "inputBiasVector": CIVector(
                x: CGFloat(-domain[0] * scale[0]),
                y: CGFloat(-domain[1] * scale[1]),
                z: CGFloat(-domain[2] * scale[2]), w: 0
              ),
            ])
          }
          image = image.applyingFilter("CIColorCube", parameters: [
            "inputCubeDimension": size,
            "inputCubeData": cube,
          ])
        }
        if halo.count >= 6, let kernel = Self.halationKernel {
          let nearby = image.applyingFilter("CIGaussianBlur", parameters: [
            kCIInputRadiusKey: halo[2] * scale,
          ]).cropped(to: extent)
          if let highlights = kernel.apply(extent: extent, arguments: [
            image, nearby, halo[0], halo[1], halo[3], halo[5],
          ]) {
            let glow = highlights.applyingFilter("CIGaussianBlur", parameters: [
              kCIInputRadiusKey: halo[4] * scale,
            ]).cropped(to: extent)
            image = glow.applyingFilter("CIScreenBlendMode", parameters: [
              kCIInputBackgroundImageKey: image,
            ]).cropped(to: extent)
          }
        }
        if grain > 0, let kernel = Self.grainKernel {
          let random = CIFilter(name: "CIRandomGenerator")!.outputImage!
            .transformed(by: CGAffineTransform(translationX: CGFloat(currentFrame * 37), y: CGFloat(currentFrame * 53)))
          image = kernel.apply(extent: extent, arguments: [image, random, grain]) ?? image
        }
        let output = self.context.createCGImage(image.cropped(to: extent), from: extent)
        self.lock.lock()
        let current = self.generation == currentGeneration && self.isEnabled
        if !current || output == nil { self.inFlight = false }
        self.lock.unlock()
        if current, let output {
          DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let valid = self.generation == currentGeneration && self.isEnabled
            // Keep backpressure until the main queue consumes this image.
            // Otherwise a busy UI can accumulate rendered frames and buffers.
            self.inFlight = false
            self.lock.unlock()
            if valid {
              self.lock.lock()
              self.lastPresentedAt = CFAbsoluteTimeGetCurrent()
              self.lock.unlock()
              if let container = self.imageView.superview {
                self.imageView.frame = container.bounds
              }
              self.imageView.image = UIImage(cgImage: output)
              self.imageView.isHidden = false
              if !self.hasPresentedFirstFrame {
                self.hasPresentedFirstFrame = true
                print("[NativeEffectPreview] first frame presented")
              }
            }
          }
        }
      }
    }
  }

  static func focusDisparity(in buffer: CVPixelBuffer, point: CGPoint) -> CGFloat? {
    guard CVPixelBufferGetPixelFormatType(buffer) == kCVPixelFormatType_DisparityFloat32 else { return nil }
    let width = CVPixelBufferGetWidth(buffer), height = CVPixelBufferGetHeight(buffer)
    guard width > 0, height > 0, point.x.isFinite, point.y.isFinite else { return nil }
    guard CVPixelBufferLockBaseAddress(buffer, .readOnly) == kCVReturnSuccess else { return nil }
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    guard let address = CVPixelBufferGetBaseAddress(buffer) else { return nil }
    let x = min(width - 1, max(0, Int(point.x * CGFloat(width - 1))))
    let y = min(height - 1, max(0, Int(point.y * CGFloat(height - 1))))
    let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
    var samples: [Float] = []
    for row in max(0, y - 1)...min(height - 1, y + 1) {
      let values = address.advanced(by: row * rowBytes).assumingMemoryBound(to: Float.self)
      for column in max(0, x - 1)...min(width - 1, x + 1) {
        let value = values[column]
        if value.isFinite && value > 0 { samples.append(value) }
      }
    }
    guard !samples.isEmpty else { return nil }
    samples.sort()
    return CGFloat(samples[samples.count / 2])
  }

  static func portraitFocusRectangle(at point: CGPoint, extent: CGRect) -> CIVector {
    // Device points have a top-left origin; Core Image rectangles use pixels
    // with a bottom-left origin, before display rotation and mirroring.
    let x = max(0, min(0.95, point.x - 0.025))
    let y = max(0, min(0.95, 1 - point.y - 0.025))
    return CIVector(cgRect: CGRect(
      x: extent.minX + x * extent.width,
      y: extent.minY + y * extent.height,
      width: 0.05 * extent.width, height: 0.05 * extent.height
    ))
  }

  private static func makeCubeData(size: Int, values: [Double]) -> Data? {
    guard size >= 2, values.count == size * size * size * 3 else { return nil }
    var rgba = [Float]()
    rgba.reserveCapacity(size * size * size * 4)
    for index in stride(from: 0, to: values.count, by: 3) {
      rgba.append(Float(min(1, max(0, values[index]))))
      rgba.append(Float(min(1, max(0, values[index + 1]))))
      rgba.append(Float(min(1, max(0, values[index + 2]))))
      rgba.append(1)
    }
    return rgba.withUnsafeBytes { Data($0) }
  }
}
