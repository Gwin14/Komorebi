import AVFoundation
import Foundation
import CoreImage
import CoreML
import ImageIO
import UniformTypeIdentifiers

final class PhotoDepthBundleMarker: NSObject {}

enum PhotoDepthEngine {
  static let depthTypes = [kCGImageAuxiliaryDataTypeDisparity, kCGImageAuxiliaryDataTypeDepth]
  static var preservedAuxiliaryTypes: [CFString] {
    var types = [
      kCGImageAuxiliaryDataTypeHDRGainMap,
      kCGImageAuxiliaryDataTypePortraitEffectsMatte,
      kCGImageAuxiliaryDataTypeSemanticSegmentationSkinMatte,
      kCGImageAuxiliaryDataTypeSemanticSegmentationHairMatte,
      kCGImageAuxiliaryDataTypeSemanticSegmentationTeethMatte,
      kCGImageAuxiliaryDataTypeSemanticSegmentationGlassesMatte,
      kCGImageAuxiliaryDataTypeSemanticSegmentationSkyMatte,
    ]
    if #available(iOS 18, macOS 15, *) { types.append(kCGImageAuxiliaryDataTypeISOGainMap) }
    return types
  }

  static func source(_ url: URL) throws -> CGImageSource {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let type = CGImageSourceGetType(source),
          [UTType.jpeg.identifier, UTType.heic.identifier].contains(type as String) else {
      throw PhotoDepthError.invalidImage
    }
    return source
  }

  static func hasDepth(_ source: CGImageSource) -> Bool {
    depthTypes.contains {
      CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, CGImageSourceGetPrimaryImageIndex(source), $0) != nil
    }
  }

  static func loadModel() throws -> MLModel {
    let framework = Bundle(for: PhotoDepthBundleMarker.self)
    let bundle = framework.url(forResource: "CameraPhotoDepth", withExtension: "bundle")
      .flatMap { Bundle(url: $0) } ?? framework
    guard let url = bundle.url(forResource: "DepthAnythingV2SmallF16", withExtension: "mlmodelc") else {
      throw PhotoDepthError.modelMissing
    }
    let configuration = MLModelConfiguration()
    configuration.computeUnits = .all
    return try MLModel(contentsOf: url, configuration: configuration)
  }

  // Work in upright coordinates for inference, then rotate the map back to the
  // stored raster. The primary image and its EXIF orientation are never rotated.
  static func disparity(source: CGImageSource, model: MLModel, checkCancellation: () throws -> Void) throws -> AVDepthData {
    let index = CGImageSourceGetPrimaryImageIndex(source)
    guard let cgImage = CGImageSourceCreateImageAtIndex(source, index, nil),
          let constraint = model.modelDescription.inputDescriptionsByName["image"]?.imageConstraint else {
      throw PhotoDepthError.invalidImage
    }
    let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [String: Any] ?? [:]
    let orientation = (properties[kCGImagePropertyOrientation as String] as? NSNumber)?.int32Value ?? 1
    guard (1...8).contains(orientation) else { throw PhotoDepthError.invalidImage }
    let upright = CIImage(cgImage: cgImage).oriented(forExifOrientation: orientation)
    let image = upright.transformed(by: CGAffineTransform(translationX: -upright.extent.minX, y: -upright.extent.minY))
    var buffer: CVPixelBuffer?
    guard CVPixelBufferCreate(kCFAllocatorDefault, constraint.pixelsWide, constraint.pixelsHigh, kCVPixelFormatType_32BGRA,
      [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &buffer) == kCVReturnSuccess, let buffer else {
      throw PhotoDepthError.invalidImage
    }
    let context = CIContext(options: [.cacheIntermediates: false])
    let resized = image.transformed(by: CGAffineTransform(scaleX: CGFloat(constraint.pixelsWide) / image.extent.width, y: CGFloat(constraint.pixelsHigh) / image.extent.height))
    context.render(resized, to: buffer, bounds: resized.extent, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
    try checkCancellation()
    let input = try MLDictionaryFeatureProvider(dictionary: ["image": MLFeatureValue(pixelBuffer: buffer)])
    let output = try model.prediction(from: input)
    try checkCancellation()
    guard let map = output.featureValue(for: "depth")?.imageBufferValue else { throw PhotoDepthError.invalidImage }
    let estimated = CIImage(cvPixelBuffer: map)
    let scale = min(1, 768 / max(image.extent.width, image.extent.height))
    let uprightWidth = max(1, Int((image.extent.width * scale).rounded()))
    let uprightHeight = max(1, Int((image.extent.height * scale).rounded()))
    let scaled = estimated.transformed(by: CGAffineTransform(scaleX: CGFloat(uprightWidth) / estimated.extent.width, y: CGFloat(uprightHeight) / estimated.extent.height))
    let inverse: [Int32: Int32] = [1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 8, 7: 7, 8: 6]
    let rotated = scaled.oriented(forExifOrientation: inverse[orientation]!)
    let aligned = rotated.transformed(by: CGAffineTransform(translationX: -rotated.extent.minX, y: -rotated.extent.minY))
    let width = Int(aligned.extent.width.rounded()), height = Int(aligned.extent.height.rounded())
    var values = [Float](repeating: 0, count: width * height)
    values.withUnsafeMutableBytes { bytes in
      context.render(aligned, toBitmap: bytes.baseAddress!, rowBytes: width * MemoryLayout<Float>.size, bounds: aligned.extent, format: .Lf, colorSpace: nil)
    }
    let finite = values.filter { $0.isFinite }
    guard finite.count == values.count, let minimum = finite.min(), let maximum = finite.max(), maximum - minimum > 1e-6 else {
      throw PhotoDepthError.invalidImage
    }
    // The checkpoint estimates relative inverse depth. No fabricated focal
    // length, baseline or absolute distance is attached to this synthetic map.
    for i in values.indices { values[i] = 0.01 + 0.99 * (values[i] - minimum) / (maximum - minimum) }
    let data = values.withUnsafeBytes { Data($0) }
    let info: [String: Any] = [
      kCGImageAuxiliaryDataInfoData as String: data,
      kCGImageAuxiliaryDataInfoDataDescription as String: [
        kCGImagePropertyWidth as String: width,
        kCGImagePropertyHeight as String: height,
        kCGImagePropertyBytesPerRow as String: width * MemoryLayout<Float>.size,
        kCGImagePropertyPixelFormat as String: kCVPixelFormatType_DisparityFloat32,
      ],
    ]
    let depth = try AVDepthData(fromDictionaryRepresentation: info)
    guard depth.depthDataAccuracy == .relative else { throw PhotoDepthError.invalidImage }
    return depth
  }

  static func write(source: CGImageSource, disparity: AVDepthData, to url: URL) throws {
    let auxiliary = try PhotoDepthPortraitEncoding.auxiliary(source: source, disparity: disparity)
    guard let type = CGImageSourceGetType(source),
          let destination = CGImageDestinationCreateWithURL(url as CFURL, type, CGImageSourceGetCount(source), nil) else {
      throw PhotoDepthError.invalidImage
    }
    let primary = CGImageSourceGetPrimaryImageIndex(source)
    if let properties = CGImageSourceCopyProperties(source, nil) {
      CGImageDestinationSetProperties(destination, properties)
    }
    for index in 0..<CGImageSourceGetCount(source) {
      let options = index == primary ? try PhotoDepthPortraitEncoding.imageOptions(source, index: index) : nil
      CGImageDestinationAddImageFromSource(destination, source, index, options)
      if index == primary {
        for type in preservedAuxiliaryTypes {
          if let auxiliary = CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, index, type) {
            CGImageDestinationAddAuxiliaryDataInfo(destination, type, auxiliary)
          }
        }
        CGImageDestinationAddAuxiliaryDataInfo(destination, kCGImageAuxiliaryDataTypeDisparity, auxiliary)
      }
    }
    guard CGImageDestinationFinalize(destination), hasDepth(try self.source(url)) else { throw PhotoDepthError.invalidImage }
    // AddImageFromSource accepts image properties, but does not serialize the
    // supplied XMP object. Merge it losslessly after embedding all auxiliaries.
    let rendered = try self.source(url)
    let options = try PhotoDepthPortraitEncoding.imageOptions(source, index: primary) as NSDictionary
    let temporary = url.deletingLastPathComponent().appendingPathComponent(UUID().uuidString + "." + url.pathExtension)
    defer { try? FileManager.default.removeItem(at: temporary) }
    guard let merged = CGImageDestinationCreateWithURL(temporary as CFURL, type, CGImageSourceGetCount(rendered), nil) else { throw PhotoDepthError.invalidImage }
    let mergeOptions: [CFString: Any] = [kCGImageDestinationMetadata: options[kCGImageDestinationMetadata]!, kCGImageDestinationMergeMetadata: true]
    var error: Unmanaged<CFError>?
    guard CGImageDestinationCopyImageSource(merged, rendered, mergeOptions as CFDictionary, &error) else {
      if let error { throw error.takeRetainedValue() }
      throw PhotoDepthError.invalidImage
    }
    _ = try FileManager.default.replaceItemAt(url, withItemAt: temporary)
    guard hasDepth(try self.source(url)) else { throw PhotoDepthError.invalidImage }
  }

  static func rating(_ url: URL) -> Int? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let metadata = CGImageSourceCopyMetadataAtIndex(source, CGImageSourceGetPrimaryImageIndex(source), nil),
          let raw = CGImageMetadataCopyStringValueWithPath(metadata, nil, "xmp:Rating" as CFString),
          let value = Int(raw as String), (0...5).contains(value) else { return nil }
    return value
  }
}

// PhotoKit requires edited pixels to be upright, independently of EXIF. Do
// this before inference so depth, focus and rendering geometry share that raster.
enum PhotoDepthEditingImage {
  static func point(_ x: Double, _ y: Double, orientation: Int) -> (Double, Double) {
    switch orientation {
    case 2: return (1 - x, y)
    case 3: return (1 - x, 1 - y)
    case 4: return (x, 1 - y)
    case 5: return (y, x)
    case 6: return (1 - y, x)
    case 7: return (1 - y, 1 - x)
    case 8: return (y, 1 - x)
    default: return (x, y)
    }
  }

  // Rotate auxiliary samples without rescaling, interpolation or changing their
  // values. Row padding is discarded. Unsupported layouts fail rather than
  // silently losing HDR or subject masks.
  static func auxiliary(_ info: [String: Any], orientation: Int) throws -> CFDictionary {
    guard (1...8).contains(orientation) else { throw PhotoDepthError.invalidImage }
    guard var description = info[kCGImageAuxiliaryDataInfoDataDescription as String] as? [String: Any],
          let data = info[kCGImageAuxiliaryDataInfoData as String] as? Data,
          let width = (description[kCGImagePropertyWidth as String] as? NSNumber)?.intValue,
          let height = (description[kCGImagePropertyHeight as String] as? NSNumber)?.intValue,
          let stride = (description[kCGImagePropertyBytesPerRow as String] as? NSNumber)?.intValue,
          let format = (description[kCGImagePropertyPixelFormat as String] as? NSNumber)?.uint32Value,
          width > 0, height > 0, stride > 0 else { throw PhotoDepthError.invalidImage }
    // ImageIO's L008/L016/L00h/L00f and interleaved RGBA/BGRA layouts.
    let sizes: [UInt32: Int] = [0x4c303038: 1, 0x4c303136: 2, 0x4c303068: 2,
      0x4c303066: 4, 0x52474241: 4, 0x42475241: 4]
    guard let size = sizes[format], stride >= width * size, data.count >= stride * height else {
      throw PhotoDepthError.invalidImage
    }
    let rotated = orientation >= 5
    let outWidth = rotated ? height : width, outHeight = rotated ? width : height
    var output = Data(count: outWidth * outHeight * size)
    output.withUnsafeMutableBytes { outBytes in
      data.withUnsafeBytes { inBytes in
        for y in 0..<height {
          for x in 0..<width {
            let p = point((Double(x) + 0.5) / Double(width), (Double(y) + 0.5) / Double(height), orientation: orientation)
            let dx = min(outWidth - 1, max(0, Int(p.0 * Double(outWidth))))
            let dy = min(outHeight - 1, max(0, Int(p.1 * Double(outHeight))))
            outBytes.baseAddress!.advanced(by: (dy * outWidth + dx) * size)
              .copyMemory(from: inBytes.baseAddress!.advanced(by: y * stride + x * size), byteCount: size)
          }
        }
      }
    }
    description[kCGImagePropertyWidth as String] = outWidth
    description[kCGImagePropertyHeight as String] = outHeight
    description[kCGImagePropertyBytesPerRow as String] = outWidth * size
    description[kCGImagePropertyOrientation as String] = 1
    var result = info
    result[kCGImageAuxiliaryDataInfoData as String] = output
    result[kCGImageAuxiliaryDataInfoDataDescription as String] = description
    return result as CFDictionary
  }

  static func prepare(_ source: CGImageSource, to url: URL) throws -> CGImageSource {
    let index = CGImageSourceGetPrimaryImageIndex(source)
    var properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [String: Any] ?? [:]
    let orientation = (properties[kCGImagePropertyOrientation as String] as? NSNumber)?.intValue ?? 1
    guard (1...8).contains(orientation) else { throw PhotoDepthError.invalidImage }
    if orientation == 1 { return source }
    guard !PhotoDepthEngine.hasDepth(source), CGImageSourceGetCount(source) == 1,
          let width = (properties[kCGImagePropertyPixelWidth as String] as? NSNumber)?.intValue,
          let height = (properties[kCGImagePropertyPixelHeight as String] as? NSNumber)?.intValue,
          let type = CGImageSourceGetType(source),
          let image = CGImageSourceCreateThumbnailAtIndex(source, index, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max(width, height)
          ] as CFDictionary),
          let destination = CGImageDestinationCreateWithURL(url as CFURL, type, 1, nil) else {
      throw PhotoDepthError.invalidImage
    }
    properties[kCGImagePropertyOrientation as String] = 1
    properties[kCGImagePropertyPixelWidth as String] = image.width
    properties[kCGImagePropertyPixelHeight as String] = image.height
    var tiff = properties[kCGImagePropertyTIFFDictionary as String] as? [String: Any] ?? [:]
    tiff[kCGImagePropertyTIFFOrientation as String] = 1
    properties[kCGImagePropertyTIFFDictionary as String] = tiff
    var exif = properties[kCGImagePropertyExifDictionary as String] as? [String: Any] ?? [:]
    exif[kCGImagePropertyExifPixelXDimension as String] = image.width
    exif[kCGImagePropertyExifPixelYDimension as String] = image.height
    // The original sensor-coordinate focus region no longer describes this raster.
    exif.removeValue(forKey: kCGImagePropertyExifSubjectArea as String)
    properties[kCGImagePropertyExifDictionary as String] = exif
    let metadata = CGImageSourceCopyMetadataAtIndex(source, index, nil).flatMap(CGImageMetadataCreateMutableCopy)
      ?? CGImageMetadataCreateMutable()
    CGImageMetadataSetValueMatchingImageProperty(metadata, kCGImagePropertyTIFFDictionary, kCGImagePropertyTIFFOrientation, 1 as CFNumber)
    CGImageMetadataSetValueMatchingImageProperty(metadata, kCGImagePropertyExifDictionary, kCGImagePropertyExifPixelXDimension, image.width as CFNumber)
    CGImageMetadataSetValueMatchingImageProperty(metadata, kCGImagePropertyExifDictionary, kCGImagePropertyExifPixelYDimension, image.height as CFNumber)
    CGImageMetadataRemoveTagWithPath(metadata, nil, "exif:SubjectArea" as CFString)
    try rotateRegions(metadata, orientation: orientation, width: image.width, height: image.height)
    CGImageDestinationAddImageAndMetadata(destination, image, metadata, properties as CFDictionary)
    for type in PhotoDepthEngine.preservedAuxiliaryTypes {
      if let info = CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, index, type) as? [String: Any] {
        CGImageDestinationAddAuxiliaryDataInfo(destination, type, try auxiliary(info, orientation: orientation))
      }
    }
    guard CGImageDestinationFinalize(destination) else { throw PhotoDepthError.invalidImage }
    let prepared = try PhotoDepthEngine.source(url)
    let saved = CGImageSourceCopyPropertiesAtIndex(prepared, 0, nil) as? [String: Any] ?? [:]
    guard (saved[kCGImagePropertyOrientation as String] as? NSNumber)?.intValue == 1 else { throw PhotoDepthError.invalidImage }
    return prepared
  }

  private static func rotateRegions(_ metadata: CGMutableImageMetadata, orientation: Int, width: Int, height: Int) throws {
    let path = "mwg-rs:Regions" as CFString
    guard let tag = CGImageMetadataCopyTagWithPath(metadata, nil, path),
          var fields = CGImageMetadataTagCopyValue(tag) as? [String: CGImageMetadataTag],
          let list = fields["RegionList"],
          let entries = CGImageMetadataTagCopyValue(list) as? [CGImageMetadataTag] else { return }
    func replacing(_ tag: CGImageMetadataTag, value: CFTypeRef) throws -> CGImageMetadataTag {
      guard let namespace = CGImageMetadataTagCopyNamespace(tag), let name = CGImageMetadataTagCopyName(tag),
            let result = CGImageMetadataTagCreate(namespace, CGImageMetadataTagCopyPrefix(tag), name, CGImageMetadataTagGetType(tag), value) else {
        throw PhotoDepthError.invalidImage
      }
      return result
    }
    let transformed = try entries.map { entry -> CGImageMetadataTag in
      guard var region = CGImageMetadataTagCopyValue(entry) as? [String: CGImageMetadataTag],
            let areaTag = region["Area"], var area = CGImageMetadataTagCopyValue(areaTag) as? [String: CGImageMetadataTag] else { return entry }
      func value(_ name: String) -> Double? { area[name].flatMap(CGImageMetadataTagCopyValue).flatMap { Double(String(describing: $0)) } }
      guard area["unit"].flatMap(CGImageMetadataTagCopyValue) as? String == "normalized",
            let x = value("x"), let y = value("y"), let w = value("w"), let h = value("h") else { throw PhotoDepthError.invalidImage }
      let p = point(x, y, orientation: orientation)
      for (key, number) in ["x": p.0, "y": p.1, "w": orientation >= 5 ? h : w, "h": orientation >= 5 ? w : h] {
        area[key] = try replacing(area[key]!, value: String(number) as CFString)
      }
      region["Area"] = try replacing(areaTag, value: area as CFDictionary)
      return try replacing(entry, value: region as CFDictionary)
    }
    fields["RegionList"] = try replacing(list, value: transformed as CFArray)
    if let dimensions = fields["AppliedToDimensions"], var values = CGImageMetadataTagCopyValue(dimensions) as? [String: CGImageMetadataTag] {
      for (key, number) in ["w": width, "h": height] {
        if let field = values[key] { values[key] = try replacing(field, value: String(number) as CFString) }
      }
      fields["AppliedToDimensions"] = try replacing(dimensions, value: values as CFDictionary)
    }
    guard CGImageMetadataSetTagWithPath(metadata, nil, path, try replacing(tag, value: fields as CFDictionary)) else { throw PhotoDepthError.invalidImage }
  }
}
