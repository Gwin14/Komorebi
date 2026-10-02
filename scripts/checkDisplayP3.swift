import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// swiftc modules/shared/PhotoCatalogMetadata.swift scripts/checkDisplayP3.swift -o /tmp/check-display-p3
@main
struct CheckDisplayP3 {
  static func main() throws {
    let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
    let context = CGContext(data: nil, width: 32, height: 32, bitsPerComponent: 8,
                            bytesPerRow: 128, space: sRGB,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.setFillColor(CGColor(colorSpace: sRGB, components: [1, 0, 0, 1])!)
    context.fill(CGRect(x: 0, y: 0, width: 32, height: 32))
    let input = context.makeImage()!
    let output = PhotoDisplayP3.convert(input)!
    precondition(output.colorSpace?.name == CGColorSpace.displayP3)
    // sRGB red becomes approximately (0.918, 0.200, 0.139) in Display P3.
    // Simply relabeling the original (1, 0, 0) would fail this check.
    let decoded = CGContext(data: nil, width: 32, height: 32, bitsPerComponent: 8,
                            bytesPerRow: 128, space: PhotoDisplayP3.colorSpace,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    decoded.draw(output, in: CGRect(x: 0, y: 0, width: 32, height: 32))
    let bytes = decoded.data!.assumingMemoryBound(to: UInt8.self)
    precondition(abs(Int(bytes[0]) - 234) < 4 && abs(Int(bytes[1]) - 51) < 4 && abs(Int(bytes[2]) - 35) < 4)
    precondition(PhotoDisplayP3.convert(output) === output, "P3 images should keep their original pixels and bit depth")

    for type in [UTType.jpeg, UTType.heic] {
      let url = FileManager.default.temporaryDirectory.appendingPathComponent("p3-check-\(UUID()).\(type.preferredFilenameExtension!)")
      defer { try? FileManager.default.removeItem(at: url) }
      var properties: [String: Any] = [
        kCGImagePropertyOrientation as String: 6,
        kCGImagePropertyProfileName as String: "sRGB IEC61966-2.1",
        kCGImagePropertyExifDictionary as String: [kCGImagePropertyExifColorSpace as String: 1],
        kCGImageDestinationLossyCompressionQuality as String: 0.95
      ]
      PhotoDisplayP3.apply(to: &properties)
      let destination = CGImageDestinationCreateWithURL(url as CFURL, type.identifier as CFString, 1, nil)!
      CGImageDestinationAddImage(destination, output, properties as CFDictionary)
      precondition(CGImageDestinationFinalize(destination), "Encoding failed: \(type)")
      let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
      let saved = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)! as NSDictionary
      precondition(saved[kCGImagePropertyProfileName] as? String == "Display P3", "Missing P3 ICC profile: \(saved)")
      precondition(saved[kCGImagePropertyOrientation] as? Int == 6)
      let exif = saved[kCGImagePropertyExifDictionary] as! NSDictionary
      // ImageIO omits the uncalibrated flag in JPEG but keeps it in HEIC.
      let exifColorSpace = exif[kCGImagePropertyExifColorSpace] as? Int
      precondition(exifColorSpace == nil || exifColorSpace == 65535, "P3 must not be tagged as sRGB")
      print("\(type.identifier): Display P3 ICC, EXIF and orientation verified")
    }
    print("sRGB → Display P3 pixel conversion verified")
  }
}
