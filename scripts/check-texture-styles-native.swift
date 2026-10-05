import Foundation
import ImageIO
import CoreGraphics

@main
struct TextureStylesCheck {
  static func main() throws {
    let pixels = Data([80, 120, 180, 255])
    let image = CGImage(width: 1, height: 1, bitsPerComponent: 8, bitsPerPixel: 32,
      bytesPerRow: 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
      provider: CGDataProvider(data: pixels as CFData)!, decode: nil,
      shouldInterpolate: false, intent: .defaultIntent)!
    let jpeg = NSMutableData()
    let destination = CGImageDestinationCreateWithData(jpeg, "public.jpeg" as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    precondition(CGImageDestinationFinalize(destination))
    let source = CGImageSourceCreateWithData(jpeg, nil)!
    let original = Data("""
      <x:xmpmeta xmlns:x="adobe:ns:meta/">
        <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
          <rdf:Description rdf:about="" xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"
            hdrgm:Version="1.0" hdrgm:GainMapMax="1.5"/>
        </rdf:RDF>
      </x:xmpmeta>
      """.utf8)
    let catalog = try TextureStylesMetadata.catalogPayload(
      fields: ["author": "Teste Komorebi", "copyright": "Autoria", "tags": ["gato", "janela"], "rating": 4],
      source: source, originalXMP: original
    )
    let originalText = String(data: original, encoding: .utf8)!
    let mergedText = String(data: catalog, encoding: .utf8)!
    let marker = originalText.range(of: "</rdf:RDF>")!
    precondition(mergedText.hasPrefix(String(originalText[..<marker.lowerBound])))
    precondition(mergedText.hasSuffix(String(originalText[marker.lowerBound...])))
    let catalogMetadata = CGImageMetadataCreateFromXMPData(catalog as CFData)!
    func value(_ path: String) -> String? {
      CGImageMetadataCopyStringValueWithPath(catalogMetadata, nil, path as CFString) as String?
    }
    precondition(value("hdrgm:Version") == "1.0")
    precondition(value("hdrgm:GainMapMax") == "1.5")
    precondition(value("dc:creator[0]") == "Teste Komorebi")
    precondition(value("dc:subject[0]") == "gato")
    precondition(value("dc:subject[1]") == "janela")
    precondition(value("xmp:Rating") == "4")
    print("Catalog XMP preserves HDR values while adding author, tags and rating.")
    for position in ["back", "front"] {
      let data = try TextureStylesMetadata.payload(
        hardwareModel: "iPhone19,2", cameraPosition: position, grainSeed: UInt32.max
      )
      precondition(data.starts(with: Data("bplist00".utf8)))
      let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as! [String: Any]
      precondition(plist["Preset"] as? String == "Standard")
      precondition(plist["CaptureType"] as? String == "LF")
      precondition(plist["CaptureMode"] as? String == "Still")
      precondition(plist["HardwareModel"] as? String == "iPhone19,2")
      precondition(plist["PortType"] as? String == (position == "front" ? "PortTypeFront" : "PortTypeBack"))
      precondition(plist["TextureStylePeopleDataVersion"] as? Int == 3)
      precondition((plist["FilmGrainSeed"] as? NSNumber)?.uint32Value == UInt32.max)
    }
    let generated = try TextureStylesMetadata.make(cameraPosition: "back")
    let actual = try PropertyListSerialization.propertyList(from: generated, format: nil) as! [String: Any]
    precondition(actual["HardwareModel"] as? String == "iPhone19,2")
    let temporary = FileManager.default.temporaryDirectory
    let uuid = UUID().uuidString
    for name in ["komorebi-styles-\(uuid).heic", "komorebi-\(uuid).heic", "komorebi-\(uuid).jpg"] {
      precondition(PhotographicStylesTemporaryFiles.canDelete(temporary.appendingPathComponent(name), in: temporary))
    }
    for file in [
      temporary.appendingPathComponent("capture.heic"),
      temporary.appendingPathComponent("komorebi-not-a-uuid.heic"),
      temporary.appendingPathComponent("komorebi-\(uuid).dng"),
      temporary.appendingPathComponent("subfolder/komorebi-\(uuid).heic"),
      URL(fileURLWithPath: "/komorebi-\(uuid).heic"),
    ] {
      precondition(!PhotographicStylesTemporaryFiles.canDelete(file, in: temporary))
    }
    print("Texture Styles binary plist verified for both cameras and the PS3 renderer profile.")
    print("Native temporary file cleanup accepts converted photos and rejects unrelated paths.")
  }
}
