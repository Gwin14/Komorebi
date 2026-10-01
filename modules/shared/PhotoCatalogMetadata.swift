import Foundation
import ImageIO

// Compiled into each image-writing module so all capture modes use the same schema.
enum PhotoCatalogMetadata {
  static func make(_ fields: [String: Any], source: CGImageSource) throws -> CGMutableImageMetadata {
    let metadata = CGImageSourceCopyMetadataAtIndex(source, 0, nil)
      .flatMap { CGImageMetadataCreateMutableCopy($0) } ?? CGImageMetadataCreateMutable()
    let dc = "http://purl.org/dc/elements/1.1/" as CFString
    let xmp = "http://ns.adobe.com/xap/1.0/" as CFString
    CGImageMetadataRegisterNamespaceForPrefix(metadata, dc, "dc" as CFString, nil)
    CGImageMetadataRegisterNamespaceForPrefix(metadata, xmp, "xmp" as CFString, nil)
    func set(_ namespace: CFString, _ prefix: String, _ name: String, _ type: CGImageMetadataType, _ value: CFTypeRef) throws {
      guard let tag = CGImageMetadataTagCreate(namespace, prefix as CFString, name as CFString, type, value),
            CGImageMetadataSetTagWithPath(metadata, nil, "\(prefix):\(name)" as CFString, tag) else {
        throw NSError(domain: "PhotoCatalogMetadata", code: 1)
      }
    }
    if let author = fields["author"] as? String, !author.isEmpty {
      guard CGImageMetadataSetValueMatchingImageProperty(metadata, kCGImagePropertyIPTCDictionary, kCGImagePropertyIPTCByline, [author] as CFArray) else { throw NSError(domain: "PhotoCatalogMetadata", code: 2) }
      try set(dc, "dc", "creator", .arrayOrdered, [author] as CFArray)
    }
    if let copyright = fields["copyright"] as? String, !copyright.isEmpty {
      guard CGImageMetadataSetValueMatchingImageProperty(metadata, kCGImagePropertyIPTCDictionary, kCGImagePropertyIPTCCopyrightNotice, copyright as CFString) else { throw NSError(domain: "PhotoCatalogMetadata", code: 3) }
      // ImageIO creates dc:rights as an rdf:Alt with x-default via the IPTC mapping.
    }
    if let tags = fields["tags"] as? [String], !tags.isEmpty {
      guard CGImageMetadataSetValueMatchingImageProperty(metadata, kCGImagePropertyIPTCDictionary, kCGImagePropertyIPTCKeywords, tags as CFArray) else { throw NSError(domain: "PhotoCatalogMetadata", code: 4) }
      try set(dc, "dc", "subject", .arrayUnordered, tags as CFArray)
    }
    if let rating = fields["rating"] as? NSNumber {
      guard (0...5).contains(rating.intValue), rating.doubleValue == Double(rating.intValue) else { throw NSError(domain: "PhotoCatalogMetadata", code: 5) }
      try set(xmp, "xmp", "Rating", .string, rating.stringValue as CFString)
    }
    return metadata
  }

  static func write(from input: URL, to output: URL, fields: [String: Any]) throws {
    guard let source = CGImageSourceCreateWithURL(input as CFURL, nil),
          let type = CGImageSourceGetType(source),
          let destination = CGImageDestinationCreateWithURL(output as CFURL, type, CGImageSourceGetCount(source), nil) else {
      throw NSError(domain: "PhotoCatalogMetadata", code: 6)
    }
    let metadata = try make(fields, source: source)
    let options: [CFString: Any] = [kCGImageDestinationMetadata: metadata, kCGImageDestinationMergeMetadata: true]
    var error: Unmanaged<CFError>?
    guard CGImageDestinationCopyImageSource(destination, source, options as CFDictionary, &error) else {
      try? FileManager.default.removeItem(at: output)
      throw error?.takeRetainedValue() ?? NSError(domain: "PhotoCatalogMetadata", code: 7) as CFError
    }
    // CopyImageSource finalizes the destination itself; do not finalize again.
  }

  static func apply(to url: URL, metadata: [String: Any]?) throws {
    guard let fields = metadata?["catalogMetadata"] as? [String: Any], !fields.isEmpty else { return }
    let temporary = url.deletingLastPathComponent().appendingPathComponent("metadata-\(UUID().uuidString).\(url.pathExtension)")
    defer { try? FileManager.default.removeItem(at: temporary) }
    try write(from: url, to: temporary, fields: fields)
    _ = try FileManager.default.replaceItemAt(url, withItemAt: temporary)
  }
}
