import ExpoModulesCore
import Foundation
import ImageIO
import CoreLocation
import Photos

public final class CameraPhotographicStylesModule: Module {
  enum CompatibilityError: Error, LocalizedError {
    case unsupported
    case invalidURL
    case invalidImage
    case metadataWriteFailed

    var errorDescription: String? {
      switch self {
      case .unsupported: return "Este dispositivo não oferece codificação HEVC compatível."
      case .invalidURL: return "O caminho da foto é inválido."
      case .invalidImage: return "A imagem não pôde ser aberta para preservar os metadados."
      case .metadataWriteFailed: return "Os metadados da captura não puderam ser preservados."
      }
    }
  }

  public func definition() -> ModuleDefinition {
    Name("CameraPhotographicStyles")

    Function("isSupported") { () -> Bool in
      VideoToolboxHEVCEncoder.isSupported
    }

    AsyncFunction("makeCompatible") { (
      photoUri: String,
      options: [String: Any]?
    ) async throws -> [String: Any] in
      guard VideoToolboxHEVCEncoder.isSupported else { throw CompatibilityError.unsupported }
      guard let inputURL = Self.fileURL(from: photoUri) else { throw CompatibilityError.invalidURL }

      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("komorebi-styles-\(UUID().uuidString)")
        .appendingPathExtension("heic")

      let metadata = options?["metadata"] as? [String: Any]
      let metadataSourceURL = (options?["metadataSourceUri"] as? String)
        .flatMap { Self.fileURL(from: $0) }

      return try await Task.detached(priority: .userInitiated) {
        let preparedInputURL = try Self.prepareInput(
          inputURL,
          metadata: metadata,
          metadataSourceURL: metadataSourceURL
        )
        defer {
          if preparedInputURL != inputURL {
            try? FileManager.default.removeItem(at: preparedInputURL)
          }
        }

        do {
          try XDRemuxBridge.makeCompatible(
            from: preparedInputURL.path,
            to: outputURL.path
          )
          return ["photoUri": outputURL.absoluteString, "verified": true]
        } catch {
          try? FileManager.default.removeItem(at: outputURL)
          throw error
        }
      }.value
    }

    AsyncFunction("updateAssetMetadata") { (
      localIdentifier: String,
      options: [String: Any]?
    ) async throws -> Bool in
      let metadata = options?["metadata"] as? [String: Any]
      let metadataSourceURL = (options?["metadataSourceUri"] as? String)
        .flatMap { Self.fileURL(from: $0) }
      return try await Self.updateAssetMetadata(
        localIdentifier: localIdentifier,
        metadata: metadata,
        metadataSourceURL: metadataSourceURL
      )
    }

    AsyncFunction("deleteTemporaryPhoto") { (photoUri: String) throws -> Bool in
      guard let fileURL = Self.fileURL(from: photoUri) else {
        throw CompatibilityError.invalidURL
      }
      let candidate = fileURL.standardizedFileURL
      let temporaryDirectory = FileManager.default.temporaryDirectory.standardizedFileURL
      guard candidate.deletingLastPathComponent() == temporaryDirectory,
            candidate.lastPathComponent.hasPrefix("komorebi-styles-"),
            candidate.pathExtension.lowercased() == "heic" else {
        throw CompatibilityError.invalidURL
      }
      guard FileManager.default.fileExists(atPath: candidate.path) else {
        return true
      }
      try FileManager.default.removeItem(at: candidate)
      return true
    }
  }

  private static func fileURL(from value: String) -> URL? {
    if value.hasPrefix("file://") { return URL(string: value) }
    guard value.hasPrefix("/") else { return nil }
    return URL(fileURLWithPath: value)
  }

  private static func prepareInput(
    _ inputURL: URL,
    metadata: [String: Any]?,
    metadataSourceURL: URL?
  ) throws -> URL {
    guard let source = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
          CGImageSourceGetCount(source) > 0,
          let sourceType = CGImageSourceGetType(source) else {
      throw CompatibilityError.invalidImage
    }

    var properties =
      CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]
    let captureProperties = imageProperties(at: metadataSourceURL) ?? [:]
    var tiff = captureProperties[kCGImagePropertyTIFFDictionary]
      as? [CFString: Any] ?? [:]
    var exif = captureProperties[kCGImagePropertyExifDictionary]
      as? [CFString: Any] ?? [:]
    var gps = captureProperties[kCGImagePropertyGPSDictionary]
      as? [CFString: Any] ?? [:]
    if let inputTiff = properties[kCGImagePropertyTIFFDictionary]
      as? [CFString: Any] {
      tiff.merge(inputTiff) { _, inputValue in inputValue }
    }
    if let inputExif = properties[kCGImagePropertyExifDictionary]
      as? [CFString: Any] {
      exif.merge(inputExif) { _, inputValue in inputValue }
    }
    if let inputGPS = properties[kCGImagePropertyGPSDictionary]
      as? [CFString: Any] {
      gps.merge(inputGPS) { _, inputValue in inputValue }
    }
    let metadata = metadata ?? [:]

    assignString(metadata, "Make", to: &tiff, key: kCGImagePropertyTIFFMake)
    assignString(metadata, "Model", to: &tiff, key: kCGImagePropertyTIFFModel)
    assignString(metadata, "DateTime", to: &tiff, key: kCGImagePropertyTIFFDateTime)
    tiff[kCGImagePropertyTIFFSoftware] = "Komorebi"

    assignString(metadata, "DateTimeOriginal", to: &exif, key: kCGImagePropertyExifDateTimeOriginal)
    assignString(metadata, "DateTimeDigitized", to: &exif, key: kCGImagePropertyExifDateTimeDigitized)
    assignString(metadata, "SubSecTimeOriginal", to: &exif, key: kCGImagePropertyExifSubsecTimeOriginal)
    assignString(metadata, "SubSecTimeDigitized", to: &exif, key: kCGImagePropertyExifSubsecTimeDigitized)
    assignString(metadata, "LensMake", to: &exif, key: kCGImagePropertyExifLensMake)
    assignString(metadata, "LensModel", to: &exif, key: kCGImagePropertyExifLensModel)
    assignNumber(metadata, "ExposureTime", to: &exif, key: kCGImagePropertyExifExposureTime)
    assignNumber(metadata, "FNumber", to: &exif, key: kCGImagePropertyExifFNumber)
    assignNumber(metadata, "FocalLength", to: &exif, key: kCGImagePropertyExifFocalLength)
    assignNumber(metadata, "ExposureMode", to: &exif, key: kCGImagePropertyExifExposureMode)
    assignNumber(metadata, "ExposureProgram", to: &exif, key: kCGImagePropertyExifExposureProgram)
    assignNumber(metadata, "WhiteBalance", to: &exif, key: kCGImagePropertyExifWhiteBalance)
    assignNumber(metadata, "Flash", to: &exif, key: kCGImagePropertyExifFlash)
    assignNumber(metadata, "MeteringMode", to: &exif, key: kCGImagePropertyExifMeteringMode)
    if let iso = number(metadata["ISO"]) {
      exif[kCGImagePropertyExifISOSpeedRatings] = [iso]
    }

    if metadata["removeGPS"] as? Bool == true {
      gps.removeAll()
    } else if let latitude = number(metadata["GPSLatitude"]),
              let longitude = number(metadata["GPSLongitude"]) {
      gps[kCGImagePropertyGPSLatitude] = abs(latitude.doubleValue)
      gps[kCGImagePropertyGPSLatitudeRef] = latitude.doubleValue >= 0 ? "N" : "S"
      gps[kCGImagePropertyGPSLongitude] = abs(longitude.doubleValue)
      gps[kCGImagePropertyGPSLongitudeRef] = longitude.doubleValue >= 0 ? "E" : "W"
      if let altitude = number(metadata["GPSAltitude"]) {
        gps[kCGImagePropertyGPSAltitude] = abs(altitude.doubleValue)
        gps[kCGImagePropertyGPSAltitudeRef] = altitude.doubleValue >= 0 ? 0 : 1
      }
    }

    properties[kCGImagePropertyTIFFDictionary] = tiff
    properties[kCGImagePropertyExifDictionary] = exif
    properties[kCGImagePropertyGPSDictionary] = gps
    properties[kCGImagePropertyOrientation] = 1

    let fileExtension = inputURL.pathExtension.isEmpty ? "img" : inputURL.pathExtension
    let preparedURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("komorebi-styles-metadata-\(UUID().uuidString)")
      .appendingPathExtension(fileExtension)
    guard let destination = CGImageDestinationCreateWithURL(
      preparedURL as CFURL,
      sourceType,
      1,
      nil
    ) else {
      throw CompatibilityError.metadataWriteFailed
    }

    CGImageDestinationAddImageFromSource(
      destination,
      source,
      0,
      properties as CFDictionary
    )
    guard CGImageDestinationFinalize(destination) else {
      try? FileManager.default.removeItem(at: preparedURL)
      throw CompatibilityError.metadataWriteFailed
    }
    return preparedURL
  }

  private static func imageProperties(at url: URL?) -> [CFString: Any]? {
    guard let url,
          let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          CGImageSourceGetCount(source) > 0 else {
      return nil
    }
    return CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
  }

  private static func updateAssetMetadata(
    localIdentifier: String,
    metadata: [String: Any]?,
    metadataSourceURL: URL?
  ) async throws -> Bool {
    let normalizedIdentifier = localIdentifier.hasPrefix("ph://")
      ? String(localIdentifier.dropFirst(5))
      : localIdentifier
    let fetchResult = PHAsset.fetchAssets(
      withLocalIdentifiers: [normalizedIdentifier],
      options: nil
    )
    guard let asset = fetchResult.firstObject else { return false }

    let sourceProperties = imageProperties(at: metadataSourceURL) ?? [:]
    let sourceExif = sourceProperties[kCGImagePropertyExifDictionary]
      as? [CFString: Any] ?? [:]
    let sourceTiff = sourceProperties[kCGImagePropertyTIFFDictionary]
      as? [CFString: Any] ?? [:]
    let sourceGPS = sourceProperties[kCGImagePropertyGPSDictionary]
      as? [CFString: Any] ?? [:]
    let metadata = metadata ?? [:]
    let location = resolvedLocation(metadata: metadata, sourceGPS: sourceGPS)
    let creationDate = resolvedCreationDate(
      metadata: metadata,
      sourceExif: sourceExif,
      sourceTiff: sourceTiff
    )

    try await withCheckedThrowingContinuation {
      (continuation: CheckedContinuation<Void, Error>) in
      PHPhotoLibrary.shared().performChanges {
        let request = PHAssetChangeRequest(for: asset)
        request.location = location
        if let creationDate {
          request.creationDate = creationDate
        }
      } completionHandler: { success, error in
        if let error {
          continuation.resume(throwing: error)
        } else if success {
          continuation.resume(returning: ())
        } else {
          continuation.resume(throwing: CompatibilityError.metadataWriteFailed)
        }
      }
    }
    return true
  }

  private static func resolvedLocation(
    metadata: [String: Any],
    sourceGPS: [CFString: Any]
  ) -> CLLocation? {
    if metadata["removeGPS"] as? Bool == true { return nil }

    let latitude = number(metadata["GPSLatitude"])
      ?? number(sourceGPS[kCGImagePropertyGPSLatitude])
    let longitude = number(metadata["GPSLongitude"])
      ?? number(sourceGPS[kCGImagePropertyGPSLongitude])
    guard let latitude, let longitude else { return nil }

    let latitudeRef = sourceGPS[kCGImagePropertyGPSLatitudeRef] as? String
    let longitudeRef = sourceGPS[kCGImagePropertyGPSLongitudeRef] as? String
    let signedLatitude = latitudeRef == "S"
      ? -abs(latitude.doubleValue)
      : latitude.doubleValue
    let signedLongitude = longitudeRef == "W"
      ? -abs(longitude.doubleValue)
      : longitude.doubleValue
    let altitude = number(metadata["GPSAltitude"])
      ?? number(sourceGPS[kCGImagePropertyGPSAltitude])

    return CLLocation(
      coordinate: CLLocationCoordinate2D(
        latitude: signedLatitude,
        longitude: signedLongitude
      ),
      altitude: altitude?.doubleValue ?? 0,
      horizontalAccuracy: -1,
      verticalAccuracy: -1,
      timestamp: Date()
    )
  }

  private static func resolvedCreationDate(
    metadata: [String: Any],
    sourceExif: [CFString: Any],
    sourceTiff: [CFString: Any]
  ) -> Date? {
    let value = metadata["DateTimeOriginal"] as? String
      ?? metadata["DateTime"] as? String
      ?? sourceExif[kCGImagePropertyExifDateTimeOriginal] as? String
      ?? sourceTiff[kCGImagePropertyTIFFDateTime] as? String
    guard let value else { return nil }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy:MM:dd HH:mm:ss"
    return formatter.date(from: value)
  }

  private static func assignString(
    _ source: [String: Any],
    _ sourceKey: String,
    to destination: inout [CFString: Any],
    key: CFString
  ) {
    if let value = source[sourceKey] as? String, !value.isEmpty {
      destination[key] = value
    }
  }

  private static func assignNumber(
    _ source: [String: Any],
    _ sourceKey: String,
    to destination: inout [CFString: Any],
    key: CFString
  ) {
    if let value = number(source[sourceKey]) {
      destination[key] = value
    }
  }

  private static func number(_ value: Any?) -> NSNumber? {
    if let value = value as? NSNumber { return value }
    if let value = value as? Double { return NSNumber(value: value) }
    if let value = value as? Int { return NSNumber(value: value) }
    return nil
  }
}
