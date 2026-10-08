import AVFoundation
import CoreImage
import Foundation
import ImageIO

enum PhotoDepthPortraitEncoding {
  struct Projection {
    let width: Int
    let height: Int
    let orientation: Int
    let intrinsic: [Double]
    let pixelSize: Double
    let distortionCenter: [Double]
  }

  // Nominal coordinates for the portrait renderer, NOT calibration measured
  // from the source camera. The map stays relative. EXIF focal equivalence
  // cannot reproduce the geometry required by this rendering profile (V failed
  // on device, while U/W with the reference profile rendered correctly).
  static func projection(_ source: CGImageSource) throws -> Projection {
    let index = CGImageSourceGetPrimaryImageIndex(source)
    let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [String: Any] ?? [:]
    guard let width = (properties[kCGImagePropertyPixelWidth as String] as? NSNumber)?.intValue,
          let height = (properties[kCGImagePropertyPixelHeight as String] as? NSNumber)?.intValue,
          width > 0, height > 0 else { throw PhotoDepthError.invalidImage }
    let orientation = (properties[kCGImagePropertyOrientation as String] as? NSNumber)?.intValue ?? 1
    guard (1...8).contains(orientation) else { throw PhotoDepthError.invalidImage }
    let portraitRaster = width < height
    let referenceWidth: Double = portraitRaster ? 3024 : 4032
    let referenceHeight: Double = portraitRaster ? 4032 : 3024
    let scaleX = Double(width) / referenceWidth
    let scaleY = Double(height) / referenceHeight
    let focal = 5707.25634765625
    let centerX = portraitRaster ? 3024 - 1515.758056640625 : 2060.586181640625
    let centerY = portraitRaster ? 2060.586181640625 : 1515.758056640625
    let distortionX = portraitRaster ? 3024 - 1549.145751953125 : 2054.03759765625
    let distortionY = portraitRaster ? 2054.03759765625 : 1549.145751953125
    return Projection(width: width, height: height, orientation: orientation,
      intrinsic: [focal * scaleX, 0, 0, 0, focal * scaleY, 0, centerX * scaleX, centerY * scaleY, 1],
      pixelSize: 0.00122 / max(scaleX, scaleY), distortionCenter: [distortionX * scaleX, distortionY * scaleY])
  }

  static func set(_ metadata: CGMutableImageMetadata, namespace: String, prefix: String, name: String, value: Any) throws {
    guard CGImageMetadataRegisterNamespaceForPrefix(metadata, namespace as CFString, prefix as CFString, nil),
          CGImageMetadataSetValueWithPath(metadata, nil, "\(prefix):\(name)" as CFString, value as CFTypeRef) else {
      throw PhotoDepthError.invalidImage
    }
  }

  static func auxiliary(source: CGImageSource, disparity: AVDepthData) throws -> CFDictionary {
    let projection = try projection(source)
    let map = CIImage(cvPixelBuffer: disparity.converting(toDepthDataType: kCVPixelFormatType_DisparityFloat32).depthDataMap)
    let scale = min(1, 768 / Double(max(projection.width, projection.height)))
    let width = max(1, Int((Double(projection.width) * scale).rounded()))
    let height = max(1, Int((Double(projection.height) * scale).rounded()))
    let resized = map.transformed(by: CGAffineTransform(scaleX: CGFloat(width) / map.extent.width, y: CGFloat(height) / map.extent.height))
    // Spatially smooth the dense estimate before declaring it filtered. No
    // captured-camera confidence or temporal filtering is claimed.
    let filtered = resized.clampedToExtent().applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 0.5]).cropped(to: resized.extent)
    var values = [Float](repeating: 0, count: width * height)
    values.withUnsafeMutableBytes {
      CIContext(options: [.cacheIntermediates: false]).render(filtered, toBitmap: $0.baseAddress!, rowBytes: width * 4,
        bounds: CGRect(x: 0, y: 0, width: width, height: height), format: .Lf, colorSpace: nil)
    }
    guard values.allSatisfy({ $0.isFinite }), let minimum = values.min(), let maximum = values.max(),
          maximum - minimum > 1e-6 else { throw PhotoDepthError.invalidImage }
    // Empirical rendering units verified with the Fusion reference, not meters.
    let low: Float = 0.01, high: Float = 1.3
    let normalized = values.map { ($0 - minimum) / (maximum - minimum) }
    let encoded = normalized.map { Float16(low + $0 * (high - low)) }
    let metadata = CGImageMetadataCreateMutable()
    let depthNS = "http://ns.apple.com/depthData/1.0/"
    let fields: [String: Any] = [
      "Accuracy": "relative", "Quality": "high", "Filtered": "True", "DepthDataVersion": 65541,
      "IntrinsicMatrixReferenceWidth": projection.width, "IntrinsicMatrixReferenceHeight": projection.height,
      "IntrinsicMatrix": projection.intrinsic as CFArray,
      "ExtrinsicMatrix": [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] as CFArray,
      "PixelSize": projection.pixelSize,
      "LensDistortionCenterOffsetX": projection.distortionCenter[0],
      "LensDistortionCenterOffsetY": projection.distortionCenter[1],
      "LensDistortionCoefficients": [0.0, -0.56268364191055298, 0.053848329931497574, -0.0018884948221966624,
        -2.8236941034265328e-06, 1.8178552636527456e-06, -4.1011123386169857e-08, 2.7056379359180482e-10] as CFArray,
      "InverseLensDistortionCoefficients": [0.0, 0.54808723926544189, -0.04969465360045433, 0.001599592505954206,
        7.3510432230250444e-06, -1.5942158597681555e-06, 3.227951594908518e-08, -1.8814419466828269e-10] as CFArray
    ]
    for (key, value) in fields { try set(metadata, namespace: depthNS, prefix: "depthData", name: key, value: value) }
    // 'high' is a producer classification of a dense, finite, nonconstant map,
    // not a statement of metric accuracy. Do not serialize unmeasured portrait
    // confidence as the AVDepthData default 0/false.
    let rendering = try PhotoDepthRenderingProfile.make()
    try set(metadata, namespace: "http://ns.apple.com/depthBlurEffect/1.0/", prefix: "depthBlurEffect",
      name: "RenderingParameters", value: rendering.base64EncodedString())
    try set(metadata, namespace: "http://ns.apple.com/depthBlurEffect/1.0/", prefix: "depthBlurEffect", name: "SimulatedAperture", value: "2.0")
    try set(metadata, namespace: "http://ns.apple.com/portraitLightingEffect/1.0/", prefix: "portraitLightingEffect", name: "EffectStrength", value: "0.480556")
    try set(metadata, namespace: "https://komorebi.app/ns/photo-depth/1.0/", prefix: "komorebiDepth", name: "Projection", value: "NominalPortraitRendererV1")
    try set(metadata, namespace: "https://komorebi.app/ns/photo-depth/1.0/", prefix: "komorebiDepth", name: "Source", value: "DepthAnythingV2SmallF16")
    try set(metadata, namespace: "https://komorebi.app/ns/photo-depth/1.0/", prefix: "komorebiDepth", name: "Filtering", value: "SpatialGaussian")
    let auxiliary: [String: Any] = [
      kCGImageAuxiliaryDataInfoData as String: encoded.withUnsafeBytes { Data($0) },
      kCGImageAuxiliaryDataInfoDataDescription as String: [
        kCGImagePropertyWidth as String: width, kCGImagePropertyHeight as String: height,
        kCGImagePropertyBytesPerRow as String: width * 2,
        kCGImagePropertyPixelFormat as String: kCVPixelFormatType_DisparityFloat16,
        kCGImagePropertyOrientation as String: projection.orientation
      ],
      kCGImageAuxiliaryDataInfoMetadata as String: metadata
    ]
    guard try AVDepthData(fromDictionaryRepresentation: auxiliary).cameraCalibrationData != nil else { throw PhotoDepthError.invalidImage }
    return auxiliary as CFDictionary
  }

  static func imageOptions(_ source: CGImageSource, index: Int) throws -> CFDictionary {
    let projection = try projection(source)
    let metadata = CGImageSourceCopyMetadataAtIndex(source, index, nil).flatMap(CGImageMetadataCreateMutableCopy) ?? CGImageMetadataCreateMutable()
    let focusWidth = projection.width < projection.height ? "0.317" : "0.158"
    let focusHeight = projection.width < projection.height ? "0.158" : "0.317"
    let xml = """
    <x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:mwg-rs="http://www.metadataworkinggroup.com/schemas/regions/" xmlns:stDim="http://ns.adobe.com/xap/1.0/sType/Dimensions#" xmlns:stArea="http://ns.adobe.com/xmp/sType/Area#"><mwg-rs:Regions rdf:parseType="Resource"><mwg-rs:AppliedToDimensions stDim:w="\(projection.width)" stDim:h="\(projection.height)" stDim:unit="pixel"/><mwg-rs:RegionList><rdf:Bag><rdf:li rdf:parseType="Resource"><mwg-rs:Type>Focus</mwg-rs:Type><mwg-rs:Area stArea:x="0.5" stArea:y="0.5" stArea:w="\(focusWidth)" stArea:h="\(focusHeight)" stArea:unit="normalized"/></rdf:li></rdf:Bag></mwg-rs:RegionList></mwg-rs:Regions></rdf:Description></rdf:RDF></x:xmpmeta>
    """
    guard let focus = CGImageMetadataCreateFromXMPData(Data(xml.utf8) as CFData),
          let region = CGImageMetadataCopyTagWithPath(focus, nil, "mwg-rs:Regions" as CFString) else { throw PhotoDepthError.invalidImage }
    let namespace = "http://www.metadataworkinggroup.com/schemas/regions/"
    // ImageIO uses local names inside structured values; the old slash paths
    // did not resolve RegionList and silently discarded existing face regions.
    let oldFields = CGImageMetadataCopyTagWithPath(metadata, nil, "mwg-rs:Regions" as CFString)
      .flatMap(CGImageMetadataTagCopyValue) as? [String: CGImageMetadataTag] ?? [:]
    let oldEntries = oldFields["RegionList"].flatMap(CGImageMetadataTagCopyValue) as? [CGImageMetadataTag] ?? []
    let preserved = oldEntries.filter { entry in
      let fields = CGImageMetadataTagCopyValue(entry) as? [String: CGImageMetadataTag] ?? [:]
      return fields["Type"].flatMap(CGImageMetadataTagCopyValue) as? String != "Focus"
    }
    guard var fields = CGImageMetadataTagCopyValue(region) as? [String: CGImageMetadataTag],
          let list = fields["RegionList"],
          let entries = CGImageMetadataTagCopyValue(list) as? [CGImageMetadataTag],
          let mergedList = CGImageMetadataTagCreate(namespace as CFString, "mwg-rs" as CFString, "RegionList" as CFString,
            .arrayUnordered, (preserved + entries) as CFArray) else { throw PhotoDepthError.invalidImage }
    for (name, value) in oldFields where name != "AppliedToDimensions" && name != "RegionList" { fields[name] = value }
    fields["RegionList"] = mergedList
    guard let merged = CGImageMetadataTagCreate(namespace as CFString, "mwg-rs" as CFString, "Regions" as CFString,
            .structure, fields as CFDictionary),
          CGImageMetadataRegisterNamespaceForPrefix(metadata, namespace as CFString, "mwg-rs" as CFString, nil),
          CGImageMetadataSetTagWithPath(metadata, nil, "mwg-rs:Regions" as CFString, merged) else { throw PhotoDepthError.invalidImage }
    let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [String: Any] ?? [:]
    var maker = properties[kCGImagePropertyMakerAppleDictionary as String] as? [String: Any] ?? [:]
    maker["31"] = ((maker["31"] as? NSNumber)?.intValue ?? 0) | 1
    return [kCGImageDestinationMetadata as String: metadata, kCGImagePropertyMakerAppleDictionary as String: maker] as CFDictionary
  }
}
