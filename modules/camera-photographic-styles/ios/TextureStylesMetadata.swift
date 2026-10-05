import Foundation
import ImageIO

enum TextureStylesMetadata {
  static func catalogPayload(fields: [String: Any], source: CGImageSource, originalXMP: Data) throws -> Data {
    // Serialize only new catalog fields. Leave the HDR packet's spelling,
    // numeric vectors, namespaces and processing instructions untouched.
    let metadata = try PhotoCatalogMetadata.make(fields, source: source, baseMetadata: CGImageMetadataCreateMutable())
    guard let packet = CGImageMetadataCreateXMPData(metadata, nil),
          let catalog = String(data: packet as Data, encoding: .utf8),
          let original = String(data: originalXMP, encoding: .utf8),
          let descriptionStart = catalog.range(of: "<rdf:Description"),
          let descriptionEnd = catalog.range(of: "</rdf:Description>", range: descriptionStart.lowerBound..<catalog.endIndex),
          let insertion = original.range(of: "</rdf:RDF>") else {
      throw NSError(domain: "CameraPhotographicStyles", code: 8,
        userInfo: [NSLocalizedDescriptionKey: "O catálogo da foto não pôde ser incorporado ao XMP HDR."])
    }
    let description = catalog[descriptionStart.lowerBound..<descriptionEnd.upperBound]
    var merged = original
    merged.insert(contentsOf: "\n" + description + "\n", at: insertion.lowerBound)
    let result = Data(merged.utf8)
    guard CGImageMetadataCreateFromXMPData(result as CFData) != nil else {
      throw NSError(domain: "CameraPhotographicStyles", code: 7,
        userInfo: [NSLocalizedDescriptionKey: "Os metadados HDR da foto são inválidos."])
    }
    return result
  }

  // Fields observed in the supplied HEIF analysis, not a public Apple API.
  // Match the renderer profile in the supplied working PS3 reference.
  // The actual capture device remains recorded separately in EXIF.
  static func make(cameraPosition: String) throws -> Data {
    try payload(
      hardwareModel: "iPhone19,2",
      cameraPosition: cameraPosition,
      grainSeed: UInt32.random(in: 0...UInt32.max)
    )
  }

  static func payload(
    hardwareModel: String,
    cameraPosition: String,
    grainSeed: UInt32
  ) throws -> Data {
    try PropertyListSerialization.data(fromPropertyList: [
      "Preset": "Standard",
      "CaptureType": "LF",
      "CaptureMode": "Still",
      "PortType": cameraPosition == "front" ? "PortTypeFront" : "PortTypeBack",
      "HardwareModel": hardwareModel,
      "TextureStylePeopleDataVersion": 3,
      "FilmGrainSeed": NSNumber(value: grainSeed),
    ], format: .binary, options: 0)
  }


}

enum PhotographicStylesTemporaryFiles {
  static func canDelete(_ file: URL, in directory: URL) -> Bool {
    let candidate = file.standardizedFileURL.resolvingSymlinksInPath()
    let directory = directory.standardizedFileURL.resolvingSymlinksInPath()
    let name = candidate.deletingPathExtension().lastPathComponent
    let isStylesFile = name.hasPrefix("komorebi-styles-")
      && candidate.pathExtension.lowercased() == "heic"
    let isConvertedFile = name.hasPrefix("komorebi-")
      && UUID(uuidString: String(name.dropFirst("komorebi-".count))) != nil
      && ["heic", "jpg", "jpeg"].contains(candidate.pathExtension.lowercased())
    return candidate.deletingLastPathComponent() == directory
      && (isStylesFile || isConvertedFile)
  }
}
