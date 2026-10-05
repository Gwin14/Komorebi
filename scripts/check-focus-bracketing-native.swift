import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers

@main
struct FocusBracketingChecks {
  static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { fatalError(message) }
  }

  static func main() async throws {
    require(FocusBracketingConfiguration.supports(isVirtual: false, customFocus: true, lockedFocus: true,
      lockedExposure: true, lockedWhiteBalance: true), "Supporting physical lens hidden")
    for missing in 0..<5 {
      require(!FocusBracketingConfiguration.supports(isVirtual: missing == 0, customFocus: missing != 1,
        lockedFocus: missing != 2, lockedExposure: missing != 3, lockedWhiteBalance: missing != 4),
        "Unsupported lens advertised")
    }
    let once = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Int, Error>) in
      let wait = StackingAsyncWait(continuation, timeout: 0.2, isCancelled: { false })
      wait.finish(.success(7)); wait.finish(.failure(StackingError.cancelled))
    }
    require(once == 7, "Continuation resolved more than once")
    for cancelled in [false, true] {
      do {
        let _: Int = try await withCheckedThrowingContinuation { continuation in
          let wait = StackingAsyncWait<Int>(continuation, timeout: 0.08, isCancelled: { cancelled })
          // Hold the simulated camera callback beyond the watchdog deadline.
          DispatchQueue.global().asyncAfter(deadline: .now() + 0.15) { wait.finish(.success(1)) }
        }
        fatalError("Watchdog did not end the wait")
      } catch {
        require((error as? StackingError) == (cancelled ? .cancelled : .adjustmentTimedOut), "Wrong watchdog error")
      }
    }
    for count in [3, 10, 20] {
      let config = try FocusBracketingConfiguration(options: ["nearLensPosition": 0.2, "farLensPosition": 0.8, "frameCount": Double(count)])
      require(config.positions.count == count, "Incorrect count")
      require(abs(config.positions.first! - 0.2) < 0.00001 && abs(config.positions.last! - 0.8) < 0.00001, "Missing endpoints")
    }
    for options: [String: Any] in [
      ["nearLensPosition": 0.8, "farLensPosition": 0.2, "frameCount": 10.0],
      ["nearLensPosition": 0.2, "farLensPosition": 0.2, "frameCount": 10.0],
      ["nearLensPosition": Double.nan, "farLensPosition": 0.8, "frameCount": 10.0],
      ["nearLensPosition": 0.2, "farLensPosition": 0.8, "frameCount": 21.0],
      ["nearLensPosition": 0.2, "farLensPosition": 0.8, "frameCount": 3.5]
    ] { require((try? FocusBracketingConfiguration(options: options)) == nil, "Invalid native request accepted") }
    let size = 240
    let extent = CGRect(x: 0, y: 0, width: size, height: size)
    let identity = FocusFrameRegistration.identity(extent)
    let moved = FocusFrameRegistration(corners: identity.corners.map { CGPoint(x: $0.x + 5, y: $0.y - 4) }, referenceExtent: extent)!
    let crop = try FocusFrameRegistration.commonCrop([identity, moved], reference: extent)
    require(crop.minX >= 5 && crop.maxY <= 236 && crop.width > 200, "Crop includes empty pixels")
    require(FocusFrameRegistration(corners: identity.corners.reversed(), referenceExtent: extent) == nil, "Invalid homography accepted")
    let context = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.extendedLinearSRGB)!, .cacheIntermediates: false])
    var bytes = [UInt8](repeating: 255, count: size * size * 4)
    for y in 0..<size { for x in 0..<size {
      let i = (y * size + x) * 4
      let value: UInt8 = ((x / 4 + y / 4) % 2 == 0) ? 45 : 215
      bytes[i] = value; bytes[i + 1] = value; bytes[i + 2] = value
    } }
    let sharp = CIImage(bitmapData: Data(bytes), bytesPerRow: size * 4, size: CGSize(width: size, height: size),
                        format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
    let blurred = sharp.clampedToExtent().applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 3]).cropped(to: extent)
    let frames = (0..<3).map { index in
      let region = CGRect(x: index * 80, y: 0, width: 80, height: size)
      return sharp.cropped(to: region).composited(over: blurred).cropped(to: extent)
    }
    let compositor = FocusStackCompositor(context: context)
    let result = try compositor.compose(count: 3, extent: extent, referenceIndex: 1, isCancelled: { false },
      source: { frames[$0] }, progress: { _ in })
    func contrast(_ image: CIImage, region: CGRect) -> Double {
      var pixels = [UInt8](repeating: 0, count: Int(region.width * region.height) * 4)
      context.render(image, toBitmap: &pixels, rowBytes: Int(region.width) * 4, bounds: region,
                     format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
      let values = stride(from: 0, to: pixels.count, by: 4).map { Double(pixels[$0]) }
      let mean = values.reduce(0, +) / Double(values.count)
      return values.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(values.count)
    }
    for index in 0..<3 {
      let region = CGRect(x: index * 80 + 20, y: 20, width: 40, height: 200)
      let combined = contrast(result, region: region)
      let target = contrast(sharp, region: region)
      print("Plane \(index): sharp=\(target) stacked=\(combined)")
      require(combined > target * 0.75, "Failed to preserve sharp detail in plane \(index)")
    }
    // Small deterministic sensor noise must not erase the selected detail.
    var noisyFrames: [CIImage] = []
    for (index, image) in frames.enumerated() {
      var pixels = [UInt8](repeating: 0, count: bytes.count)
      context.render(image, toBitmap: &pixels, rowBytes: size * 4, bounds: extent, format: .RGBA8,
        colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
      for i in stride(from: 0, to: pixels.count, by: 4) {
        let noise = (i * 13 + index * 31) % 7 - 3
        for channel in 0..<3 { pixels[i + channel] = UInt8(max(0, min(255, Int(pixels[i + channel]) + noise))) }
      }
      noisyFrames.append(CIImage(bitmapData: Data(pixels), bytesPerRow: size * 4, size: extent.size,
        format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!))
    }
    let denoisedSelection = try compositor.compose(count: 3, extent: extent, referenceIndex: 1, isCancelled: { false },
      source: { noisyFrames[$0] }, progress: { _ in })
    for index in 0..<3 {
      let region = CGRect(x: index * 80 + 20, y: 20, width: 40, height: 200)
      require(contrast(denoisedSelection, region: region) > contrast(sharp, region: region) * 0.75,
        "Noise replaced focused detail")
    }
    let stable = try compositor.compose(count: 3, extent: extent, referenceIndex: 1, isCancelled: { false },
      source: { _ in sharp }, progress: { _ in })
    require(abs(contrast(stable, region: extent) - contrast(sharp, region: extent)) < 20, "Pyramid changed identical frames")
    do {
      _ = try compositor.compose(count: 3, extent: extent, referenceIndex: 1, isCancelled: { true }, source: { frames[$0] }, progress: { _ in })
      fatalError("Cancellation ignored")
    } catch StackingError.cancelled {}
    // Vision registration must undo source movement, rather than doubling it.
    let aligner = FrameAligner(context: context)
    var registrationBytes = bytes
    for y in 0..<size { for x in 0..<size {
      let i = (y * size + x) * 4
      let block = ((x / 13) * 73 + (y / 11) * 151 + (x / 13) * (y / 11) * 37) % 190
      for channel in 0..<3 { registrationBytes[i + channel] = UInt8(30 + block) }
    } }
    let registrationImage = CIImage(bitmapData: Data(registrationBytes), bytesPerRow: size * 4, size: extent.size,
      format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
    let shifted = registrationImage.transformed(by: CGAffineTransform(translationX: 4, y: -3))
    // Captured photos have a fixed raster canvas. Preserve that canvas after
    // shifting the synthetic scene, rather than changing the CIImage extent.
    let transformed = CIImage(cgImage: context.createCGImage(shifted, from: extent)!)
    guard let registered = aligner.registration(transformed, to: registrationImage) else { fatalError("Registration failed") }
    let aligned = registered.apply(to: transformed)
    let difference = aligned.applyingFilter("CIDifferenceBlendMode", parameters: [kCIInputBackgroundImageKey: registrationImage])
    let registrationError = contrast(difference, region: CGRect(x: 20, y: 20, width: 200, height: 200))
    require(registrationError < 500, "Registration direction is wrong")
    let scaledScene = registrationImage.transformed(by: CGAffineTransform(translationX: -3, y: 2)
      .scaledBy(x: 1.02, y: 1.02))
    let scaledRaster = CIImage(cgImage: context.createCGImage(scaledScene, from: extent)!)
    guard let scaleRegistration = aligner.registration(scaledRaster, to: registrationImage) else { fatalError("Scale registration failed") }
    let safeCrop = try FocusFrameRegistration.commonCrop([scaleRegistration], reference: extent)
    var alphaPixels = [UInt8](repeating: 0, count: Int(safeCrop.width * safeCrop.height) * 4)
    context.render(scaleRegistration.apply(to: scaledRaster), toBitmap: &alphaPixels, rowBytes: Int(safeCrop.width) * 4,
      bounds: safeCrop, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
    require(stride(from: 3, to: alphaPixels.count, by: 4).allSatisfy { alphaPixels[$0] == 255 }, "Crop contains transparent corners")
    let many = try compositor.compose(count: 20, extent: extent, referenceIndex: 19, isCancelled: { false },
      source: { _ in sharp }, progress: { _ in })
    require(abs(contrast(many, region: extent) - contrast(sharp, region: extent)) < 20, "Large frame indices corrupted masks")
    let store = try FrameStore()
    let directory = store.directory
    defer { store.cleanup() }
    for image in [registrationImage, transformed, scaledRaster] {
      let data = NSMutableData()
      let destination = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil)!
      CGImageDestinationAddImage(destination, context.createCGImage(image, from: extent)!,
        [kCGImageDestinationLossyCompressionQuality: 0.98] as CFDictionary)
      require(CGImageDestinationFinalize(destination), "Could not write test source")
      _ = try store.append(data: data as Data, metadata: [:])
    }
    let strategy = FocusBracketingStrategy()
    let captureOptions: [String: Any] = ["nearLensPosition": 0.1, "farLensPosition": 0.9, "frameCount": 3.0]
    let stacked = try strategy.compose(frames: store.frames, context: context, options: captureOptions,
      progress: { _, _, _ in }, isCancelled: { false })
    require(stacked.accepted == 3 && stacked.rejected == 0 && stacked.reference.index == 1, "Incomplete stack or incorrect reference")
    require(stacked.image.extent.width < extent.width, "Expected alignment crop")
    for format in ["jpeg", "heif"] {
      let exported = try StackingExporter(context: context).export(image: stacked.image, referenceURL: stacked.reference.url,
        outputFormat: format, strategyID: .focusBracketing)
      defer { try? FileManager.default.removeItem(at: exported.0) }
      require(exported.1 > 0 && exported.2 > 0, "Empty export")
      let output = CGImageSourceCreateWithURL(exported.0 as CFURL, nil)!
      let properties = CGImageSourceCopyPropertiesAtIndex(output, 0, nil)! as NSDictionary
      require((properties[kCGImagePropertyOrientation] as? Int) == 1, "Incorrect output orientation")
    }
    do {
      _ = try strategy.compose(frames: Array(store.frames.prefix(2)), context: context, options: captureOptions,
        progress: { _, _, _ in }, isCancelled: { false })
      fatalError("Partial sequence accepted")
    } catch StackingError.insufficientFrames {}
    store.cleanup()
    require(!FileManager.default.fileExists(atPath: directory.path), "Temporary sources leaked")
    print("Focus bracketing native checks passed: selection, registration, scaling, crop, 20 frames, cancellation, export and cleanup")
  }
}
