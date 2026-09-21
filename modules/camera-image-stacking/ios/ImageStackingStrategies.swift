import CoreImage

private func loadImage(_ frame: StoredFrame) throws -> CIImage {
  guard let image = CIImage(contentsOf: frame.url, options: [.applyOrientationProperty: true]) else {
    throw StackingError.missingImageData
  }
  return image
}

private func scaled(_ image: CIImage, by value: Double) -> CIImage {
  image.applyingFilter("CIColorMatrix", parameters: [
    "inputRVector": CIVector(x: value, y: 0, z: 0, w: 0),
    "inputGVector": CIVector(x: 0, y: value, z: 0, w: 0),
    "inputBVector": CIVector(x: 0, y: 0, z: value, w: 0),
    "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1)
  ])
}

private func collapse(_ image: CIImage, context: CIContext) throws -> CIImage {
  let renderExtent = image.extent.integral
  let linearSpace = CGColorSpace(name: CGColorSpace.extendedLinearSRGB)
    ?? CGColorSpaceCreateDeviceRGB()
  guard let rendered = context.createCGImage(
    image,
    from: renderExtent,
    format: .RGBAh,
    colorSpace: linearSpace
  ) else {
    throw StackingError.cannotCreateOutput
  }
  // CGImage always starts at (0, 0). Restore the Core Image coordinate space
  // so subsequent aligned frames intersect the same reference canvas instead
  // of progressively shrinking the accumulator toward the origin.
  return CIImage(cgImage: rendered).transformed(
    by: CGAffineTransform(
      translationX: renderExtent.minX,
      y: renderExtent.minY
    )
  )
}

private func clampedMotionMask(
  reference: CIImage,
  candidate: CIImage,
  extent: CGRect
) -> CIImage {
  let minimum = CIVector(x: 0, y: 0, z: 0, w: 0)
  let maximum = CIVector(x: 1, y: 1, z: 1, w: 1)

  return candidate.cropped(to: extent)
    .applyingFilter("CIDifferenceBlendMode", parameters: [
      kCIInputBackgroundImageKey: reference.cropped(to: extent)
    ])
    .applyingFilter("CIColorControls", parameters: [
      kCIInputSaturationKey: 0
    ])
    // Blur before thresholding so random chroma/luma noise does not become a
    // field of one-pixel motion detections in dark scenes.
    .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 3])
    .cropped(to: extent)
    .applyingFilter("CIColorControls", parameters: [
      kCIInputContrastKey: 5,
      kCIInputBrightnessKey: -0.12
    ])
    // CIColorControls is allowed to produce extended and negative values.
    // Blend masks must stay in [0, 1]; otherwise CIBlendWithMask extrapolates
    // and creates the high-pass/colored-edge artifact seen in dark captures.
    .applyingFilter("CIColorClamp", parameters: [
      "inputMinComponents": minimum,
      "inputMaxComponents": maximum
    ])
    .cropped(to: extent)
}

private final class RobustAverageCompositor {
  private let context: CIContext
  private let analyzer: FrameAnalyzer
  private let motionAnalyzer: MotionAnalyzer
  private let aligner: FrameAligner

  init(context: CIContext) {
    self.context = context
    analyzer = FrameAnalyzer(context: context)
    motionAnalyzer = MotionAnalyzer(context: context)
    aligner = FrameAligner(context: context)
  }

  func compose(
    frames: [StoredFrame],
    motionThreshold: Double,
    progress: (Int, Int, Int) -> Void,
    isCancelled: () -> Bool
  ) throws -> (CIImage, Int, Int, StoredFrame) {
    guard !frames.isEmpty else { throw StackingError.insufficientFrames }

    let candidates = try frames.map { frame -> (StoredFrame, CIImage, FrameMetrics) in
      let image = try loadImage(frame)
      return (frame, image, analyzer.metrics(for: image))
    }
    let referenceItem = candidates.max {
      let lhs = $0.2.sharpness - abs($0.2.luminance - 0.42) * 0.15
      let rhs = $1.2.sharpness - abs($1.2.luminance - 0.42) * 0.15
      return lhs < rhs
    } ?? candidates[0]
    let reference = referenceItem.1
    var accumulator = reference
    var commonExtent = reference.extent
    var accepted = 1
    var rejected = 0
    progress(accepted, rejected, 0)

    for (index, item) in candidates.enumerated() where item.0.index != referenceItem.0.index {
      if isCancelled() { throw StackingError.cancelled }
      autoreleasepool {
        guard let aligned = aligner.align(item.1, to: reference) else {
          rejected += 1
          progress(accepted, rejected, index + 1)
          return
        }
        let extent = commonExtent.intersection(aligned.extent)
        guard !extent.isNull, extent.width >= reference.extent.width * 0.72,
              extent.height >= reference.extent.height * 0.72 else {
          rejected += 1
          progress(accepted, rejected, index + 1)
          return
        }

        let score = motionAnalyzer.score(
          reference: reference.cropped(to: extent),
          candidate: aligned.cropped(to: extent)
        )
        guard score < 0.45 else {
          rejected += 1
          progress(accepted, rejected, index + 1)
          return
        }

        let previousWeight = Double(accepted) / Double(accepted + 1)
        let incomingWeight = 1 / Double(accepted + 1)
        let previous = scaled(accumulator.cropped(to: extent), by: previousWeight)
        let incoming = scaled(aligned.cropped(to: extent), by: incomingWeight)
        var average = incoming.applyingFilter("CIAdditionCompositing", parameters: [
          kCIInputBackgroundImageKey: previous
        ])

        // A high-frequency difference is used as a local motion mask. Moving
        // pixels come from the sharp reference while static pixels keep the
        // temporal average, preventing the most visible ghosting artifacts.
        if score > motionThreshold {
          let mask = clampedMotionMask(
            reference: reference,
            candidate: aligned,
            extent: extent
          )
          average = reference.cropped(to: extent).applyingFilter("CIBlendWithMask", parameters: [
            kCIInputBackgroundImageKey: average,
            kCIInputMaskImageKey: mask
          ])
        }

        do {
          accumulator = try collapse(average.cropped(to: extent), context: context)
          commonExtent = accumulator.extent
          accepted += 1
        } catch {
          rejected += 1
        }
        progress(accepted, rejected, index + 1)
      }
    }

    return (accumulator.cropped(to: commonExtent), accepted, rejected, referenceItem.0)
  }
}

final class NoiseReductionStrategy: StackingStrategy {
  let id: StackingStrategyID = .noiseReduction

  func capturePlan(sceneLuminance: Double, options: [String: Any]) -> StackingCapturePlan {
    let requested = options["frameCount"] as? Int ?? 8
    return StackingCapturePlan(
      targetFrameCount: min(12, max(3, requested)),
      minimumFrameCount: 3,
      maximumDuration: 15,
      frameSource: FullResolutionPhotoFrameSource()
    )
  }

  func compose(
    frames: [StoredFrame],
    context: CIContext,
    progress: (Int, Int, Int) -> Void,
    isCancelled: () -> Bool
  ) throws -> (image: CIImage, accepted: Int, rejected: Int, reference: StoredFrame) {
    let value = try RobustAverageCompositor(context: context).compose(
      frames: frames,
      motionThreshold: 0.055,
      progress: progress,
      isCancelled: isCancelled
    )
    return (value.0, value.1, value.2, value.3)
  }
}

final class NightModeStrategy: StackingStrategy {
  let id: StackingStrategyID = .night

  func capturePlan(sceneLuminance: Double, options: [String: Any]) -> StackingCapturePlan {
    let maximum = min(16, max(8, options["maximumFrameCount"] as? Int ?? 16))
    let adaptive = sceneLuminance < 0.14 ? 16 : sceneLuminance < 0.28 ? 12 : 8
    return StackingCapturePlan(
      targetFrameCount: min(maximum, adaptive),
      minimumFrameCount: 3,
      maximumDuration: 25,
      frameSource: FullResolutionPhotoFrameSource()
    )
  }

  func compose(
    frames: [StoredFrame],
    context: CIContext,
    progress: (Int, Int, Int) -> Void,
    isCancelled: () -> Bool
  ) throws -> (image: CIImage, accepted: Int, rejected: Int, reference: StoredFrame) {
    let value = try RobustAverageCompositor(context: context).compose(
      frames: frames,
      motionThreshold: 0.075,
      progress: progress,
      isCancelled: isCancelled
    )
    let finished = value.0
      .applyingFilter("CINoiseReduction", parameters: [
        "inputNoiseLevel": 0.015,
        "inputSharpness": 0.45
      ])
      .applyingFilter("CIHighlightShadowAdjust", parameters: [
        "inputHighlightAmount": 0.82,
        "inputShadowAmount": 0.35,
        "inputRadius": 1.0
      ])
      .applyingFilter("CIColorControls", parameters: [
        kCIInputContrastKey: 1.04,
        kCIInputSaturationKey: 1.01
      ])
    return (finished.cropped(to: value.0.extent), value.1, value.2, value.3)
  }
}

final class BulbStrategy: StackingStrategy {
  let id: StackingStrategyID = .bulb

  func capturePlan(sceneLuminance: Double, options: [String: Any]) -> StackingCapturePlan {
    let requested = options["maximumDurationSeconds"] as? Double ?? 300
    return StackingCapturePlan(
      targetFrameCount: Int.max,
      minimumFrameCount: 5,
      maximumDuration: min(300, max(1, requested)),
      frameSource: PixelBufferStreamFrameSource(
        maximumDimension: 4096,
        minimumFrameInterval: 0.1
      )
    )
  }

  func compose(
    frames: [StoredFrame],
    context: CIContext,
    progress: (Int, Int, Int) -> Void,
    isCancelled: () -> Bool
  ) throws -> (image: CIImage, accepted: Int, rejected: Int, reference: StoredFrame) {
    throw StackingError.unsupportedStrategy
  }
}

final class BulbAccumulator {
  private let context: CIContext
  private let aligner: FrameAligner
  private let maximumDimension: CGFloat
  private var reference: CIImage?
  private var accumulated: CIImage?
  private var accumulatedDuration: TimeInterval = 0
  private(set) var accepted = 0
  private(set) var rejected = 0
  private(set) var captured = 0

  init(context: CIContext, maximumDimension: CGFloat) {
    self.context = context
    self.maximumDimension = maximumDimension
    aligner = FrameAligner(context: context)
  }

  func append(pixelBuffer: CVPixelBuffer, duration: TimeInterval) {
    captured += 1
    autoreleasepool {
      let source = CIImage(cvPixelBuffer: pixelBuffer)
      let longestSide = max(source.extent.width, source.extent.height)
      let scaleFactor = min(1, maximumDimension / max(1, longestSide))
      let incoming = source.transformed(
        by: CGAffineTransform(scaleX: scaleFactor, y: scaleFactor)
      )
      let frameDuration = min(0.5, max(1.0 / 120.0, duration))
      if reference == nil {
        guard let first = try? collapse(scaled(incoming, by: frameDuration), context: context) else {
          rejected += 1
          return
        }
        reference = (try? collapse(incoming, context: context)) ?? incoming
        accumulated = first
        accumulatedDuration = frameDuration
        accepted = 1
        return
      }
      guard let reference, let accumulated,
            let aligned = aligner.align(incoming, to: reference) else {
        rejected += 1
        return
      }
      let referenceExtent = reference.extent
      let alignedExtent = aligned.extent
      let alignedWidthRatio = alignedExtent.width / max(referenceExtent.width, 1)
      let alignedHeightRatio = alignedExtent.height / max(referenceExtent.height, 1)
      let extent = accumulated.extent
        .intersection(alignedExtent)
        .intersection(referenceExtent)
      guard !extent.isNull,
            alignedWidthRatio >= 0.65,
            alignedWidthRatio <= 1.5,
            alignedHeightRatio >= 0.65,
            alignedHeightRatio <= 1.5,
            extent.width >= referenceExtent.width * 0.72,
            extent.height >= referenceExtent.height * 0.72 else {
        rejected += 1
        return
      }
      // Each sample contributes light in proportion to the real interval it
      // represents. Unlike the still-photo strategies, this is deliberately
      // additive: local movement remains visible and brightness grows with
      // the effective exposure time, as it would in a physical bulb capture.
      let blended = scaled(aligned.cropped(to: extent), by: frameDuration)
        .applyingFilter("CIAdditionCompositing", parameters: [
          kCIInputBackgroundImageKey: accumulated.cropped(to: extent)
        ])
      guard let collapsed = try? collapse(blended, context: context) else {
        rejected += 1
        return
      }
      self.accumulated = collapsed
      accumulatedDuration += frameDuration
      accepted += 1
    }
  }

  func result() -> CIImage? { accumulated }
}
