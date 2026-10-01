import Foundation
import CoreImage
import Metal
import ImageIO
import UniformTypeIdentifiers
import Photos
import CoreLocation

// All access is serialized by the module. Only URLs/recipes cross the JS bridge.
final class HeifPlusEngine {
  // 1.0 can select lossless HEIF and produce files larger than the source DNG.
  static let exportQuality = 0.8
  static let exportOptions: [CIImageRepresentationOption: Any] = [
    CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): exportQuality]
  private let files = FileManager.default
  private let expirationLock = NSLock()
  private var expired = false
  private var resourceProgress: Progress?
  func expire() {
    expirationLock.lock(); expired = true; let progress = resourceProgress; expirationLock.unlock()
    progress?.cancel()
  }
  func resetExpiration() { expirationLock.lock(); expired = false; expirationLock.unlock() }
  private func checkExpiration() throws {
    expirationLock.lock(); let value = expired; expirationLock.unlock()
    if value { throw error("O tempo em background terminou. Tente novamente ao abrir o app.") }
  }
  private let root: URL
  init(root testRoot: URL? = nil) {
    root = testRoot ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("HeifPlus", isDirectory: true)
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    var mutable = root; try? mutable.setResourceValues(values)
  }
  private lazy var context: CIContext = {
    let options: [CIContextOption: Any] = [.cacheIntermediates: false,
      .workingFormat: CIFormat.RGBAh.rawValue,
      .workingColorSpace: CGColorSpace(name: CGColorSpace.extendedLinearDisplayP3)!]
    if let device = MTLCreateSystemDefaultDevice() { return CIContext(mtlDevice: device, options: options) }
    return CIContext(options: options)
  }()
  private func error(_ message: String) -> NSError {
    NSError(domain: "HeifPlus", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
  private func directory(_ id: String) throws -> URL {
    guard UUID(uuidString: id) != nil else { throw error("Identificador HEIF+ inválido") }
    return root.appendingPathComponent(id, isDirectory: true)
  }
  private func read(_ id: String) throws -> [String: Any] {
    let data = try Data(contentsOf: directory(id).appendingPathComponent("job.json"))
    guard let job = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw error("Registro HEIF+ inválido")
    }
    return job
  }
  private func write(_ job: [String: Any], id: String) throws {
    try JSONSerialization.data(withJSONObject: job, options: [.sortedKeys])
      .write(to: directory(id).appendingPathComponent("job.json"), options: .atomic)
  }
  func jobs() throws -> [[String: Any]] {
    try files.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
      .filter { UUID(uuidString: $0.lastPathComponent) != nil }
      .compactMap { try? read($0.lastPathComponent) }
      .sorted { ($0["createdAt"] as? String ?? "") < ($1["createdAt"] as? String ?? "") }
  }
  func enqueue(_ source: String, options: [String: Any]) throws -> [String: Any] {
    guard try jobs().count < 3 else { throw error("A fila HEIF+ está cheia") }
    guard let input = URL(string: source), input.isFileURL,
          input.pathExtension.lowercased() == "dng" else { throw error("HEIF+ requer um DNG") }
    let id = UUID().uuidString
    let dir = try directory(id)
    try files.createDirectory(at: dir, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
    do {
      let partial = dir.appendingPathComponent("original.partial")
      try files.copyItem(at: input, to: partial)
      try files.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: partial.path)
      try files.moveItem(at: partial, to: dir.appendingPathComponent("original.dng"))
      var job = options
      job["id"] = id; job["state"] = "pending"
      job["createdAt"] = options["createdAt"] ?? ISO8601DateFormatter().string(from: Date())
      try write(job, id: id)
      // The durable copy now owns the unmodified RAW. Companion is capture-only.
      try? files.removeItem(at: input)
      if let companion = options["companionUri"] as? String, let url = URL(string: companion),
         url.isFileURL, url.deletingLastPathComponent() == input.deletingLastPathComponent() {
        try? files.removeItem(at: url)
      }
      return job
    } catch {
      try? files.removeItem(at: dir)
      throw error
    }
  }
  func discard(_ id: String) throws { try files.removeItem(at: directory(id)) }
  func retry(_ id: String) throws {
    var job = try read(id); job["state"] = "pending"; job.removeValue(forKey: "error")
    try write(job, id: id)
  }
  func markFailed(_ id: String, error: Error) {
    guard var job = try? read(id) else { return }
    job["state"] = "failed"; job["error"] = error.localizedDescription
    try? write(job, id: id)
  }
  private func filter(_ url: URL) throws -> CIRAWFilter {
    guard let filter = CIRAWFilter(imageURL: url) else { throw error("DNG não suportado pelo Core Image") }
    if #available(iOS 27, macOS 27, *) {
      if filter.supportedDecoderVersions.contains(.version9DNG) { filter.decoderVersion = .version9DNG }
      else if filter.supportedDecoderVersions.contains(.version9) { filter.decoderVersion = .version9 }
      if filter.decoderVersion.rawValue.hasPrefix("9") {
        let semaphore = DispatchSemaphore(value: 0)
        var resourceError: Error?
        let progress = filter.downloadResources(timeout: 15) { error in
          resourceError = error; semaphore.signal()
        }
        expirationLock.lock(); resourceProgress = progress; let cancelled = expired; expirationLock.unlock()
        if cancelled { progress.cancel() }
        semaphore.wait()
        expirationLock.lock(); resourceProgress = nil; expirationLock.unlock()
        try checkExpiration()
        if let resourceError {
          guard let fallback = filter.supportedDecoderVersions.last(where: { !$0.rawValue.hasPrefix("9") }) else {
            throw resourceError
          }
          filter.decoderVersion = fallback
          NSLog("[HEIF+] RAW 9 resources unavailable; using %@: %@", fallback.rawValue, resourceError.localizedDescription)
        }
      }
    }
    filter.scaleFactor = 1; filter.isDraftModeEnabled = false
    return filter
  }
  private func support(_ f: CIRAWFilter) -> [String: Bool] {
    let raw9 = f.decoderVersion.rawValue.hasPrefix("9")
    var result = ["sharpnessAmount": f.isSharpnessSupported,
      "luminanceNoiseReductionAmount": f.isLuminanceNoiseReductionSupported,
      "contrastAmount": f.isContrastSupported, "localToneMapAmount": f.isLocalToneMapSupported,
      "colorNoiseReductionAmount": !raw9 && f.isColorNoiseReductionSupported,
      "detailAmount": !raw9 && f.isDetailSupported,
      "moireReductionAmount": !raw9 && f.isMoireReductionSupported,
      "despeckleAmount": f.isDespeckleSupported,
      "lensCorrectionEnabled": f.isLensCorrectionSupported,
      "exposure": true, "boostAmount": true, "boostShadowAmount": true,
      "neutralTemperature": true, "neutralTint": true, "highlightRecoveryEnabled": false]
    if #available(iOS 26, *) { result["highlightRecoveryEnabled"] = f.isHighlightRecoverySupported }
    return result
  }
  func inspect(_ id: String) throws -> [String: Any] {
    let f = try filter(directory(id).appendingPathComponent("original.dng"))
    return ["decoder": f.decoderVersion.rawValue, "supportedControls": support(f),
      "width": f.nativeSize.width, "height": f.nativeSize.height]
  }
  private func apply(_ settings: [String: Any], to f: CIRAWFilter) -> [String: Any] {
    let supported = support(f)
    let ranges: [String: ClosedRange<Float>] = ["sharpnessAmount": 0...1,
      "luminanceNoiseReductionAmount": 0...1, "contrastAmount": 0...1,
      "localToneMapAmount": 0...1, "exposure": -3...3, "boostAmount": 0...1,
      "boostShadowAmount": 0...2, "neutralTemperature": 2000...50000,
      "neutralTint": -150...150, "colorNoiseReductionAmount": 0...1,
      "detailAmount": 0...3, "moireReductionAmount": 0...1, "despeckleAmount": 0...1]
    var applied: [String: Any] = [:]
    for (key, range) in ranges where supported[key] == true {
      if let value = settings[key] as? NSNumber, value.floatValue.isFinite {
        f.setValue(min(range.upperBound, max(range.lowerBound, value.floatValue)), forKey: key)
      }
      applied[key] = f.value(forKey: key)
    }
    if let enabled = settings["lensCorrectionEnabled"] as? Bool, f.isLensCorrectionSupported {
      f.isLensCorrectionEnabled = enabled
    }
    applied["lensCorrectionEnabled"] = f.isLensCorrectionEnabled
    if #available(iOS 26, *), f.isHighlightRecoverySupported {
      f.isHighlightRecoveryEnabled = settings["highlightRecoveryEnabled"] as? Bool ?? true
      applied["highlightRecoveryEnabled"] = f.isHighlightRecoveryEnabled
    }
    f.isGamutMappingEnabled = true
    f.extendedDynamicRangeAmount = 0 // 10-bit SDR, not an implicit HDR promise.
    return applied
  }
  private func crop(_ image: CIImage, ratio: Double, alignOrientation: Bool = true) -> CIImage {
    let e = image.extent
    let target = alignOrientation ? (e.width > e.height ? max(ratio, 1 / ratio) : min(ratio, 1 / ratio)) : ratio
    let width = floor(min(e.width, e.height * target))
    let height = floor(min(e.height, e.width / target))
    let rect = CGRect(x: floor(e.midX - width / 2), y: floor(e.midY - height / 2), width: width, height: height)
    return image.cropped(to: rect).transformed(by: .init(translationX: -rect.minX, y: -rect.minY))
  }
  func exportProperties(raw: [AnyHashable: Any], job: [String: Any]) -> [String: Any] {
    var properties: [String: Any] = [kCGImagePropertyOrientation as String: 1]
    var exif = raw[kCGImagePropertyExifDictionary as String] as? [String: Any] ?? [:]
    for key in ["MakerNote", "PixelXDimension", "PixelYDimension", "UserComment"] { exif.removeValue(forKey: key) }
    properties[kCGImagePropertyExifDictionary as String] = exif
    let tiff = raw[kCGImagePropertyTIFFDictionary as String] as? [String: Any] ?? [:]
    properties[kCGImagePropertyTIFFDictionary as String] = tiff.filter {
      ["Make", "Model", "Software", "DateTime", "Artist", "Copyright"].contains($0.key)
    }.merging(["Orientation": 1]) { _, updated in updated }
    let additional = job["exifData"] as? [String: Any] ?? [:]
    if additional["removeGPS"] as? Bool != true {
      var gps = raw[kCGImagePropertyGPSDictionary as String] as? [String: Any] ?? [:]
      if let lat = additional["GPSLatitude"] as? NSNumber, let lon = additional["GPSLongitude"] as? NSNumber {
        gps["Latitude"] = abs(lat.doubleValue); gps["LatitudeRef"] = lat.doubleValue < 0 ? "S" : "N"
        gps["Longitude"] = abs(lon.doubleValue); gps["LongitudeRef"] = lon.doubleValue < 0 ? "W" : "E"
        if let altitude = additional["GPSAltitude"] as? NSNumber {
          gps["Altitude"] = abs(altitude.doubleValue); gps["AltitudeRef"] = altitude.doubleValue < 0 ? 1 : 0
        }
      }
      if !gps.isEmpty { properties[kCGImagePropertyGPSDictionary as String] = gps }
    }
    return properties
  }

  func render(_ id: String) throws -> [String: Any] {
    var job = try read(id)
    let dir = try directory(id)
    if let variants = job["variants"] as? [[String: Any]], !variants.isEmpty,
       variants.allSatisfy({ files.fileExists(atPath: dir.appendingPathComponent($0["file"] as? String ?? "").path) }) {
      return job
    }
    try checkExpiration()
    defer { context.clearCaches() }
    let started = CFAbsoluteTimeGetCurrent()
    let rawURL = dir.appendingPathComponent("original.dng")
    let f = try filter(rawURL)
    let applied = apply(job["settings"] as? [String: Any] ?? [:], to: f)
    guard let output = f.outputImage else { throw error("A revelação RAW não produziu imagem") }
    let ratio = max(0.1, (job["aspectRatio"] as? NSNumber)?.doubleValue ?? 0.75)
    let base = crop(output, ratio: ratio)
    let effects = job["effects"] as? [String: Any] ?? [:]
    let effectImage = try HeifPlusEffects.apply(to: base, effects: effects)
    var images: [(String, CIImage)] = [("main", effectImage)]
    if job["doubleCaptureMode"] as? Bool == true {
      images.append(("alternative", crop(try HeifPlusEffects.apply(to: output, effects: effects), ratio: base.extent.height / base.extent.width, alignOrientation: false)))
    }
    if job["saveOriginalWithoutEffects"] as? Bool == true { images.append(("original", base)) }
    var variants: [[String: Any]] = []
    let colorSpace = CGColorSpace(name: CGColorSpace.displayP3)!
    for (name, originalImage) in images {
      try checkExpiration()
      let image = originalImage.settingProperties(exportProperties(raw: f.properties, job: job))
      let url = dir.appendingPathComponent("\(name).heic")
      let options = Self.exportOptions
      do { try context.writeHEIF10Representation(of: image, to: url, colorSpace: colorSpace, options: options) }
      catch {
        let failure = error as NSError
        if failure.domain == NSCocoaErrorDomain || failure.domain == NSPOSIXErrorDomain { throw error }
        try? files.removeItem(at: url)
        try context.writeHEIFRepresentation(of: image, to: url, format: .RGBA8, colorSpace: colorSpace, options: options)
      }
      guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
        let depth = props[kCGImagePropertyDepth as String] as? NSNumber else {
        throw error("Não foi possível verificar o HEIF exportado")
      }
      let recipe: [String: Any] = ["decoder": f.decoderVersion.rawValue,
        "appliedSettings": applied, "supportedControls": support(f), "bitDepth": depth,
        "width": image.extent.width, "height": image.extent.height,
        "effectsApplied": name != "original", "compressionQuality": Self.exportQuality]
      try metadata(url, raw: f.properties, job: job, recipe: recipe)
      variants.append(["file": url.lastPathComponent, "photoUri": url.absoluteString,
        "recipe": recipe, "name": name])
    }
    job["variants"] = variants; job["state"] = "rendered"
    job["durationMs"] = (CFAbsoluteTimeGetCurrent() - started) * 1000
    try write(job, id: id)
    NSLog("[HEIF+] rendered %@ decoder=%@ durationMs=%.0f", id, f.decoderVersion.rawValue,
      (CFAbsoluteTimeGetCurrent() - started) * 1000)
    return job
  }
  func metadata(_ url: URL, raw: [AnyHashable: Any], job: [String: Any], recipe: [String: Any]) throws {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let destination = CGImageDestinationCreateWithURL(url.appendingPathExtension("tmp") as CFURL, UTType.heic.identifier as CFString, 1, nil) else {
      throw error("Falha ao preparar metadados HEIF+")
    }
    let md = CGImageMetadataCreateMutable()
    let rationalKeys: Set<String> = ["ExposureTime", "FNumber", "ShutterSpeedValue",
      "ApertureValue", "BrightnessValue", "ExposureBiasValue", "MaxApertureValue",
      "SubjectDistance", "FocalLength", "FlashEnergy", "FocalPlaneXResolution",
      "FocalPlaneYResolution", "ExposureIndex", "DigitalZoomRatio", "Gamma"]
    func rational(_ number: Double) -> String {
      // Continued fractions retain camera fractions such as 1/60 exactly.
      let sign = number < 0 ? -1 : 1
      let target = abs(number)
      var x = target, n0 = 0, n1 = 1, d0 = 1, d1 = 0
      for _ in 0..<20 {
        guard x.isFinite, x < Double(Int32.max) else { break }
        let a = Int(floor(x)), n = a * n1 + n0, d = a * d1 + d0
        if d > 1_000_000_000 || n > Int32.max { break }
        n0 = n1; n1 = n; d0 = d1; d1 = d
        if d > 0 && abs(Double(n) / Double(d) - target) < 1e-12 { break }
        let remainder = x - Double(a)
        if remainder < 1e-15 { break }
        x = 1 / remainder
      }
      return "\(sign * n1)/\(max(1, d1))"
    }
    func set(_ dictionary: CFString, _ key: CFString, _ value: Any) {
      let representation: Any
      if dictionary == kCGImagePropertyExifDictionary, rationalKeys.contains(key as String),
         let number = value as? NSNumber, number.doubleValue.isFinite {
        representation = rational(number.doubleValue)
      } else { representation = value }
      CGImageMetadataSetValueMatchingImageProperty(md, dictionary, key, representation as CFTypeRef)
    }
    // Copy only photographic dictionaries, never DNG-specific container fields.
    for dictionary in [kCGImagePropertyExifDictionary, kCGImagePropertyTIFFDictionary] {
      if let fields = raw[dictionary as String] as? [String: Any] {
        for (key, value) in fields {
          if dictionary == kCGImagePropertyTIFFDictionary && !["Make", "Model", "Software", "DateTime", "Artist", "Copyright"].contains(key) { continue }
          if dictionary == kCGImagePropertyExifDictionary && ["MakerNote", "PixelXDimension", "PixelYDimension", "UserComment"].contains(key) { continue }
          set(dictionary, key as CFString, value)
        }
      }
    }
    // ImageIO's property matcher does not serialize ISO arrays reliably.
    // Use the standard EXIF XMP sequence; ImageIO writes the matching EXIF tag.
    if let exif = raw[kCGImagePropertyExifDictionary as String] as? [String: Any],
       let iso = exif[kCGImagePropertyExifISOSpeedRatings as String] as? [NSNumber] {
      let namespace = "http://ns.adobe.com/exif/1.0/" as CFString
      CGImageMetadataRegisterNamespaceForPrefix(md, namespace, "exif" as CFString, nil)
      if let tag = CGImageMetadataTagCreate(namespace, "exif" as CFString,
        "ISOSpeedRatings" as CFString, .arrayOrdered, iso.map { $0.stringValue } as CFArray) {
        CGImageMetadataSetTagWithPath(md, nil, "exif:ISOSpeedRatings" as CFString, tag)
      }
    }
    set(kCGImagePropertyTIFFDictionary, kCGImagePropertyTIFFOrientation, 1)
    set(kCGImagePropertyExifDictionary, kCGImagePropertyExifPixelXDimension, recipe["width"] ?? 0)
    set(kCGImagePropertyExifDictionary, kCGImagePropertyExifPixelYDimension, recipe["height"] ?? 0)
    var komorebi = job["komorebiMetadata"] as? [String: Any] ?? ["app": "Komorebi"]
    komorebi["schemaVersion"] = 5; komorebi["captureMode"] = "heifPlus"; komorebi["heifPlus"] = recipe
    if recipe["effectsApplied"] as? Bool == false {
      komorebi["filter"] = NSNull(); komorebi["grain"] = ["enabled": false, "id": "none"]
      komorebi["halation"] = ["enabled": false, "id": "none"]
    }
    let encoded = try JSONSerialization.data(withJSONObject: komorebi).base64EncodedString()
    set(kCGImagePropertyExifDictionary, kCGImagePropertyExifUserComment, "KOMOREBI_JSON_BASE64:" + encoded)
    let catalog = job["catalogMetadata"] as? [String: Any] ?? [:]
    if let author = catalog["author"] as? String, !author.isEmpty { set(kCGImagePropertyIPTCDictionary, kCGImagePropertyIPTCByline, [author]) }
    if let copyright = catalog["copyright"] as? String, !copyright.isEmpty { set(kCGImagePropertyIPTCDictionary, kCGImagePropertyIPTCCopyrightNotice, copyright) }
    if let tags = catalog["tags"] as? [String], !tags.isEmpty { set(kCGImagePropertyIPTCDictionary, kCGImagePropertyIPTCKeywords, tags) }
    let exif = job["exifData"] as? [String: Any] ?? [:]
    // GPS is seeded in CIImage.properties at first export. ImageIO's lossless
    // HEIF copy preserves an existing GPS IFD but cannot reliably add a new one.
    let temp = url.appendingPathExtension("tmp")
    defer { try? files.removeItem(at: temp) }
    var err: Unmanaged<CFError>?
    var options: [CFString: Any] = [kCGImageDestinationMetadata: md,
      kCGImageDestinationMergeMetadata: true]
    if exif["removeGPS"] as? Bool == true { options[kCGImageMetadataShouldExcludeGPS] = true }
    guard CGImageDestinationCopyImageSource(destination, source, options as CFDictionary, &err) else {
      throw err?.takeRetainedValue() ?? error("Falha ao copiar metadados sem recompressão") as CFError
    }
    _ = try files.replaceItemAt(url, withItemAt: temp)
  }
  func enrich(_ id: String, data: [String: Any]) throws {
    var job = try read(id)
    for key in ["catalogMetadata", "komorebiMetadata", "filename"] {
      if let value = data[key] { job[key] = value }
    }
    let f = try filter(directory(id).appendingPathComponent("original.dng"))
    for variant in job["variants"] as? [[String: Any]] ?? [] where variant["assetId"] == nil {
      try metadata(directory(id).appendingPathComponent(variant["file"] as! String),
        raw: f.properties, job: job, recipe: variant["recipe"] as? [String: Any] ?? [:])
    }
    job["intelligenceCompleted"] = true
    try write(job, id: id)
  }
  // Run on the serial worker; PhotoKit's completion runs on a separate queue.
  private func changes(_ block: @escaping () -> Void) throws {
    let semaphore = DispatchSemaphore(value: 0)
    var failure: Error?
    PHPhotoLibrary.shared().performChanges(block) { success, err in
      if !success { failure = err ?? self.error("Falha ao salvar no Fotos") }
      semaphore.signal()
    }
    semaphore.wait()
    if let failure { throw failure }
  }
  static func captureDate(_ text: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: text) ?? ISO8601DateFormatter().date(from: text)
  }

  func save(_ id: String) throws -> [String: Any] {
    var job = try read(id)
    if job["state"] as? String == "saved" { return job }
    guard var variants = job["variants"] as? [[String: Any]], !variants.isEmpty else {
      throw error("HEIF+ ainda não foi revelado")
    }
    for index in variants.indices {
      try checkExpiration()
      if variants[index]["organized"] as? Bool == true { continue }
      let existingID = variants[index]["assetId"] as? String
      let existing = existingID.flatMap { PHAsset.fetchAssets(withLocalIdentifiers: [$0], options: nil).firstObject }
      if existing == nil {
        let url = try directory(id).appendingPathComponent(variants[index]["file"] as! String)
        let rawURL = try directory(id).appendingPathComponent("original.dng")
        let paired = job["rawPairEnabled"] as? Bool == true
        var placeholderID: String?
        var journalError: Error?
        try changes {
          let request = PHAssetCreationRequest.forAsset()
          let resource = PHAssetResourceCreationOptions()
          let suffix = variants[index]["name"] as? String ?? "main"
          let filename = job["filename"] as? String ?? "Komorebi-\(id).heic"
          let resourceFilename = suffix == "main" ? filename : URL(fileURLWithPath: filename).deletingPathExtension().lastPathComponent + "-\(suffix).heic"
          resource.originalFilename = resourceFilename
          placeholderID = request.placeholderForCreatedAsset?.localIdentifier
          variants[index]["assetId"] = placeholderID
          job["variants"] = variants
          do { try self.write(job, id: id) }
          catch { journalError = error; return } // Empty request cannot commit a photo.
          if paired {
            do {
              try RawPhotoLibrary.addRawOriginal(to: request, raw: rawURL, processed: url,
                rawFilename: URL(fileURLWithPath: resourceFilename).deletingPathExtension().lastPathComponent + ".dng",
                processedFilename: resourceFilename)
            } catch { journalError = error; return }
          } else {
            request.addResource(with: .photo, fileURL: url, options: resource)
          }
          if let date = job["createdAt"] as? String { request.creationDate = Self.captureDate(date) }
          let gps = job["exifData"] as? [String: Any] ?? [:]
          if gps["removeGPS"] as? Bool != true, let lat = gps["GPSLatitude"] as? Double, let lon = gps["GPSLongitude"] as? Double {
            request.location = CLLocation(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
              altitude: (gps["GPSAltitude"] as? NSNumber)?.doubleValue ?? 0,
              horizontalAccuracy: -1, verticalAccuracy: -1,
              timestamp: request.creationDate ?? Date())
          }

        }
        if let journalError { throw journalError }
        guard let placeholderID else { throw error("O Fotos não retornou o asset") }
        variants[index]["assetId"] = placeholderID
        job["variants"] = variants; try write(job, id: id)
      }
      guard let assetID = variants[index]["assetId"] as? String,
            let asset = PHAsset.fetchAssets(withLocalIdentifiers: [assetID], options: nil).firstObject else {
        throw error("Permita leitura da foto salva para organizar os álbuns HEIF+")
      }
      if job["rawPairEnabled"] as? Bool == true {
        variants[index]["rawPair"] = try RawPhotoLibrary.verifyPair(asset)
      }
      var titles = ["Komorebi"]
      if let project = job["projectAlbum"] as? String, !project.isEmpty, project != "Komorebi" { titles.append(project) }
      for title in titles {
        try checkExpiration()
        let options = PHFetchOptions(); options.predicate = NSPredicate(format: "title = %@", title)
        let album = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: options).firstObject
        try changes {
          let request = album.flatMap { PHAssetCollectionChangeRequest(for: $0) }
            ?? PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: title)
          request.addAssets([asset] as NSArray)
        }
      }
      variants[index]["organized"] = true; job["variants"] = variants
      try write(job, id: id)
    }
    job["state"] = "saved"; try write(job, id: id)
    return job
  }
}

// PhotoKit stores the two representations in the same asset.
enum RawPhotoLibrary {
  static func failure(_ message: String) -> NSError {
    NSError(domain: "RawPhotoLibrary", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  // Keep both files as original resources. A content-editing output would
  // instead turn the processed file into an edit of a RAW-only original.
  static func addRawOriginal(to request: PHAssetCreationRequest, raw: URL, processed: URL,
                            rawFilename: String, processedFilename: String) throws {
    guard let rawSource = CGImageSourceCreateWithURL(raw as CFURL, nil),
          let rawIdentifier = CGImageSourceGetType(rawSource) as String?,
          let rawType = UTType(rawIdentifier), rawType.conforms(to: .rawImage),
          let processedSource = CGImageSourceCreateWithURL(processed as CFURL, nil),
          let processedIdentifier = CGImageSourceGetType(processedSource) as String?,
          let processedType = UTType(processedIdentifier),
          processedType == .heic || processedType == .jpeg else {
      throw failure("Não foi possível identificar os dois originais da captura RAW")
    }
    let rawOptions = PHAssetResourceCreationOptions()
    rawOptions.originalFilename = rawFilename
    let processedOptions = PHAssetResourceCreationOptions()
    processedOptions.originalFilename = processedFilename
    if #available(iOS 26, *) {
      rawOptions.contentType = rawType
      processedOptions.contentType = processedType
    } else {
      rawOptions.uniformTypeIdentifier = rawIdentifier
      processedOptions.uniformTypeIdentifier = processedIdentifier
    }
    request.addResource(with: .photo, fileURL: raw, options: rawOptions)
    request.addResource(with: .alternatePhoto, fileURL: processed, options: processedOptions)
    // Apply the choice after both original resources have been registered.
    if #available(iOS 27, *) { request.originalResourceChoice = .raw }
  }

  // Validate what Photos actually imported, rather than assuming that the
  // resource roles or a badge in another app reflect the two source files.
  static func verifyPair(_ asset: PHAsset) throws -> [String: Any] {
    let originals = PHAssetResource.assetResources(for: asset).filter {
      $0.type == .photo || $0.type == .alternatePhoto
    }
    let raw = originals.first { UTType($0.uniformTypeIdentifier)?.conforms(to: .rawImage) == true }
    let processed = originals.first {
      let type = UTType($0.uniformTypeIdentifier)
      return type == .heic || type == .jpeg
    }
    guard originals.count == 2, let raw, let processed else {
      throw failure("O Fotos não preservou o RAW e a foto processada como dois originais associados")
    }
    var result: [String: Any] = [
      "verified": true,
      "rawResourceType": raw.type.rawValue,
      "processedResourceType": processed.type.rawValue,
      "processedContentType": processed.uniformTypeIdentifier,
      "iosVersion": ProcessInfo.processInfo.operatingSystemVersionString,
      "resourceOrder": originals.map { resource -> [String: Any] in
        ["role": resource.type == .photo ? "photo" : "alternatePhoto",
         "contentType": resource.uniformTypeIdentifier,
         "isRaw": UTType(resource.uniformTypeIdentifier)?.conforms(to: .rawImage) == true]
      },
    ]
    if #available(iOS 27, *) {
      result["rawIsOriginal"] = asset.originalResourceChoice == .raw
    }
    let diagnostic = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    NSLog("[Komorebi RAW pair] %@", String(decoding: diagnostic, as: UTF8.self))
    if #available(iOS 27, *), asset.originalResourceChoice != .raw {
      throw failure("O Fotos não selecionou o DNG como original do par; consulte o log [Komorebi RAW pair]")
    }
    return result
  }

  static func applyMetadata(_ metadata: [String: Any], to request: PHAssetCreationRequest) {
    if let text = metadata["createdAt"] as? String { request.creationDate = HeifPlusEngine.captureDate(text) }
    if metadata["removeGPS"] as? Bool != true,
       let lat = metadata["GPSLatitude"] as? Double, let lon = metadata["GPSLongitude"] as? Double {
      request.location = CLLocation(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
        altitude: (metadata["GPSAltitude"] as? NSNumber)?.doubleValue ?? 0,
        horizontalAccuracy: -1, verticalAccuracy: -1, timestamp: request.creationDate ?? Date())
    }
  }

  static func save(rawURI: String, processedURI: String, options: [String: Any]) throws -> [String: Any] {
    guard let raw = URL(string: rawURI), raw.isFileURL, raw.pathExtension.lowercased() == "dng",
          let processed = URL(string: processedURI), processed.isFileURL,
          FileManager.default.fileExists(atPath: raw.path), FileManager.default.fileExists(atPath: processed.path) else {
      throw failure("Arquivos RAW + foto processada indisponíveis")
    }
    guard let source = CGImageSourceCreateWithURL(processed as CFURL, nil),
          let type = CGImageSourceGetType(source) as String?,
          type == UTType.heic.identifier || type == UTType.jpeg.identifier else {
      throw failure("O companion do RAW deve ser HEIC ou JPEG")
    }
    let processedExtension = type == UTType.heic.identifier ? "heic" : "jpg"
    let filename = options["originalFilename"] as? String ?? "Komorebi-\(UUID().uuidString).dng"
    var titles = ["Komorebi"]
    if let project = options["projectAlbum"] as? String, !project.isEmpty, project != "Komorebi" { titles.append(project) }
    let albums = titles.map { title -> PHAssetCollection? in
      let query = PHFetchOptions(); query.predicate = NSPredicate(format: "title = %@", title)
      return PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: query).firstObject
    }
    var identifier: String?
    var saveError: Error?
    let semaphore = DispatchSemaphore(value: 0)
    PHPhotoLibrary.shared().performChanges({
      let request = PHAssetCreationRequest.forAsset()
      do {
        try addRawOriginal(to: request, raw: raw, processed: processed, rawFilename: filename,
          processedFilename: URL(fileURLWithPath: filename).deletingPathExtension().lastPathComponent + "." + processedExtension)
      } catch { saveError = error; return }
      applyMetadata(options["metadata"] as? [String: Any] ?? [:], to: request)
      if let placeholder = request.placeholderForCreatedAsset {
        identifier = placeholder.localIdentifier
        for (index, title) in titles.enumerated() {
          let albumRequest = albums[index].flatMap { PHAssetCollectionChangeRequest(for: $0) }
            ?? PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: title)
          albumRequest.addAssets([placeholder] as NSArray)
        }
      }
    }) { success, error in
      if !success && saveError == nil { saveError = error ?? failure("Falha ao salvar RAW + foto processada") }
      semaphore.signal()
    }
    semaphore.wait()
    if let saveError { throw saveError }
    guard let identifier else { throw failure("O Fotos não retornou a foto RAW + processada") }
    guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil).firstObject else {
      throw failure("Permita acesso à foto salva para verificar o par RAW")
    }
    let pair = try verifyPair(asset)
    return ["id": identifier, "localIdentifier": identifier, "rawPair": pair]
  }
}
