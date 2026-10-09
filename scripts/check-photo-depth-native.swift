import AVFoundation
import CoreImage
import CoreML
import Foundation
import ImageIO
import UniformTypeIdentifiers

@main
struct PhotoDepthChecks {
  static func require(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
    if try !condition() { throw NSError(domain: "PhotoDepthChecks", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  }

  static func main() throws {
    let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("komorebi-depth-check-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: temporary) }
    let original = temporary.appendingPathComponent("original.jpg")
    var pixels = [UInt8](repeating: 0, count: 240 * 160 * 4)
    for y in 0..<160 {
      for x in 0..<240 {
        let i = (y * 240 + x) * 4
        pixels[i] = UInt8(x); pixels[i + 1] = UInt8(y); pixels[i + 2] = UInt8((x + y) / 2); pixels[i + 3] = 255
      }
    }
    let provider = CGDataProvider(data: Data(pixels) as CFData)!
    let image = CGImage(width: 240, height: 160, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: 240 * 4,
      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
      provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
    let destination = CGImageDestinationCreateWithURL(original as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, [kCGImagePropertyOrientation: 1] as CFDictionary)
    try require(CGImageDestinationFinalize(destination), "fixture write")

    let movieFixture = temporary.appendingPathComponent("paired.mov")
    try Data("paired video fixture".utf8).write(to: movieFixture)
    let movieStore = try PhotoDepthRecoveryStore(root: temporary.appendingPathComponent("live-recovery"))
    let liveRecord = try movieStore.prepare(assetId: "live-photo", source: original, movie: movieFixture)
    let reopened = try movieStore.read("live-photo")!
    try require(reopened.movieFilename == "before.mov", "persist Live Photo backup association")
    try require(Data(contentsOf: movieStore.movieBackup(reopened)!) == Data(contentsOf: movieFixture), "preserve paired movie bytes")
    try movieStore.remove(liveRecord.assetId)
    try require(movieStore.read(liveRecord.assetId) == nil, "remove both resources with recovery record")

    let root = temporary.appendingPathComponent("recovery")
    let store = try PhotoDepthRecoveryStore(root: root)
    let record = try store.prepare(assetId: "asset/a", source: original, modificationDate: Date(timeIntervalSince1970: 1))
    let restarted = try PhotoDepthRecoveryStore(root: root)
    let restored = try restarted.read("asset/a")!
    try require(restored.recoveryId == record.recoveryId, "recovery ID survives restart")
    let backup = try restarted.backup(restored)
    try require(try Data(contentsOf: backup) == Data(contentsOf: original), "baseline bytes survive restart")
    try require(PhotoDepthRecoveryDisposition.resolve(restored, markerId: record.recoveryId, markerPhase: "applied", modificationTime: 2) == .restoreAvailable, "commit before journal update is recoverable")
    try require(PhotoDepthRecoveryDisposition.resolve(restored, markerId: nil, markerPhase: nil, modificationTime: 1) == .clearUncommitted, "uncommitted recovery can be removed")
    try require(PhotoDepthRecoveryDisposition.resolve(restored, markerId: nil, markerPhase: nil, modificationTime: 2) == .conflict, "external revision blocks rollback")
    try require(PhotoDepthRecoveryDisposition.resolve(restored, markerId: record.recoveryId, markerPhase: "reverted", modificationTime: 2) == .clearReverted, "restore before cleanup is recognized")
    var applied = restored
    applied.phase = "applied"
    try restarted.write(applied)
    try require(try PhotoDepthRecoveryStore(root: root).read("asset/a")?.phase == "applied", "applied journal survives restart")
    do {
      _ = try restarted.prepare(assetId: "asset/a", source: original)
      throw NSError(domain: "Checks", code: 2)
    } catch PhotoDepthError.existingRecovery {}
    try FileManager.default.removeItem(at: backup)
    do {
      _ = try restarted.backup(applied)
      throw NSError(domain: "Checks", code: 4)
    } catch PhotoDepthError.invalidRecovery {}
    try restarted.remove("asset/a")
    try require(try restarted.read("asset/a") == nil, "cleanup after restore")
    do {
      _ = try restarted.prepare(assetId: "missing", source: temporary.appendingPathComponent("missing.jpg"))
      throw NSError(domain: "Checks", code: 5)
    } catch let error as NSError {
      try require(error.domain != "Checks", "failed backup must not succeed")
      try require(try restarted.read("missing") == nil, "backup failure leaves no journal")
    }
    try require(!PhotosPortraitCompatibility.validated, "Photos acceptance must not be claimed before documented validation")
    try require(PhotosPortraitCompatibility.generationEnabled, "generation must be available in all build configurations")

    // Asymmetric samples expose wrong rotations, mirrors and row-padding reads.
    let expectedAuxiliary: [[UInt8]] = [
      [1, 2, 3, 4, 5, 6], [3, 2, 1, 6, 5, 4], [6, 5, 4, 3, 2, 1], [4, 5, 6, 1, 2, 3],
      [1, 4, 2, 5, 3, 6], [4, 1, 5, 2, 6, 3], [6, 3, 5, 2, 4, 1], [3, 6, 2, 5, 1, 4]
    ]
    let paddedAuxiliary: [String: Any] = [
      kCGImageAuxiliaryDataInfoData as String: Data([1, 2, 3, 99, 4, 5, 6, 99]),
      kCGImageAuxiliaryDataInfoDataDescription as String: [
        kCGImagePropertyWidth as String: 3, kCGImagePropertyHeight as String: 2,
        kCGImagePropertyBytesPerRow as String: 4, kCGImagePropertyPixelFormat as String: 0x4c303038
      ]
    ]
    for orientation in 1...8 {
      let rotated = try PhotoDepthEditingImage.auxiliary(paddedAuxiliary, orientation: orientation) as NSDictionary
      try require(rotated[kCGImageAuxiliaryDataInfoData] as? Data == Data(expectedAuxiliary[orientation - 1]), "auxiliary samples preserve rotation \(orientation) without interpolation")
      let url = temporary.appendingPathComponent("editing-\(orientation).jpg")
      let writer = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
      CGImageDestinationAddImage(writer, image, [kCGImagePropertyOrientation: orientation] as CFDictionary)
      try require(CGImageDestinationFinalize(writer), "editing input fixture")
      let input = try PhotoDepthEngine.source(url)
      let upright = try PhotoDepthEditingImage.prepare(input, to: temporary.appendingPathComponent("upright-\(orientation).jpg"))
      let properties = CGImageSourceCopyPropertiesAtIndex(upright, 0, nil)! as NSDictionary
      try require((properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue == 1, "PhotoKit editing orientation is up for \(orientation)")
      let actual = CGImageSourceCreateImageAtIndex(upright, 0, nil)!
      let expected = CIImage(cgImage: CGImageSourceCreateImageAtIndex(input, 0, nil)!).oriented(forExifOrientation: Int32(orientation))
      try require(actual.width == Int(expected.extent.width) && actual.height == Int(expected.extent.height), "upright pixels preserve full resolution for \(orientation)")
      let context = CIContext(options: [.cacheIntermediates: false])
      let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
      var actualBytes = [UInt8](repeating: 0, count: actual.width * actual.height * 4)
      var expectedBytes = actualBytes
      actualBytes.withUnsafeMutableBytes { context.render(CIImage(cgImage: actual), toBitmap: $0.baseAddress!, rowBytes: actual.width * 4, bounds: expected.extent, format: .RGBA8, colorSpace: colorSpace) }
      expectedBytes.withUnsafeMutableBytes { context.render(expected, toBitmap: $0.baseAddress!, rowBytes: actual.width * 4, bounds: expected.extent, format: .RGBA8, colorSpace: colorSpace) }
      let error = zip(actualBytes, expectedBytes).reduce(0.0) { $0 + abs(Double($1.0) - Double($1.1)) } / Double(actualBytes.count)
      try require(error < 3, "upright pixels match intended appearance for \(orientation), JPEG mean error \(error)")
    }

    let regionXML = """
    <x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:mwg-rs="http://www.metadataworkinggroup.com/schemas/regions/" xmlns:stDim="http://ns.adobe.com/xap/1.0/sType/Dimensions#" xmlns:stArea="http://ns.adobe.com/xmp/sType/Area#"><mwg-rs:Regions rdf:parseType="Resource"><mwg-rs:AppliedToDimensions stDim:w="240" stDim:h="160" stDim:unit="pixel"/><mwg-rs:RegionList><rdf:Bag><rdf:li rdf:parseType="Resource"><mwg-rs:Type>Face</mwg-rs:Type><mwg-rs:Name>Test person</mwg-rs:Name><mwg-rs:Area stArea:x="0.3" stArea:y="0.2" stArea:w="0.1" stArea:h="0.4" stArea:unit="normalized"/></rdf:li></rdf:Bag></mwg-rs:RegionList></mwg-rs:Regions></rdf:Description></rdf:RDF></x:xmpmeta>
    """
    let regionURL = temporary.appendingPathComponent("regions-6.jpg")
    let regionDestination = CGImageDestinationCreateWithURL(regionURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
    CGImageDestinationAddImageAndMetadata(regionDestination, image, CGImageMetadataCreateFromXMPData(Data(regionXML.utf8) as CFData), [kCGImagePropertyOrientation: 6] as CFDictionary)
    try require(CGImageDestinationFinalize(regionDestination), "rotated region fixture")
    let regionSource = try PhotoDepthEditingImage.prepare(try PhotoDepthEngine.source(regionURL), to: temporary.appendingPathComponent("regions-up.jpg"))
    let regionMetadata = CGImageSourceCopyMetadataAtIndex(regionSource, 0, nil)!
    let regionFields = CGImageMetadataCopyTagWithPath(regionMetadata, nil, "mwg-rs:Regions" as CFString).flatMap(CGImageMetadataTagCopyValue) as! [String: CGImageMetadataTag]
    let regionEntries = CGImageMetadataTagCopyValue(regionFields["RegionList"]!) as! [CGImageMetadataTag]
    let face = CGImageMetadataTagCopyValue(regionEntries[0]) as! [String: CGImageMetadataTag]
    let faceArea = CGImageMetadataTagCopyValue(face["Area"]!) as! [String: CGImageMetadataTag]
    for (key, expected) in ["x": 0.8, "y": 0.3, "w": 0.4, "h": 0.1] {
      let actual = Double(CGImageMetadataTagCopyValue(faceArea[key]!) as! String)!
      try require(abs(actual - expected) < 1e-6, "face region \(key) follows rotated pixels")
    }
    try require(CGImageMetadataTagCopyValue(face["Name"]!) as? String == "Test person", "face identity is preserved")

    // Opaque Styles payloads, properties and references must survive depth grafting.
    func graphFixture(styles: Bool) -> Data {
      let n = PhotoDepthHEIF.number, b = PhotoDepthHEIF.box
      let payloads = [Data("primary compressed pixels".utf8), Data(styles ? "opaque style delta".utf8 : "depth pixels".utf8), Data(styles ? "opaque style recipe".utf8 : "depth metadata".utf8)]
      var iloc = Data([1, 0, 0, 0, 0x44, 0]) + n(3, 2)
      var offset = 0
      for (index, payload) in payloads.enumerated() {
        iloc += n(index + 1, 2) + n(1, 2) + n(0, 2) + n(1, 2) + n(offset, 4) + n(payload.count, 4)
        offset += payload.count
      }
      var iinf = Data([0, 0, 0, 0]) + n(3, 2)
      for id in 1...3 {
        let type = id == 3 ? (styles ? "uri " : "mime") : "hvc1"
        let name = id == 3 ? (styles ? "styleMetadata\0urn:com:apple:photo:2023:styleMetadata\0" : "depth\0application/rdf+xml\0") : "image\0"
        iinf += b("infe", Data([2, 0, 0, 0]) + n(id, 2) + n(0, 2) + Data(type.utf8) + Data(name.utf8))
      }
      let urn = styles ? "urn:com:apple:photo:2023:aux:styledeltamap\0" : "urn:mpeg:hevc:2015:auxid:2\0"
      let ipco = b("ipco", b("ispe", Data(repeating: 0, count: 4) + n(240, 4) + n(160, 4)) + b("auxC", Data(repeating: 0, count: 4) + Data(urn.utf8)))
      let ipma = b("ipma", Data([0, 0, 0, 0]) + n(2, 4) + n(1, 2) + Data([1, 1]) + n(2, 2) + Data([1, 2]))
      let iref = b("iref", Data(repeating: 0, count: 4) + b("auxl", n(2, 2) + n(1, 2) + n(1, 2)) + b("cdsc", n(3, 2) + n(1, 2) + n(styles ? 1 : 2, 2)))
      let meta = Data(repeating: 0, count: 4) + b("pitm", Data(repeating: 0, count: 4) + n(1, 2)) + b("iloc", iloc) + b("iinf", iinf) + b("iprp", ipco + ipma) + iref + b("idat", payloads.reduce(Data(), +))
      return b("ftyp", Data("heic".utf8) + n(0, 4) + Data("mif1heic".utf8)) + b("meta", meta)
    }
    let graphOriginal = temporary.appendingPathComponent("styles-graph.heic")
    let graphDepth = temporary.appendingPathComponent("depth-graph.heic")
    try graphFixture(styles: true).write(to: graphOriginal)
    try graphFixture(styles: false).write(to: graphDepth)
    try require(PhotoDepthHEIF.hasStyles(graphOriginal), "detect opaque Styles graph")
    let beforeGraph = try PhotoDepthHEIF.parse(Data(contentsOf: graphOriginal))
    try PhotoDepthHEIF.merge(original: graphOriginal, depth: graphDepth)
    let afterGraph = try PhotoDepthHEIF.parse(Data(contentsOf: graphDepth))
    try require(PhotoDepthHEIF.hasStyles(graphDepth), "Styles still present after graft")
    try require(afterGraph.items.count == 5, "append only depth and its description")
    for item in beforeGraph.items {
      try require(afterGraph.items.contains { $0.id == item.id && $0.info == item.info && $0.payload == item.payload }, "preserve every original Styles/pixel item byte for byte")
      let before = beforeGraph.associations[item.id] ?? []
      let after = afterGraph.associations[item.id] ?? []
      try require(before.elementsEqual(after, by: { $0.0 == $1.0 && $0.1 == $1.1 }), "preserve property associations")
    }
    for ref in beforeGraph.references {
      try require(afterGraph.references.contains { $0.type == ref.type && $0.from == ref.from && $0.to == ref.to }, "preserve original graph links")
    }
    do {
      _ = try PhotoDepthHEIF.parse(Data([0, 0, 0, 255, 109, 101, 116, 97]))
      throw NSError(domain: "Checks", code: 4)
    } catch PhotoDepthError.invalidImage {}

    guard CommandLine.arguments.count > 1 else {
      print("Recovery and generation availability checks passed (inference not requested)")
      return
    }
    let compiled = try MLModel.compileModel(at: URL(fileURLWithPath: CommandLine.arguments[1]))
    defer { try? FileManager.default.removeItem(at: compiled) }
    let configuration = MLModelConfiguration()
    configuration.computeUnits = .cpuOnly
    let model = try MLModel(contentsOf: compiled, configuration: configuration)
    for orientation in 1...8 {
      let inputURL = temporary.appendingPathComponent("orientation-\(orientation).jpg")
      let inputDestination = CGImageDestinationCreateWithURL(inputURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
      CGImageDestinationAddImage(inputDestination, image, [kCGImagePropertyOrientation: orientation,
        kCGImagePropertyMakerAppleDictionary: ["25": 0x20002, "31": 4],
        kCGImagePropertyExifDictionary: [kCGImagePropertyExifFocalLength: 6.8, kCGImagePropertyExifFocalLenIn35mmFilm: 24] as [CFString: Any]] as CFDictionary)
      try require(CGImageDestinationFinalize(inputDestination), "orientation fixture")
      if orientation == 1 {
        let fixtureSource = try PhotoDepthEngine.source(inputURL)
        let xml = """
        <x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:mwg-rs="http://www.metadataworkinggroup.com/schemas/regions/"><mwg-rs:Regions rdf:parseType="Resource"><mwg-rs:RegionList><rdf:Bag><rdf:li rdf:parseType="Resource"><mwg-rs:Type>Face</mwg-rs:Type><mwg-rs:Name>Fixture face</mwg-rs:Name></rdf:li></rdf:Bag></mwg-rs:RegionList></mwg-rs:Regions></rdf:Description></rdf:RDF></x:xmpmeta>
        """
        let faceMetadata = CGImageMetadataCreateFromXMPData(Data(xml.utf8) as CFData)!
        let faceURL = temporary.appendingPathComponent("face.jpg")
        let faceDestination = CGImageDestinationCreateWithURL(faceURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
        try require(CGImageDestinationCopyImageSource(faceDestination, fixtureSource,
          [kCGImageDestinationMetadata: faceMetadata, kCGImageDestinationMergeMetadata: true] as CFDictionary, nil), "face fixture")
        _ = try FileManager.default.replaceItemAt(inputURL, withItemAt: faceURL)
      }
      let source = try PhotoDepthEngine.source(inputURL)
      let depth = try PhotoDepthEngine.disparity(source: source, model: model, checkCancellation: {})
      let preview = PhotoDepthEngine.scanPreview(source: source, disparity: depth)
      let encoded = preview?.replacingOccurrences(of: "data:image/png;base64,", with: "") ?? ""
      guard let png = Data(base64Encoded: encoded),
            let previewSource = CGImageSourceCreateWithData(png as CFData, nil),
            let previewImage = CGImageSourceCreateImageAtIndex(previewSource, 0, nil) else {
        throw NSError(domain: "PhotoDepthChecks", code: 2, userInfo: [NSLocalizedDescriptionKey: "Scan preview must be a readable PNG"])
      }
      try require(previewImage.width == (orientation >= 5 ? 160 : 240)
        && previewImage.height == (orientation >= 5 ? 240 : 160), "scan preview is upright for EXIF \(orientation)")

      try require(depth.depthDataAccuracy == .relative, "synthetic depth must be relative")
      try require(CVPixelBufferGetWidth(depth.depthDataMap) == 240 && CVPixelBufferGetHeight(depth.depthDataMap) == 160, "map must align with stored raster for EXIF \(orientation)")
      if orientation == 1 || orientation == 6 {
        let heifURL = temporary.appendingPathComponent("source-\(orientation).heic")
        let heifOutput = temporary.appendingPathComponent("depth-\(orientation).heic")
        let writer = CGImageDestinationCreateWithURL(heifURL as CFURL, UTType.heic.identifier as CFString, 1, nil)!
        CGImageDestinationAddImageFromSource(writer, source, 0, nil)
        try require(CGImageDestinationFinalize(writer), "HEIF fixture")
        try PhotoDepthEngine.write(source: PhotoDepthEngine.source(heifURL), disparity: depth, to: heifOutput)
        try PhotoCatalogMetadata.apply(to: heifOutput, metadata: ["catalogMetadata": ["rating": 4]])
        try PhotoDepthHEIF.merge(original: heifURL, depth: heifOutput)
        let merged = try PhotoDepthEngine.source(heifOutput)
        try require(CGImageSourceCreateImageAtIndex(merged, CGImageSourceGetPrimaryImageIndex(merged), nil) != nil, "grafted HEIF decodes")
        try require(PhotoDepthEngine.hasDepth(merged), "grafted depth decodes")
        try require(PhotoDepthEngine.rating(heifOutput) == 4, "graft preserves updated rating")
        let mergedProjection = try PhotoDepthPortraitEncoding.projection(merged)
        try require(mergedProjection.orientation == orientation, "graft preserves raster orientation")
      }
      let outputURL = temporary.appendingPathComponent("depth-\(orientation).jpg")
      try PhotoDepthEngine.write(source: source, disparity: depth, to: outputURL)
      try PhotoCatalogMetadata.apply(to: outputURL, metadata: ["catalogMetadata": ["rating": 4]])
      try require(PhotoDepthEngine.hasDepth(try PhotoDepthEngine.source(outputURL)), "rating must preserve disparity")
      try require(PhotoDepthEngine.rating(outputURL) == 4, "rating persists")
      let outputSource = try PhotoDepthEngine.source(outputURL)
      let properties = CGImageSourceCopyPropertiesAtIndex(outputSource, 0, nil) as? [String: Any]
      try require((properties?[kCGImagePropertyOrientation as String] as? Int) == orientation, "image orientation preserved")
      let maker = properties?[kCGImagePropertyMakerAppleDictionary as String] as? [String: Any]
      let featureFlags = (maker?["31"] as? NSNumber)?.intValue ?? 0
      try require(featureFlags & 1 == 1, "depth feature flag survives encoding, XMP merge and rating")
      try require(featureFlags == 5, "existing Photos feature flags are preserved")
      let processingFlags = (maker?["25"] as? NSNumber)?.intValue ?? 0
      try require(processingFlags == 0x20022, "unrendered depth marker and existing processing flags survive encoding, XMP merge and rating")
      let exif = properties?[kCGImagePropertyExifDictionary as String] as? [String: Any]
      try require((exif?[kCGImagePropertyExifCustomRendered as String] as? NSNumber)?.intValue != 8,
        "adding depth must not label unblurred pixels as an applied portrait")
      let primaryMetadata = CGImageSourceCopyMetadataAtIndex(outputSource, 0, nil)!
      try require(CGImageMetadataCopyTagWithPath(primaryMetadata, nil, "mwg-rs:Regions" as CFString) != nil, "focus region survives generation and rating")
      if orientation == 1 {
        let fields = CGImageMetadataCopyTagWithPath(primaryMetadata, nil, "mwg-rs:Regions" as CFString).flatMap(CGImageMetadataTagCopyValue) as! [String: CGImageMetadataTag]
        let entries = CGImageMetadataTagCopyValue(fields["RegionList"]!) as! [CGImageMetadataTag]
        let types = entries.compactMap { item -> String? in
          let values = CGImageMetadataTagCopyValue(item) as! [String: CGImageMetadataTag]
          return values["Type"].flatMap(CGImageMetadataTagCopyValue) as? String
        }
        try require(types == ["Face", "Focus"], "face regions survive adding a focus region and rating")
      }
      let savedProjection = try PhotoDepthPortraitEncoding.projection(outputSource)
      try require(savedProjection.orientation == orientation, "nominal projection retains raw EXIF orientation")
      let auxiliary = CGImageSourceCopyAuxiliaryDataInfoAtIndex(outputSource, 0, kCGImageAuxiliaryDataTypeDisparity)! as NSDictionary
      let writtenDepth = try AVDepthData(fromDictionaryRepresentation: auxiliary as! [String: Any])
      try require(writtenDepth.cameraCalibrationData != nil, "nominal rendering geometry survives rating")
      try require(writtenDepth.depthDataAccuracy == .relative && writtenDepth.isDepthDataFiltered, "relative spatially filtered map")
      let description = auxiliary[kCGImageAuxiliaryDataInfoDataDescription] as! NSDictionary
      try require((description[kCGImagePropertyOrientation] as? NSNumber)?.intValue == orientation, "auxiliary orientation aligned with EXIF")
      let metadata = auxiliary[kCGImageAuxiliaryDataInfoMetadata] as! CGImageMetadata
      try require(CGImageMetadataCopyStringValueWithPath(metadata, nil, "depthBlurEffect:RenderingParameters" as CFString) != nil, "rendering recipe survives rating")
      try require(CGImageMetadataCopyTagWithPath(metadata, nil, "depthData:PortraitScore" as CFString) == nil, "do not serialize fabricated portrait confidence")
    }
    let projection = try PhotoDepthPortraitEncoding.projection(PhotoDepthEngine.source(original))
    try require(projection.width == 240 && projection.height == 160, "nominal renderer does not require EXIF lens data")
    try require(abs(projection.intrinsic[0] / 240 - 5707.25634765625 / 4032) < 1e-9, "reference focal scales with the raster")
    let recipe = try PhotoDepthRenderingProfile.make()
    try require(recipe.prefix(4) == Data("REND".utf8), "nominal rendering recipe")
    do {
      _ = try PhotoDepthEngine.disparity(source: PhotoDepthEngine.source(original), model: model) { throw PhotoDepthError.cancelled }
      throw NSError(domain: "Checks", code: 3)
    } catch PhotoDepthError.cancelled {}
    print("Recovery, eight EXIF orientations, upright PhotoKit pixels, auxiliary rotation, face regions, inference, disparity embedding, rating preservation, HEIF graph preservation, Live Photo backups and cancellation passed")
    print("These checks do not establish portrait-editing support in iPhone Photos.")
  }
}
