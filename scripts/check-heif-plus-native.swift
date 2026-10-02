// macOS smoke tests for the same Core Image/ImageIO code shipped on iOS.
// xcrun swiftc modules/camera-raw-capture/ios/HeifPlus{Engine,Effects}.swift \
//   scripts/check-heif-plus-native.swift -o /tmp/heif-plus-check && /tmp/heif-plus-check
import Foundation
import CoreImage
import ImageIO

@main struct HeifPlusNativeCheck {
  static func require(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
    if try condition() == false { throw NSError(domain: "HeifPlusCheck", code: 1,
      userInfo: [NSLocalizedDescriptionKey: message]) }
  }
  static func pixels(_ image: CIImage, context: CIContext) -> [Float] {
    let width = Int(image.extent.width), height = Int(image.extent.height)
    var output = [Float](repeating: 0, count: width * height * 4)
    context.render(image, toBitmap: &output, rowBytes: width * 16,
      bounds: image.extent, format: .RGBAf, colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
    return output
  }
  static func main() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("heif-plus-check-\(UUID())")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let wholeDate = HeifPlusEngine.captureDate("2026-10-01T12:00:00Z")!
    let fractionalDate = HeifPlusEngine.captureDate("2026-10-01T12:00:00.123Z")!
    try require(abs(fractionalDate.timeIntervalSince(wholeDate) - 0.123) < 0.000001, "Capture timestamp lost milliseconds")
    let engine = HeifPlusEngine(root: folder.appendingPathComponent("jobs"))
    let bytes = Data((0..<1024).map { UInt8($0 % 256) })
    var jobs: [[String: Any]] = []
    for index in 0..<3 {
      let raw = folder.appendingPathComponent("capture-\(index).dng")
      try bytes.write(to: raw)
      let job = try engine.enqueue(raw.absoluteString, options: ["settings": ["exposure": 0]])
      jobs.append(job)
      let id = job["id"] as! String
      let copy = folder.appendingPathComponent("jobs/\(id)/original.dng")
      try require(try Data(contentsOf: copy) == bytes, "RAW bytes changed during checkpoint")
    }
    try require(try engine.jobs().count == 3, "Durable queue did not restore three jobs")
    let extra = folder.appendingPathComponent("extra.dng"); try bytes.write(to: extra)
    var rejected = false
    do { _ = try engine.enqueue(extra.absoluteString, options: [:]) } catch { rejected = true }
    try require(rejected, "Queue accepted a fourth RAW")
    try require(FileManager.default.fileExists(atPath: extra.path), "Queue rejection removed RAW")
    let id = jobs[0]["id"] as! String
    engine.markFailed(id, error: NSError(domain: "test", code: 1))
    try require(try engine.jobs().first { $0["id"] as? String == id }?["state"] as? String == "failed", "Failure checkpoint missing")
    try engine.retry(id)
    try require(try engine.jobs().first { $0["id"] as? String == id }?["state"] as? String == "pending", "Retry did not restore pending state")

    let context = CIContext(options: [.cacheIntermediates: false])
    let base = CIImage(color: CIColor(red: 0.43, green: 0.31, blue: 0.22))
      .cropped(to: CGRect(x: 0, y: 0, width: 128, height: 128))
    let baseline = pixels(base, context: context)
    let grain: [String: Any] = ["lumaStrength": 8, "chromaStrength": 0.8,
      "shadowBoost": 0.22, "highlightReduction": 0.58, "correlation": 0.16,
      "clumpSize": 34, "clumpAmount": 0.13]
    let grained = try HeifPlusEffects.apply(to: base, effects: ["grainConfig": grain, "seed": 42])
    let altered = pixels(grained, context: context)
    try require(zip(baseline, altered).contains { abs($0 - $1) > 0.001 }, "Grain produced no pixel changes")
    let repeated = pixels(try HeifPlusEffects.apply(to: base, effects: ["grainConfig": grain, "seed": 42]), context: context)
    try require(altered == repeated, "Grain changed when retrying the same recipe")
    var lut: [[String: Any]] = []
    for b in 0...1 { for g in 0...1 { for r in 0...1 {
      lut.append(["r": Double(r), "g": Double(g), "b": Double(b)])
    } } }
    let identity = pixels(try HeifPlusEffects.apply(to: base, effects: ["cube": ["size": 2, "lut": lut]]), context: context)
    try require(zip(baseline, identity).allSatisfy { abs($0 - $1) < 0.001 }, "Tetrahedral identity LUT altered color")
    let haloBase = CIImage(color: CIColor(red: 0.1, green: 0.1, blue: 0.1)).cropped(to: CGRect(x: 0, y: 0, width: 512, height: 512))
    let bright = CIImage(color: CIColor(red: 1, green: 1, blue: 1))
      .cropped(to: CGRect(x: 192, y: 0, width: 128, height: 512)).composited(over: haloBase)
    let halation = try HeifPlusEffects.apply(to: bright, effects: ["halationConfig": [
      "threshold": 0.76, "softness": 0.18, "contrastRadius": 68,
      "minContrast": 0.14, "contrastSoftness": 0.22, "fringeRadius": 14,
      "fringeIntensity": 1.35, "diffusionRadius": 36, "diffusionIntensity": 0.44,
      "targetPeakOpacity": 0.36]])
    let haloDifference = zip(pixels(bright, context: context), pixels(halation, context: context)).map { abs($0 - $1) }.max() ?? 0
    print("Halation maximum pixel difference:", haloDifference)
    try require(haloDifference > 0.001, "Halation produced no pixel changes")

    let compressionBase = base.clampedToExtent().cropped(to: CGRect(x: 0, y: 0, width: 1024, height: 1024))
    let textured = try HeifPlusEffects.apply(to: compressionBase, effects: ["grainConfig": grain, "seed": 42])
    let losslessURL = folder.appendingPathComponent("lossless.heic")
    let previousQualityURL = folder.appendingPathComponent("quality-09.heic")
    let compressedURL = folder.appendingPathComponent("compressed.heic")
    let qualityKey = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
    try context.writeHEIF10Representation(of: textured, to: losslessURL,
      colorSpace: CGColorSpace(name: CGColorSpace.displayP3)!, options: [qualityKey: 1.0])
    try context.writeHEIF10Representation(of: textured, to: previousQualityURL,
      colorSpace: CGColorSpace(name: CGColorSpace.displayP3)!, options: [qualityKey: 0.9])
    try context.writeHEIF10Representation(of: textured, to: compressedURL,
      colorSpace: CGColorSpace(name: CGColorSpace.displayP3)!, options: HeifPlusEngine.exportOptions)
    let losslessSize = try Data(contentsOf: losslessURL).count
    let compressedSize = try Data(contentsOf: compressedURL).count
    let previousQualitySize = try Data(contentsOf: previousQualityURL).count
    try require(compressedSize < previousQualitySize, "New HEIF compression did not reduce size versus quality 0.9")
    try require(compressedSize < losslessSize / 2, "HEIF compression did not substantially reduce file size")
    let compressedSource = CGImageSourceCreateWithURL(compressedURL as CFURL, nil)!
    let compressedProperties = CGImageSourceCopyPropertiesAtIndex(compressedSource, 0, nil) as! [String: Any]
    try require((compressedProperties[kCGImagePropertyDepth as String] as? NSNumber)?.intValue == 10, "Compressed HEIF lost ten-bit precision")
    try require((compressedProperties[kCGImagePropertyPixelWidth as String] as? NSNumber)?.intValue == 1024 &&
      (compressedProperties[kCGImagePropertyPixelHeight as String] as? NSNumber)?.intValue == 1024, "Compression changed resolution")
    print("HEIF compression: \(losslessSize) → \(compressedSize) bytes, preserving 1024×1024 and 10-bit")
    print("Previous quality 0.9: \(previousQualitySize) bytes; current quality \(HeifPlusEngine.exportQuality): \(compressedSize) bytes")

    let url = folder.appendingPathComponent("verified.heic")
    try context.writeHEIF10Representation(of: base, to: url,
      colorSpace: CGColorSpace(name: CGColorSpace.displayP3)!, options: HeifPlusEngine.exportOptions)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
      let depth = properties[kCGImagePropertyDepth as String] as? NSNumber else { throw NSError(domain: "HEIF", code: 1) }
    try require(depth.intValue >= 10, "HEIF10 exported fewer than ten bits")
    let before = pixels(CIImage(contentsOf: url)!, context: context)
    let recipe: [String: Any] = ["width": 128, "height": 128, "bitDepth": depth,
      "decoder": "check", "appliedSettings": ["exposure": 0], "effectsApplied": false]
    try engine.metadata(url, raw: [
      kCGImagePropertyExifDictionary as String: [kCGImagePropertyExifISOSpeedRatings as String: [200],
        kCGImagePropertyExifDateTimeOriginal as String: "2026:10:01 12:00:00",
        kCGImagePropertyExifExposureTime as String: 0.01,
        kCGImagePropertyExifLensModel as String: "Test Lens"],
      kCGImagePropertyTIFFDictionary as String: ["Make": "Apple", "Orientation": 6],
      kCGImagePropertyGPSDictionary as String: ["Latitude": 23.0, "Longitude": 46.0]],
      job: ["exifData": ["removeGPS": true], "catalogMetadata": ["author": "Teste Komorebi", "tags": ["heif-plus"]],
        "komorebiMetadata": ["app": "Komorebi"]], recipe: recipe)
    let after = pixels(CIImage(contentsOf: url)!, context: context)
    try require(before == after, "Metadata update recompressed or changed pixels")
    let updatedSource = CGImageSourceCreateWithURL(url as CFURL, nil)!
    let updated = CGImageSourceCopyPropertiesAtIndex(updatedSource, 0, nil) as! [String: Any]
    try require((updated[kCGImagePropertyDepth as String] as? NSNumber)?.intValue == depth.intValue, "Metadata update lost precision")
    try require(updated[kCGImagePropertyGPSDictionary as String] == nil, "GPS survived privacy setting")
    let exif = updated[kCGImagePropertyExifDictionary as String] as? [String: Any]
    try require((exif?[kCGImagePropertyExifISOSpeedRatings as String] as? [NSNumber])?.first?.intValue == 200, "ISO was not preserved")
    try require((exif?[kCGImagePropertyExifExposureTime as String] as? NSNumber)?.doubleValue == 0.01, "Shutter time was not preserved")
    try require((exif?[kCGImagePropertyExifLensModel as String] as? String) == "Test Lens", "Lens metadata was not preserved")
    try require((exif?[kCGImagePropertyExifUserComment as String] as? String)?.contains("KOMOREBI_JSON_BASE64:") == true, "Missing HEIF+ recipe")
    let gpsURL = folder.appendingPathComponent("gps.heic")
    let gpsJob: [String: Any] = ["exifData": ["GPSLatitude": -23.55052, "GPSLongitude": -46.633308, "GPSAltitude": 755.25]]
    let seeded = base.settingProperties(engine.exportProperties(raw: [:], job: gpsJob))
    try context.writeHEIF10Representation(of: seeded, to: gpsURL,
      colorSpace: CGColorSpace(name: CGColorSpace.displayP3)!, options: HeifPlusEngine.exportOptions)
    try engine.metadata(gpsURL, raw: [:], job: gpsJob, recipe: recipe)
    let gpsSource = CGImageSourceCreateWithURL(gpsURL as CFURL, nil)!
    let gpsProperties = CGImageSourceCopyPropertiesAtIndex(gpsSource, 0, nil) as! [String: Any]
    let gps = gpsProperties[kCGImagePropertyGPSDictionary as String] as? [String: Any] ?? [:]
    try require(abs(((gps["Latitude"] as? NSNumber)?.doubleValue ?? 0) - 23.55052) < 0.00001, "GPS latitude changed")
    try require(abs(((gps["Longitude"] as? NSNumber)?.doubleValue ?? 0) - 46.633308) < 0.00001, "GPS longitude changed")
    try require(gps["LatitudeRef"] as? String == "S" && gps["LongitudeRef"] as? String == "W", "GPS hemisphere changed")
    try require(abs(((gps["Altitude"] as? NSNumber)?.doubleValue ?? 0) - 755.25) < 0.001, "GPS altitude changed")
    print("PASS: durable queue, RAW byte preservation, retries, tetrahedral LUT, deterministic grain, halation, HEIF10 and lossless metadata (\(depth)-bit)")
    print("Independent metadata verification: \(url.path)")
  }
}
