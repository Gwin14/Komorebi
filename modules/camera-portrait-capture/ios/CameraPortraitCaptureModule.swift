import CameraPhotographicStyles
import ExpoModulesCore
import AVFoundation
import CoreMotion
import ImageIO
import Photos
import UniformTypeIdentifiers
import CoreImage
import UIKit


private final class ZebraOverlayRenderer {
  private let context = CIContext(options: [.cacheIntermediates: false])
  private let kernel = CIColorKernel(source: """
    kernel vec4 zebra(__sample pixel, float highlights, float shadows) {
      float luma = dot(pixel.rgb, vec3(0.2126, 0.7152, 0.0722));
      float stripe = step(0.5, fract((destCoord().x + destCoord().y) / 9.0));
      if (highlights > 0.5 && luma >= 0.98 && stripe > 0.5) return vec4(1.0, 0.05, 0.05, 0.82);
      if (shadows > 0.5 && luma <= 0.02 && stripe > 0.5) return vec4(0.05, 0.32, 1.0, 0.86);
      return vec4(0.0);
    }
  """)

  func makeImage(from pixelBuffer: CVPixelBuffer, highlights: Bool, shadows: Bool,
                 orientation: AVCaptureVideoOrientation, mirrored: Bool) -> CGImage? {
    guard (highlights || shadows), let kernel else { return nil }
    var image = CIImage(cvPixelBuffer: pixelBuffer).oriented(
      forExifOrientation: exifOrientation(for: orientation)
    )
    if mirrored { image = image.oriented(.upMirrored) }
    let scale = min(1, 720 / max(image.extent.width, image.extent.height))
    image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    guard let output = kernel.apply(
      extent: image.extent,
      arguments: [image, highlights ? 1.0 : 0.0, shadows ? 1.0 : 0.0]
    ) else { return nil }
    return context.createCGImage(output, from: output.extent)
  }

  private func exifOrientation(for orientation: AVCaptureVideoOrientation) -> Int32 {
    switch orientation {
    case .portrait: return 6
    case .portraitUpsideDown: return 8
    case .landscapeLeft: return 3
    case .landscapeRight: return 1
    @unknown default: return 6
    }
  }
}

public class CameraPortraitCaptureModule: Module {
  enum PortraitCaptureError: Error, LocalizedError {
    case deviceNotFound(String)
    case cannotAddInput
    case cannotAddOutput
    case portraitCaptureNotSupported
    case captureSessionNotReady
    case captureFailed
    case missingPhotoData
    case missingDepthData
    case invalidDepthData
    case depthEmbeddingFailed
    case portraitRenderingFailed
    case photoLibraryDenied

    var errorDescription: String? {
      switch self {
      case .deviceNotFound(let id):
        return "No AVCaptureDevice found for id \(id)"
      case .cannotAddInput:
        return "Could not add camera input to capture session"
      case .cannotAddOutput:
        return "Could not add photo output to capture session"
      case .portraitCaptureNotSupported:
        return "Portrait capture is not supported by this device"
      case .captureSessionNotReady:
        return "Portrait camera session is not ready"
      case .captureFailed:
        return "Portrait photo capture failed"
      case .missingPhotoData:
        return "Portrait photo capture did not return photo data"
      case .missingDepthData:
        return "Não foi possível obter profundidade para o retrato. Tente novamente com mais luz e distância do fundo."
      case .invalidDepthData:
        return "A câmera entregou um mapa de profundidade vazio para o retrato."
      case .depthEmbeddingFailed:
        return "Não foi possível preservar os dados de profundidade do retrato."
      case .portraitRenderingFailed:
        return "Não foi possível renderizar o desfoque do retrato."
      case .photoLibraryDenied:
        return "Photo library access was denied"
      }
    }
  }

  struct PortraitSupport {
    let supportsDepthData: Bool
    let supportsPortraitEffectsMatte: Bool

    var supportsPortraitCapture: Bool {
      supportsDepthData
    }
  }

  public func definition() -> ModuleDefinition {
    Name("CameraPortraitCapture")

    Function("isSupported") { () -> Bool in
      if #available(iOS 12.0, *) {
        return true
      }
      return false
    }

    View(PortraitCameraView.self) {
      Events("onInitialized", "onError", "onSmileDetected", "onHistogramUpdated")

      Prop("deviceId") { (view, deviceId: String?) in
        view.deviceId = deviceId
      }

      Prop("zoomFactor") { (view, zoomFactor: Double?) in
        view.zoomFactor = CGFloat(zoomFactor ?? 1)
      }

      Prop("exposureBias") { (view, exposureBias: Double?) in
        view.exposureBias = Float(exposureBias ?? 0)
      }

      Prop("flashMode") { (view, flashMode: String?) in
        view.flashMode = flashMode ?? "off"
      }

      Prop("isActive") { (view, isActive: Bool?) in
        view.isActive = isActive ?? true
      }

      Prop("smileDetectionEnabled") { (view, enabled: Bool?) in
        view.smileDetectionEnabled = enabled ?? false
      }

      Prop("histogramEnabled") { (view, enabled: Bool?) in
        view.histogramEnabled = enabled ?? false
      }

      Prop("zebraHighlightsEnabled") { (view, enabled: Bool?) in
        view.zebraHighlightsEnabled = enabled ?? false
      }

      Prop("zebraShadowsEnabled") { (view, enabled: Bool?) in
        view.zebraShadowsEnabled = enabled ?? false
      }
      Prop("previewLutSize") { (view, size: Int?) in
        view.previewLutSize = size ?? 0
      }
      Prop("previewLutValues") { (view, values: [Double]?) in
        view.previewLutValues = values ?? []
      }
      Prop("previewLutDomain") { (view, domain: [Double]?) in
        view.effectRenderer.setLutDomain(domain ?? [])
      }
      Prop("previewGrainStrength") { (view, strength: Double?) in
        view.effectRenderer.setGrainStrength(strength ?? 0)
      }
      Prop("previewHalation") { (view, parameters: [Double]?) in
        view.effectRenderer.setHalation(parameters ?? [])
      }
    }

    AsyncFunction("getCapabilities") { (deviceId: String) async throws -> [String: Any] in
      let device = try Self.findDevice(deviceId)
      let selection = Self.findPortraitCaptureDevice(preferred: device)
      let support = selection?.support ?? PortraitSupport(
        supportsDepthData: false,
        supportsPortraitEffectsMatte: false
      )
      let libraryStatus = PHPhotoLibrary.authorizationStatus(for: .addOnly)

      return [
        "supportsPortraitCapture": support.supportsPortraitCapture,
        "supportsDepthData": support.supportsDepthData,
        "supportsPortraitEffectsMatte": support.supportsPortraitEffectsMatte,
        "requestedDeviceId": device.uniqueID,
        "captureDeviceId": selection?.device.uniqueID ?? "",
        "captureDeviceName": selection?.device.localizedName ?? "",
        "canSaveToPhotoLibrary": libraryStatus == .authorized || libraryStatus == .limited
      ]
    }

    AsyncFunction("capturePortraitPhoto") { (options: [String: Any]) async throws -> [String: Any] in
      guard let deviceId = options["deviceId"] as? String else {
        throw PortraitCaptureError.captureFailed
      }

      let flashMode = options["flashMode"] as? String ?? "off"
      let outputFormat = options["outputFormat"] as? String ?? "heif"
      guard let view = await PortraitCameraView.activeView(for: deviceId) else {
        throw PortraitCaptureError.captureSessionNotReady
      }
      return try await view.capturePortraitPhoto(
        flashMode: flashMode,
        outputFormat: outputFormat,
        aperture: options["aperture"] as? Double ?? 4.5
      )
    }

    AsyncFunction("saveProcessedPortraitPhoto") { (options: [String: Any]) async throws -> [String: Any] in
      guard let processedPhotoUri = options["processedPhotoUri"] as? String else {
        throw PortraitCaptureError.captureFailed
      }

      try await Self.requestPhotoLibraryPermission()

      let processedPhotoURL = try Self.fileURL(from: processedPhotoUri)
      let originalPhotoURL = try (options["originalPhotoUri"] as? String).flatMap { try Self.fileURL(from: $0) }
      let prepared = Self.copyPortraitAuxiliaryData(
        from: originalPhotoURL,
        toProcessedPhotoAt: processedPhotoURL,
        metadata: options["metadata"] as? [String: Any],
        outputFormat: options["outputFormat"] as? String ?? "heif"
      )
      defer {
        if prepared.url != processedPhotoURL { try? FileManager.default.removeItem(at: prepared.url) }
      }
      try PhotoCatalogMetadata.apply(to: prepared.url, metadata: options["metadata"] as? [String: Any])
      let stylesEnabled = options["preserveApplePhotographicStyles"] as? Bool == true
      let finalPhotoURL: URL
      if stylesEnabled {
        let result = try await Task.detached(priority: .userInitiated) {
          try CameraPhotographicStylesModule.makeCompatible(photoUri: prepared.url.absoluteString, options: [
            "inputPrepared": true,
            "enableStyles3": options["photographicStyles3Enabled"] as? Bool ?? false,
            "cameraPosition": options["cameraPosition"] as? String ?? "back",
            "metadata": options["metadata"] as? [String: Any] ?? [:],
            "metadataSourceUri": prepared.url.absoluteString
          ])
        }.value
        guard let uri = result["photoUri"] as? String, let output = URL(string: uri),
              result["verified"] as? Bool == true else { throw PortraitCaptureError.captureFailed }
        finalPhotoURL = output
      } else {
        finalPhotoURL = prepared.url
      }
      defer {
        if finalPhotoURL != prepared.url { try? FileManager.default.removeItem(at: finalPhotoURL) }
      }
      // Validate the file after metadata and Styles writes, not only the sensor
      // capabilities or the auxiliary data we attempted to copy.
      if let originalPhotoURL,
         PortraitDepthRenderer.hasDepthData(at: originalPhotoURL),
         !PortraitDepthRenderer.hasDepthData(at: finalPhotoURL) {
        throw PortraitCaptureError.depthEmbeddingFailed
      }
      let albumTitle = options["albumTitle"] as? String ?? "Komorebi"
      let originalFilename = options["originalFilename"] as? String
      let localIdentifier = try await Self.savePhotoToLibrary(
        photoURL: finalPhotoURL,
        albumTitle: albumTitle,
        originalFilename: originalFilename
      )

      return [
        "localIdentifier": localIdentifier as Any,
        "savedToLibrary": true,
        "auxiliaryDataPreserved": prepared.auxiliaryDataPreserved
      ]
    }

    AsyncFunction("convertPhotoFormat") { (options: [String: Any]) async throws -> [String: Any] in
      guard let photoUri = options["photoUri"] as? String else {
        throw PortraitCaptureError.captureFailed
      }

      let photoURL = try Self.fileURL(from: photoUri)
      let metadataSourceURL = try (options["metadataSourceUri"] as? String).flatMap {
        try Self.fileURL(from: $0)
      }
      let convertedURL = try Self.convertImage(
        at: photoURL,
        metadataSourceURL: metadataSourceURL,
        metadata: options["metadata"] as? [String: Any],
        outputFormat: options["outputFormat"] as? String ?? "heif"
      )
      return ["photoUri": convertedURL.absoluteString]
    }
  }

  static func findDevice(_ deviceId: String) throws -> AVCaptureDevice {
    guard let device = AVCaptureDevice(uniqueID: deviceId) else {
      throw PortraitCaptureError.deviceNotFound(deviceId)
    }
    return device
  }

  static func checkPortraitSupport(device: AVCaptureDevice) throws -> PortraitSupport {
    let session = AVCaptureSession()
    session.beginConfiguration()
    defer { session.commitConfiguration() }
    session.sessionPreset = .photo

    let input = try AVCaptureDeviceInput(device: device)
    guard session.canAddInput(input) else {
      throw PortraitCaptureError.cannotAddInput
    }
    session.addInput(input)

    let output = AVCapturePhotoOutput()
    guard session.canAddOutput(output) else {
      throw PortraitCaptureError.cannotAddOutput
    }
    session.addOutput(output)

    return PortraitSupport(
      supportsDepthData: output.isDepthDataDeliverySupported,
      supportsPortraitEffectsMatte: output.isPortraitEffectsMatteDeliverySupported
    )
  }

  static func findPortraitCaptureDevice(
    preferred device: AVCaptureDevice
  ) -> (device: AVCaptureDevice, support: PortraitSupport)? {
    for candidate in portraitDeviceCandidates(preferred: device) {
      guard let support = try? checkPortraitSupport(device: candidate) else {
        continue
      }

      if support.supportsPortraitCapture {
        return (candidate, support)
      }
    }

    return nil
  }

  private static func portraitDeviceCandidates(preferred device: AVCaptureDevice) -> [AVCaptureDevice] {
    var candidates: [AVCaptureDevice] = []
    var seenDeviceIds = Set<String>()

    func append(_ candidate: AVCaptureDevice) {
      guard candidate.position == device.position,
            !seenDeviceIds.contains(candidate.uniqueID) else {
        return
      }

      seenDeviceIds.insert(candidate.uniqueID)
      candidates.append(candidate)
    }

    append(device)

    var deviceTypes: [AVCaptureDevice.DeviceType] = [
      .builtInDualCamera,
      .builtInWideAngleCamera
    ]

    if #available(iOS 11.1, *) {
      deviceTypes.insert(.builtInTrueDepthCamera, at: 0)
    }

    if #available(iOS 13.0, *) {
      deviceTypes.insert(.builtInDualWideCamera, at: 0)
      deviceTypes.insert(.builtInTripleCamera, at: 0)
    }

    let discoverySession = AVCaptureDevice.DiscoverySession(
      deviceTypes: deviceTypes,
      mediaType: .video,
      position: device.position
    )

    discoverySession.devices.forEach(append)
    return candidates
  }

  static func requestPhotoLibraryPermission() async throws {
    let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
    if status == .authorized || status == .limited {
      return
    }

    let newStatus = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard newStatus == .authorized || newStatus == .limited else {
      throw PortraitCaptureError.photoLibraryDenied
    }
  }

  static func fileURL(from uri: String) throws -> URL {
    if uri.hasPrefix("file://"), let url = URL(string: uri) {
      return url
    }

    return URL(fileURLWithPath: uri)
  }

  static func copyPortraitAuxiliaryData(
    from sourceURL: URL?,
    toProcessedPhotoAt processedURL: URL,
    metadata: [String: Any]?,
    outputFormat: String
  ) -> (url: URL, auxiliaryDataPreserved: Bool) {
    guard
      let sourceURL,
      let processedSource = CGImageSourceCreateWithURL(processedURL as CFURL, nil),
      let sourceImage = CGImageSourceCreateImageAtIndex(processedSource, CGImageSourceGetPrimaryImageIndex(processedSource), nil),
      let processedImage = PhotoDisplayP3.convert(sourceImage),
      let originalSource = CGImageSourceCreateWithURL(sourceURL as CFURL, nil)
    else {
      return (processedURL, false)
    }

    let isJpeg = outputFormat == "jpeg"
    let destinationURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("komorebi-portrait-processed-\(UUID().uuidString).\(isJpeg ? "jpg" : "heic")")
    var properties = Self.mergedImageProperties(
      metadataSource: originalSource,
      processedSource: processedSource
    ) as NSDictionary as? [String: Any] ?? [:]
    Self.applyGPSMetadata(metadata, to: &properties)
    PhotoDisplayP3.apply(to: &properties)

    guard let destination = CGImageDestinationCreateWithURL(
      destinationURL as CFURL,
      (isJpeg ? UTType.jpeg : UTType.heic).identifier as CFString,
      1,
      nil
    ) else {
      return (processedURL, false)
    }

    CGImageDestinationAddImage(destination, processedImage, properties as CFDictionary)

    var auxiliaryDataPreserved = false
    let auxiliaryTypes: [CFString] = [
      kCGImageAuxiliaryDataTypeDisparity,
      kCGImageAuxiliaryDataTypeDepth,
      kCGImageAuxiliaryDataTypePortraitEffectsMatte
    ]

    for auxiliaryType in auxiliaryTypes {
      if let auxiliaryData = CGImageSourceCopyAuxiliaryDataInfoAtIndex(
        originalSource,
        CGImageSourceGetPrimaryImageIndex(originalSource),
        auxiliaryType
      ) {
        CGImageDestinationAddAuxiliaryDataInfo(
          destination,
          auxiliaryType,
          auxiliaryData
        )
        auxiliaryDataPreserved = true
      }
    }

    guard CGImageDestinationFinalize(destination) else {
      return (processedURL, false)
    }

    return (destinationURL, auxiliaryDataPreserved)
  }

  static func convertImage(
    at sourceURL: URL,
    metadataSourceURL: URL?,
    metadata: [String: Any]?,
    outputFormat: String
  ) throws -> URL {
    guard
      let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let sourceImage = CGImageSourceCreateImageAtIndex(source, CGImageSourceGetPrimaryImageIndex(source), nil),
      let image = PhotoDisplayP3.convert(sourceImage)
    else {
      throw PortraitCaptureError.captureFailed
    }

    let isJpeg = outputFormat == "jpeg"
    let destinationURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("komorebi-\(UUID().uuidString).\(isJpeg ? "jpg" : "heic")")
    guard let destination = CGImageDestinationCreateWithURL(
      destinationURL as CFURL,
      (isJpeg ? UTType.jpeg : UTType.heic).identifier as CFString,
      1,
      nil
    ) else {
      throw PortraitCaptureError.captureFailed
    }

    let metadataSource = metadataSourceURL.flatMap {
      CGImageSourceCreateWithURL($0 as CFURL, nil)
    }
    var properties: [String: Any]
    if let metadataSource {
      properties = Self.mergedImageProperties(
        metadataSource: metadataSource,
        processedSource: source
      ) as NSDictionary as? [String: Any] ?? [:]
    } else {
      properties = (CGImageSourceCopyPropertiesAtIndex(source, CGImageSourceGetPrimaryImageIndex(source), nil) as? [String: Any]) ?? [:]
    }
    Self.applyGPSMetadata(metadata, to: &properties)
    PhotoDisplayP3.apply(to: &properties)
    properties[kCGImageDestinationLossyCompressionQuality as String] = 0.92
    CGImageDestinationAddImage(destination, image, properties as CFDictionary)
    guard CGImageDestinationFinalize(destination) else {
      throw PortraitCaptureError.captureFailed
    }
    return destinationURL
  }

  static func applyGPSMetadata(
    _ metadata: [String: Any]?,
    to properties: inout [String: Any]
  ) {
    guard let metadata else { return }
    let gpsKey = kCGImagePropertyGPSDictionary as String

    if metadata["removeGPS"] as? Bool == true {
      properties.removeValue(forKey: gpsKey)
      return
    }

    guard
      let latitude = (metadata["GPSLatitude"] as? NSNumber)?.doubleValue,
      let longitude = (metadata["GPSLongitude"] as? NSNumber)?.doubleValue
    else { return }

    var gps = properties[gpsKey] as? [String: Any] ?? [:]
    gps[kCGImagePropertyGPSVersion as String] = [2, 2, 0, 0]
    gps[kCGImagePropertyGPSLatitude as String] = abs(latitude)
    gps[kCGImagePropertyGPSLatitudeRef as String] = latitude >= 0 ? "N" : "S"
    gps[kCGImagePropertyGPSLongitude as String] = abs(longitude)
    gps[kCGImagePropertyGPSLongitudeRef as String] = longitude >= 0 ? "E" : "W"

    if let altitude = (metadata["GPSAltitude"] as? NSNumber)?.doubleValue {
      gps[kCGImagePropertyGPSAltitude as String] = abs(altitude)
      gps[kCGImagePropertyGPSAltitudeRef as String] = altitude >= 0 ? 0 : 1
    }
    properties[gpsKey] = gps
  }

  static func mergedImageProperties(
    metadataSource: CGImageSource,
    processedSource: CGImageSource
  ) -> CFDictionary {
    var merged = (CGImageSourceCopyPropertiesAtIndex(metadataSource, CGImageSourceGetPrimaryImageIndex(metadataSource), nil) as? [String: Any]) ?? [:]
    let processed = (CGImageSourceCopyPropertiesAtIndex(processedSource, CGImageSourceGetPrimaryImageIndex(processedSource), nil) as? [String: Any]) ?? [:]

    for key in [
      kCGImagePropertyGPSDictionary as String,
      kCGImagePropertyExifDictionary as String,
      kCGImagePropertyTIFFDictionary as String
    ] {
      guard let processedValue = processed[key] else {
        continue
      }

      if
        let existingDictionary = merged[key] as? [String: Any],
        let processedDictionary = processedValue as? [String: Any]
      {
        merged[key] = existingDictionary.merging(processedDictionary) { _, processed in processed }
      } else {
        merged[key] = processedValue
      }
    }

    merged[kCGImagePropertyOrientation as String] = 1
    return merged as CFDictionary
  }

  static func savePhotoToLibrary(
    photoURL: URL,
    albumTitle: String? = nil,
    originalFilename: String? = nil
  ) async throws -> String? {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String?, Error>) in
      var placeholderIdentifier: String?

      PHPhotoLibrary.shared().performChanges({
        let request = PHAssetCreationRequest.forAsset()
        let resourceOptions = PHAssetResourceCreationOptions()
        resourceOptions.originalFilename = originalFilename
        request.addResource(with: .photo, fileURL: photoURL, options: resourceOptions)
        placeholderIdentifier = request.placeholderForCreatedAsset?.localIdentifier

        if
          let albumTitle,
          let placeholder = request.placeholderForCreatedAsset
        {
          Self.addAsset(placeholder, toAlbumNamed: albumTitle)
        }
      }, completionHandler: { success, error in
        if let error {
          continuation.resume(throwing: error)
        } else if success {
          continuation.resume(returning: placeholderIdentifier)
        } else {
          continuation.resume(throwing: PortraitCaptureError.captureFailed)
        }
      })
    }
  }

  static func addAsset(_ assetPlaceholder: PHObjectPlaceholder, toAlbumNamed albumTitle: String) {
    let fetchOptions = PHFetchOptions()
    fetchOptions.predicate = NSPredicate(format: "title = %@", albumTitle)
    let collections = PHAssetCollection.fetchAssetCollections(
      with: .album,
      subtype: .albumRegular,
      options: fetchOptions
    )

    if let album = collections.firstObject {
      let changeRequest = PHAssetCollectionChangeRequest(for: album)
      changeRequest?.addAssets([assetPlaceholder] as NSArray)
      return
    }

    let createRequest = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(
      withTitle: albumTitle
    )
    createRequest.addAssets([assetPlaceholder] as NSArray)
  }

  static func toAVFlashMode(_ mode: String) -> AVCaptureDevice.FlashMode {
    switch mode {
    case "on":
      return .on
    case "auto":
      return .auto
    default:
      return .off
    }
  }
}

public final class PortraitCameraView: ExpoView {
  let onInitialized = EventDispatcher()
  let onError = EventDispatcher()
  let onSmileDetected = EventDispatcher()
  let onHistogramUpdated = EventDispatcher()

  private static weak var currentActiveView: PortraitCameraView?
  private let controller = PortraitCameraController()
  let effectRenderer = LiveEffectPreviewRenderer()
  private let zebraOverlay = UIImageView()
  var previewLutSize = 0 {
    didSet { effectRenderer.setLut(size: previewLutSize, values: previewLutValues) }
  }
  var previewLutValues: [Double] = [] {
    didSet { effectRenderer.setLut(size: previewLutSize, values: previewLutValues) }
  }

  var deviceId: String? {
    didSet {
      updateSession()
    }
  }

  var zoomFactor: CGFloat = 1 {
    didSet { controller.setZoomFactor(zoomFactor) }
  }

  var exposureBias: Float = 0 {
    didSet { controller.setExposureBias(exposureBias) }
  }

  var flashMode: String = "off"

  var smileDetectionEnabled: Bool = false {
    didSet {
      controller.smileDetectionEnabled = smileDetectionEnabled
    }
  }

  var histogramEnabled: Bool = false {
    didSet {
      controller.histogramEnabled = histogramEnabled
    }
  }

  var zebraHighlightsEnabled: Bool = false {
    didSet {
      controller.zebraHighlightsEnabled = zebraHighlightsEnabled
      if !zebraHighlightsEnabled && !zebraShadowsEnabled { zebraOverlay.image = nil }
    }
  }

  var zebraShadowsEnabled: Bool = false {
    didSet {
      controller.zebraShadowsEnabled = zebraShadowsEnabled
      if !zebraHighlightsEnabled && !zebraShadowsEnabled { zebraOverlay.image = nil }
    }
  }

  var isActive: Bool = true {
    didSet {
      updateSession()
    }
  }

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    backgroundColor = .black
    videoPreviewLayer.videoGravity = .resizeAspectFill
    videoPreviewLayer.session = controller.session
    addSubview(effectRenderer.imageView)
    zebraOverlay.contentMode = .scaleAspectFill
    zebraOverlay.clipsToBounds = true
    zebraOverlay.isUserInteractionEnabled = false
    addSubview(zebraOverlay)
    controller.onSmileDetected = { [weak self] in
      self?.onSmileDetected()
    }
    controller.onHistogramUpdated = { [weak self] bins in
      self?.onHistogramUpdated(["bins": bins])
    }
    controller.onZebraUpdated = { [weak self] image in
      DispatchQueue.main.async { self?.zebraOverlay.image = image.map { UIImage(cgImage: $0) } }
    }
    controller.onEffectFrame = { [weak self] buffer, orientation, mirrored in
      self?.effectRenderer.submit(buffer, orientation: orientation, mirrored: mirrored)
    }
  }

  public override class var layerClass: AnyClass {
    AVCaptureVideoPreviewLayer.self
  }

  private var videoPreviewLayer: AVCaptureVideoPreviewLayer {
    layer as! AVCaptureVideoPreviewLayer
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    effectRenderer.imageView.frame = bounds
    zebraOverlay.frame = bounds
  }

  @MainActor
  static func activeView(for deviceId: String) -> PortraitCameraView? {
    guard let view = currentActiveView, view.deviceId == deviceId, view.isActive else {
      return nil
    }
    return view
  }

  func capturePortraitPhoto(flashMode: String, outputFormat: String, aperture: Double) async throws -> [String: Any] {
    print("[PortraitNative] capture requested deviceId=\(deviceId ?? "nil") flashMode=\(flashMode)")
    let captureResult = try await controller.capture(
      flashMode: flashMode,
      outputFormat: outputFormat
    )
    print("[PortraitNative] capture finished photoURL=\(captureResult.photoURL.absoluteString) depth=\(captureResult.support.supportsDepthData) matte=\(captureResult.support.supportsPortraitEffectsMatte)")

    let renderedURL = try await Task.detached(priority: .userInitiated) {
      try PortraitDepthRenderer.render(
        photoURL: captureResult.photoURL,
        depthData: captureResult.depthData,
        portraitEffectsMatte: captureResult.portraitEffectsMatte,
        aperture: aperture
      )
    }.value

    return [
      "photoUri": renderedURL.absoluteString,
      "originalPhotoUri": captureResult.photoURL.absoluteString,
      "localIdentifier": NSNull(),
      "savedToLibrary": false,
      "depthDataEmbedded": captureResult.support.supportsDepthData,
      "portraitEffectsMatteEmbedded": captureResult.support.supportsPortraitEffectsMatte,
      "requestedDeviceId": captureResult.requestedDeviceId,
      "captureDeviceId": captureResult.captureDeviceId,
      "captureDeviceName": captureResult.captureDeviceName
    ]
  }

  private func updateSession() {
    guard let deviceId, isActive else {
      print("[PortraitNative] stopping session deviceId=\(deviceId ?? "nil") isActive=\(isActive)")
      if Self.currentActiveView === self {
        Self.currentActiveView = nil
      }
      controller.stop()
      return
    }

    Self.currentActiveView = self
    print("[PortraitNative] configure requested deviceId=\(deviceId) isActive=\(isActive)")
    controller.configure(
      requestedDeviceId: deviceId,
      onReady: { [weak self] in
        print("[PortraitNative] session ready deviceId=\(self?.deviceId ?? "nil")")
        self?.onInitialized()
      },
      onError: { [weak self] error in
        print("[PortraitNative] session error deviceId=\(self?.deviceId ?? "nil") error=\(error.localizedDescription)")
        self?.onError(["message": error.localizedDescription])
      }
    )
  }

  deinit {
    if Self.currentActiveView === self {
      Self.currentActiveView = nil
    }
    controller.stop()
  }
}

private final class CaptureOrientationTracker {
  private let motionManager = CMMotionManager()
  private let operationQueue = OperationQueue()
  private let lock = NSLock()
  private var currentOrientation = AVCaptureVideoOrientation.portrait

  var outputOrientation: AVCaptureVideoOrientation {
    lock.lock()
    defer { lock.unlock() }
    return currentOrientation
  }

  init() {
    operationQueue.name = "dev.komorebi.portrait-capture.orientation"
    operationQueue.maxConcurrentOperationCount = 1
    motionManager.accelerometerUpdateInterval = 0.1

    guard motionManager.isAccelerometerAvailable else { return }
    motionManager.startAccelerometerUpdates(to: operationQueue) { [weak self] data, _ in
      guard
        let self,
        let acceleration = data?.acceleration,
        let orientation = Self.outputOrientation(for: acceleration)
      else { return }

      self.lock.lock()
      self.currentOrientation = orientation
      self.lock.unlock()
    }
  }

  deinit {
    motionManager.stopAccelerometerUpdates()
  }

  private static func outputOrientation(
    for acceleration: CMAcceleration
  ) -> AVCaptureVideoOrientation? {
    let horizontal = abs(acceleration.x)
    let vertical = abs(acceleration.y)
    let flat = abs(acceleration.z)

    // Quando o aparelho está praticamente plano, preserve a última orientação
    // estável em vez de alternar o arquivo durante o disparo.
    guard flat <= horizontal || flat <= vertical else { return nil }

    if horizontal > vertical {
      // A orientação do output é a contrarrotação da orientação física.
      return acceleration.x > 0 ? .landscapeLeft : .landscapeRight
    }

    return acceleration.y > 0 ? .portraitUpsideDown : .portrait
  }
}

private final class PortraitCameraController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  struct CaptureResult {
    let photoURL: URL
    let depthData: AVDepthData
    let portraitEffectsMatte: AVPortraitEffectsMatte?
    let support: CameraPortraitCaptureModule.PortraitSupport
    let requestedDeviceId: String
    let captureDeviceId: String
    let captureDeviceName: String
  }

  let session = AVCaptureSession()

  private let output = AVCapturePhotoOutput()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let orientationTracker = CaptureOrientationTracker()
  private let smileQueue = DispatchQueue(label: "dev.komorebi.portrait.smile")
  private lazy var faceDetector = CIDetector(
    ofType: CIDetectorTypeFace,
    context: nil,
    options: [CIDetectorAccuracy: CIDetectorAccuracyLow]
  )
  var smileDetectionEnabled = false
  var onSmileDetected: (() -> Void)?
  var histogramEnabled = false
  var onHistogramUpdated: (([Double]) -> Void)?
  var zebraHighlightsEnabled = false
  var zebraShadowsEnabled = false
  var onZebraUpdated: ((CGImage?) -> Void)?
  var onEffectFrame: ((CVPixelBuffer, Int32, Bool) -> Void)?
  private let zebraRenderer = ZebraOverlayRenderer()
  private var lastZebraAt = Date.distantPast
  private var lastSmileAt = Date.distantPast
  private var lastHistogramAt = Date.distantPast
  private let sessionQueue = DispatchQueue(label: "dev.komorebi.portrait-capture.session")
  private var configuredRequestedDeviceId: String?
  private var activeCaptureDevice: AVCaptureDevice?
  private var requestedZoomFactor: CGFloat = 1
  private var requestedExposureBias: Float = 0
  private var activeSupport: CameraPortraitCaptureModule.PortraitSupport?
  private var isSessionReady = false
  private var inFlightDelegates: [PortraitPhotoCaptureDelegate] = []

  func configure(
    requestedDeviceId: String,
    onReady: @escaping () -> Void,
    onError: @escaping (Error) -> Void
  ) {
    sessionQueue.async { [weak self] in
      guard let self else { return }

      var configurationOpen = false
      do {
        print("[PortraitNative] configure start requestedDeviceId=\(requestedDeviceId) ready=\(self.isSessionReady) configuredRequestedDeviceId=\(self.configuredRequestedDeviceId ?? "nil") running=\(self.session.isRunning)")
        if self.isSessionReady && self.configuredRequestedDeviceId == requestedDeviceId {
          if !self.session.isRunning {
            print("[PortraitNative] restarting existing session requestedDeviceId=\(requestedDeviceId)")
            self.session.startRunning()
          }
          DispatchQueue.main.async(execute: onReady)
          return
        }

        let requestedDevice = try CameraPortraitCaptureModule.findDevice(requestedDeviceId)
        print("[PortraitNative] requested device found uniqueID=\(requestedDevice.uniqueID) name=\(requestedDevice.localizedName) position=\(requestedDevice.position.rawValue)")
        guard let selection = CameraPortraitCaptureModule.findPortraitCaptureDevice(preferred: requestedDevice) else {
          throw CameraPortraitCaptureModule.PortraitCaptureError.portraitCaptureNotSupported
        }
        print("[PortraitNative] selected capture device uniqueID=\(selection.device.uniqueID) name=\(selection.device.localizedName) depth=\(selection.support.supportsDepthData) matte=\(selection.support.supportsPortraitEffectsMatte)")

        self.session.beginConfiguration()
        configurationOpen = true

        self.session.inputs.forEach { self.session.removeInput($0) }
        self.session.outputs.forEach { self.session.removeOutput($0) }
        self.session.sessionPreset = .photo

        let input = try AVCaptureDeviceInput(device: selection.device)
        guard self.session.canAddInput(input) else {
          throw CameraPortraitCaptureModule.PortraitCaptureError.cannotAddInput
        }
        self.session.addInput(input)
        self.activeCaptureDevice = selection.device

        guard self.session.canAddOutput(self.output) else {
          throw CameraPortraitCaptureModule.PortraitCaptureError.cannotAddOutput
        }
        self.session.addOutput(self.output)

        if self.session.canAddOutput(self.videoOutput) {
          self.videoOutput.alwaysDiscardsLateVideoFrames = true
          self.videoOutput.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
          ]
          self.videoOutput.setSampleBufferDelegate(self, queue: self.smileQueue)
          self.session.addOutput(self.videoOutput)
        }

        let configuredSupport = CameraPortraitCaptureModule.PortraitSupport(
          supportsDepthData: self.output.isDepthDataDeliverySupported && selection.support.supportsDepthData,
          supportsPortraitEffectsMatte: self.output.isPortraitEffectsMatteDeliverySupported && selection.support.supportsPortraitEffectsMatte
        )

        guard configuredSupport.supportsPortraitCapture else {
          throw CameraPortraitCaptureModule.PortraitCaptureError.portraitCaptureNotSupported
        }

        try self.configureDepthFormat(on: selection.device)
        self.output.isDepthDataDeliveryEnabled = configuredSupport.supportsDepthData
        self.output.isPortraitEffectsMatteDeliveryEnabled = configuredSupport.supportsPortraitEffectsMatte

        try self.applyRequestedZoom(to: selection.device)
        try self.applyRequestedExposure(to: selection.device)
        self.configuredRequestedDeviceId = requestedDeviceId
        self.activeCaptureDevice = selection.device
        self.activeSupport = configuredSupport
        self.isSessionReady = true
        self.session.commitConfiguration()
        configurationOpen = false
        self.session.startRunning()
        print("[PortraitNative] configure success requestedDeviceId=\(requestedDeviceId) captureDeviceId=\(selection.device.uniqueID) depth=\(configuredSupport.supportsDepthData) matte=\(configuredSupport.supportsPortraitEffectsMatte) running=\(self.session.isRunning)")
        DispatchQueue.main.async(execute: onReady)
      } catch {
        if configurationOpen {
          self.session.commitConfiguration()
        }
        self.isSessionReady = false
        self.configuredRequestedDeviceId = nil
        self.activeCaptureDevice = nil
        self.activeSupport = nil
        print("[PortraitNative] configure failed requestedDeviceId=\(requestedDeviceId) error=\(error.localizedDescription)")
        DispatchQueue.main.async {
          onError(error)
        }
      }
    }
  }

  func setZoomFactor(_ zoomFactor: CGFloat) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.requestedZoomFactor = zoomFactor
      guard let device = self.activeCaptureDevice else { return }
      try? self.applyRequestedZoom(to: device)
    }
  }

  func setExposureBias(_ bias: Float) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.requestedExposureBias = bias.isFinite ? bias : 0
      guard let device = self.activeCaptureDevice else { return }
      try? self.applyRequestedExposure(to: device)
    }
  }

  private func applyRequestedExposure(to device: AVCaptureDevice) throws {
    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    let bias = max(device.minExposureTargetBias, min(device.maxExposureTargetBias, requestedExposureBias))
    device.setExposureTargetBias(bias, completionHandler: nil)
  }

  private func configureDepthFormat(on device: AVCaptureDevice) throws {
    // Keep the color format selected by the photo preset; choose a matching
    // depth format rather than leaving the sensor's depth format unspecified.
    let formats = device.activeFormat.supportedDepthDataFormats
    guard let format = formats.max(by: { lhs, rhs in
      let left = CMVideoFormatDescriptionGetDimensions(lhs.formatDescription)
      let right = CMVideoFormatDescriptionGetDimensions(rhs.formatDescription)
      return Int64(left.width) * Int64(left.height) < Int64(right.width) * Int64(right.height)
    }) else {
      throw CameraPortraitCaptureModule.PortraitCaptureError.portraitCaptureNotSupported
    }
    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    device.activeDepthDataFormat = format
    let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
    print("[PortraitNative] active depth format=\(dimensions.width)x\(dimensions.height) type=\(CMFormatDescriptionGetMediaSubType(format.formatDescription))")
  }

  private func applyRequestedZoom(to device: AVCaptureDevice) throws {
    let requested = max(
      device.minAvailableVideoZoomFactor,
      min(device.maxAvailableVideoZoomFactor, requestedZoomFactor)
    )
    let format = device.activeFormat
    let ranges: [ClosedRange<CGFloat>]
    if #available(iOS 17.2, *) {
      ranges = format.supportedVideoZoomRangesForDepthDataDelivery
    } else if #available(iOS 16.0, *) {
      ranges = format.supportedVideoZoomFactorsForDepthDataDelivery.map { $0...$0 }
    } else {
      ranges = [format.videoMinZoomFactorForDepthDataDelivery...format.videoMaxZoomFactorForDepthDataDelivery]
    }
    guard let zoom = PortraitDepthPolicy.nearestZoom(to: requested, ranges: ranges) else {
      throw CameraPortraitCaptureModule.PortraitCaptureError.portraitCaptureNotSupported
    }
    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    device.videoZoomFactor = zoom
    if abs(requested - zoom) > 0.001 {
      print("[PortraitNative] constrained portrait zoom requested=\(requested) applied=\(zoom) depthRanges=\(ranges)")
    }
  }

  func stop() {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if self.session.isRunning {
        print("[PortraitNative] stop running session configuredRequestedDeviceId=\(self.configuredRequestedDeviceId ?? "nil")")
        self.session.stopRunning()
      }
    }
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }

    onEffectFrame?(
      pixelBuffer,
      LiveEffectPreviewRenderer.exifOrientation(for: orientationTracker.outputOrientation),
      activeCaptureDevice?.position == .front
    )

    let now = Date()
    if (zebraHighlightsEnabled || zebraShadowsEnabled),
       now.timeIntervalSince(lastZebraAt) >= 1.0 / 30.0 {
      lastZebraAt = now
      let image = zebraRenderer.makeImage(
        from: pixelBuffer,
        highlights: zebraHighlightsEnabled,
        shadows: zebraShadowsEnabled,
        orientation: orientationTracker.outputOrientation,
        mirrored: activeCaptureDevice?.position == .front
      )
      onZebraUpdated?(image)
    }
    if histogramEnabled,
       now.timeIntervalSince(lastHistogramAt) >= 0.2
    {
      lastHistogramAt = now
      let bins = makeHistogram(from: pixelBuffer)
      DispatchQueue.main.async { [weak self] in
        self?.onHistogramUpdated?(bins)
      }
    }

    guard smileDetectionEnabled,
          now.timeIntervalSince(lastSmileAt) >= 2.5,
          let detector = faceDetector
    else { return }

    let image = CIImage(cvPixelBuffer: pixelBuffer)
    let features = detector.features(
      in: image,
      options: [CIDetectorSmile: true]
    )
    guard features.contains(where: { ($0 as? CIFaceFeature)?.hasSmile == true }) else {
      return
    }

    lastSmileAt = now
    DispatchQueue.main.async { [weak self] in self?.onSmileDetected?() }
  }

  private func makeHistogram(from pixelBuffer: CVPixelBuffer) -> [Double] {
    let binCount = 64
    var bins = [Int](repeating: 0, count: binCount)

    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer {
      CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
    }

    var peak = 0

    if CVPixelBufferIsPlanar(pixelBuffer),
       CVPixelBufferGetPlaneCount(pixelBuffer) > 0,
       let lumaAddress = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0)
    {
      let width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
      let height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
      let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
      let sampleStep = max(1, Int(sqrt(Double(width * height) / 4096.0)))

      for y in stride(from: 0, to: height, by: sampleStep) {
        let row = lumaAddress
          .advanced(by: y * bytesPerRow)
          .assumingMemoryBound(to: UInt8.self)

        for x in stride(from: 0, to: width, by: sampleStep) {
          let bin = min(binCount - 1, Int(row[x]) >> 2)
          bins[bin] += 1
          peak = max(peak, bins[bin])
        }
      }
    } else if let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) {
      let width = CVPixelBufferGetWidth(pixelBuffer)
      let height = CVPixelBufferGetHeight(pixelBuffer)
      let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
      let sampleStep = max(1, Int(sqrt(Double(width * height) / 4096.0)))

      for y in stride(from: 0, to: height, by: sampleStep) {
        let row = baseAddress
          .advanced(by: y * bytesPerRow)
          .assumingMemoryBound(to: UInt8.self)

        for x in stride(from: 0, to: width, by: sampleStep) {
          let offset = x * 4
          let blue = Int(row[offset])
          let green = Int(row[offset + 1])
          let red = Int(row[offset + 2])
          let luminance = (29 * blue + 150 * green + 77 * red) >> 8
          let bin = min(binCount - 1, luminance >> 2)

          bins[bin] += 1
          peak = max(peak, bins[bin])
        }
      }
    }

    guard peak > 0 else {
      return [Double](repeating: 0, count: binCount)
    }

    return bins.map { Double($0) / Double(peak) }
  }

  func capture(flashMode: String, outputFormat: String) async throws -> CaptureResult {
    try await withCheckedThrowingContinuation { continuation in
      sessionQueue.async { [weak self] in
        guard
          let self,
          self.isSessionReady,
          self.session.isRunning,
          let support = self.activeSupport,
          let captureDevice = self.activeCaptureDevice,
          let requestedDeviceId = self.configuredRequestedDeviceId
        else {
          print("[PortraitNative] capture blocked ready=\(self?.isSessionReady ?? false) running=\(self?.session.isRunning ?? false) configuredRequestedDeviceId=\(self?.configuredRequestedDeviceId ?? "nil")")
          continuation.resume(throwing: CameraPortraitCaptureModule.PortraitCaptureError.captureSessionNotReady)
          return
        }

        do {
          try self.applyRequestedZoom(to: captureDevice)
        } catch {
          continuation.resume(throwing: error)
          return
        }
        guard self.output.isDepthDataDeliverySupported else {
          continuation.resume(throwing: CameraPortraitCaptureModule.PortraitCaptureError.portraitCaptureNotSupported)
          return
        }
        self.output.isDepthDataDeliveryEnabled = true
        self.output.isPortraitEffectsMatteDeliveryEnabled = self.output.isPortraitEffectsMatteDeliverySupported
        print("[PortraitNative] capture depth pipeline zoom=\(captureDevice.videoZoomFactor) depthEnabled=\(self.output.isDepthDataDeliveryEnabled) matteEnabled=\(self.output.isPortraitEffectsMatteDeliveryEnabled)")

        let usesHevc = outputFormat != "jpeg" && self.output.availablePhotoCodecTypes.contains(.hevc)
        let photoURL = FileManager.default.temporaryDirectory
          .appendingPathComponent("komorebi-portrait-\(UUID().uuidString).\(usesHevc ? "heic" : "jpg")")
        let codec = usesHevc ? AVVideoCodecType.hevc : AVVideoCodecType.jpeg
        let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: codec])

        settings.isHighResolutionPhotoEnabled = self.output.isHighResolutionCaptureEnabled
        let avFlashMode = CameraPortraitCaptureModule.toAVFlashMode(flashMode)
        if self.output.supportedFlashModes.contains(avFlashMode) {
          settings.flashMode = avFlashMode
        } else {
          print("[PortraitNative] requested flash unsupported flashMode=\(flashMode)")
        }
        settings.isDepthDataDeliveryEnabled = self.output.isDepthDataDeliveryEnabled
        settings.isPortraitEffectsMatteDeliveryEnabled = self.output.isPortraitEffectsMatteDeliveryEnabled
        settings.embedsDepthDataInPhoto = settings.isDepthDataDeliveryEnabled
        settings.embedsPortraitEffectsMatteInPhoto = settings.isPortraitEffectsMatteDeliveryEnabled

        if
          let connection = self.output.connection(with: .video),
          connection.isVideoOrientationSupported
        {
          connection.videoOrientation = self.orientationTracker.outputOrientation
        }

        let delegate = PortraitPhotoCaptureDelegate(
          photoURL: photoURL,
          support: support,
          requestedDeviceId: requestedDeviceId,
          captureDeviceId: captureDevice.uniqueID,
          captureDeviceName: captureDevice.localizedName
        )
        print("[PortraitNative] capturePhoto now requestedDeviceId=\(requestedDeviceId) captureDeviceId=\(captureDevice.uniqueID) flashMode=\(settings.flashMode.rawValue) photoURL=\(photoURL.lastPathComponent) codec=\(codec.rawValue) depth=\(support.supportsDepthData) matte=\(support.supportsPortraitEffectsMatte)")
        delegate.onFinish = { [weak self, weak delegate] in
          guard let self, let delegate else { return }
          self.sessionQueue.async {
            self.inFlightDelegates.removeAll { $0 === delegate }
          }
        }
        self.inFlightDelegates.append(delegate)
        delegate.capture(with: self.output, settings: settings, continuation: continuation)
      }
    }
  }
}

private final class PortraitPhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
  private let photoURL: URL
  private let support: CameraPortraitCaptureModule.PortraitSupport
  private let requestedDeviceId: String
  private let captureDeviceId: String
  private let captureDeviceName: String
  private var photoData: Data?
  private var depthData: AVDepthData?
  private var portraitEffectsMatte: AVPortraitEffectsMatte?
  private var continuation: CheckedContinuation<PortraitCameraController.CaptureResult, Error>?
  var onFinish: (() -> Void)?

  init(
    photoURL: URL,
    support: CameraPortraitCaptureModule.PortraitSupport,
    requestedDeviceId: String,
    captureDeviceId: String,
    captureDeviceName: String
  ) {
    self.photoURL = photoURL
    self.support = support
    self.requestedDeviceId = requestedDeviceId
    self.captureDeviceId = captureDeviceId
    self.captureDeviceName = captureDeviceName
    super.init()
  }

  func capture(
    with output: AVCapturePhotoOutput,
    settings: AVCapturePhotoSettings,
    continuation: CheckedContinuation<PortraitCameraController.CaptureResult, Error>
  ) {
    self.continuation = continuation
    output.capturePhoto(with: settings, delegate: self)
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingPhoto photo: AVCapturePhoto,
    error: Error?
  ) {
    if let error {
      print("[PortraitNative] didFinishProcessingPhoto error=\(error.localizedDescription)")
      finish(with: .failure(error))
      return
    }

    guard let depthData = photo.depthData else {
      finish(with: .failure(CameraPortraitCaptureModule.PortraitCaptureError.missingDepthData))
      return
    }
    guard PortraitDepthRenderer.isUsable(depthData) else {
      print("[PortraitNative] rejecting empty sensor depth type=\(depthData.depthDataType)")
      finish(with: .failure(CameraPortraitCaptureModule.PortraitCaptureError.invalidDepthData))
      return
    }
    self.depthData = depthData
    portraitEffectsMatte = photo.portraitEffectsMatte
    photoData = photo.fileDataRepresentation()
    print("[PortraitNative] sensor depthType=\(depthData.depthDataType) matte=\(portraitEffectsMatte != nil)")
    print("[PortraitNative] didFinishProcessingPhoto hasData=\(photoData != nil) bytes=\(photoData?.count ?? 0)")
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
    error: Error?
  ) {
    if let error {
      print("[PortraitNative] didFinishCapture error=\(error.localizedDescription)")
      finish(with: .failure(error))
      return
    }

    guard let photoData, let depthData else {
      print("[PortraitNative] didFinishCapture missing photo data")
      finish(with: .failure(CameraPortraitCaptureModule.PortraitCaptureError.missingPhotoData))
      return
    }

    do {
      let embeddedData = try PortraitDepthRenderer.embeddingDepth(
        in: photoData, depthData: depthData, portraitEffectsMatte: portraitEffectsMatte
      )
      try embeddedData.write(to: photoURL, options: .atomic)
      print("[PortraitNative] didFinishCapture wrote photo=\(photoURL.lastPathComponent)")
      finish(with: .success(PortraitCameraController.CaptureResult(
        photoURL: photoURL,
        depthData: depthData,
        portraitEffectsMatte: portraitEffectsMatte,
        support: CameraPortraitCaptureModule.PortraitSupport(
          supportsDepthData: true,
          supportsPortraitEffectsMatte: CGImageSourceCreateWithData(embeddedData as CFData, nil).map {
            CGImageSourceCopyAuxiliaryDataInfoAtIndex($0, CGImageSourceGetPrimaryImageIndex($0), kCGImageAuxiliaryDataTypePortraitEffectsMatte) != nil
          } ?? false
        ),
        requestedDeviceId: requestedDeviceId,
        captureDeviceId: captureDeviceId,
        captureDeviceName: captureDeviceName
      )))
    } catch {
      print("[PortraitNative] didFinishCapture write error=\(error.localizedDescription)")
      finish(with: .failure(error))
    }
  }

  private func finish(with result: Result<PortraitCameraController.CaptureResult, Error>) {
    guard let continuation else {
      return
    }

    self.continuation = nil
    onFinish?()
    onFinish = nil
    switch result {
    case .success(let captureResult):
      continuation.resume(returning: captureResult)
    case .failure(let error):
      continuation.resume(throwing: error)
    }
  }
}

// Render before LUTs and cropping so Apple's depth map and subject matte stay
// aligned with the full-resolution image used to calculate the blur.
enum PortraitDepthRenderer {
  static func isUsable(_ data: AVDepthData) -> Bool {
    // A non-nil AVDepthData may still be empty. Check its type before touching
    // or converting the map to avoid Core Video attempting a 0 x 0 allocation.
    guard [kCVPixelFormatType_DisparityFloat16, kCVPixelFormatType_DisparityFloat32,
           kCVPixelFormatType_DepthFloat16, kCVPixelFormatType_DepthFloat32].contains(data.depthDataType) else {
      return false
    }
    let map = data.depthDataMap
    return CVPixelBufferGetWidth(map) > 0 && CVPixelBufferGetHeight(map) > 0
  }

  static func embeddingDepth(
    in photoData: Data, depthData: AVDepthData,
    portraitEffectsMatte: AVPortraitEffectsMatte?
  ) throws -> Data {
    guard isUsable(depthData) else {
      throw CameraPortraitCaptureModule.PortraitCaptureError.invalidDepthData
    }
    guard let source = CGImageSourceCreateWithData(photoData as CFData, nil) else {
      throw CameraPortraitCaptureModule.PortraitCaptureError.missingPhotoData
    }
    let index = CGImageSourceGetPrimaryImageIndex(source)
    let embeddedDepth = [kCGImageAuxiliaryDataTypeDisparity, kCGImageAuxiliaryDataTypeDepth].contains {
      CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, index, $0) != nil
    }
    let embeddedMatte = CGImageSourceCopyAuxiliaryDataInfoAtIndex(
      source, index, kCGImageAuxiliaryDataTypePortraitEffectsMatte
    ) != nil
    print("[PortraitNative] file attachments primaryIndex=\(index) images=\(CGImageSourceGetCount(source)) depth=\(embeddedDepth) matte=\(embeddedMatte)")
    if embeddedDepth && (portraitEffectsMatte == nil || embeddedMatte) { return photoData }

    let data = NSMutableData()
    guard let type = CGImageSourceGetType(source),
          let destination = CGImageDestinationCreateWithData(data, type, 1, nil) else {
      throw CameraPortraitCaptureModule.PortraitCaptureError.depthEmbeddingFailed
    }
    CGImageDestinationAddImageFromSource(destination, source, index, nil)
    var depthType: NSString?
    let disparity = depthData.converting(toDepthDataType: kCVPixelFormatType_DisparityFloat16)
    guard let depthInfo = disparity.dictionaryRepresentation(forAuxiliaryDataType: &depthType),
          let depthType else {
      throw CameraPortraitCaptureModule.PortraitCaptureError.depthEmbeddingFailed
    }
    CGImageDestinationAddAuxiliaryDataInfo(destination, depthType as CFString, depthInfo as CFDictionary)
    if let portraitEffectsMatte {
      var matteType: NSString?
      if let info = portraitEffectsMatte.dictionaryRepresentation(forAuxiliaryDataType: &matteType),
         let matteType {
        CGImageDestinationAddAuxiliaryDataInfo(destination, matteType as CFString, info as CFDictionary)
      }
    }
    guard CGImageDestinationFinalize(destination),
          let verified = CGImageSourceCreateWithData(data, nil),
          CGImageSourceCopyAuxiliaryDataInfoAtIndex(
            verified, CGImageSourceGetPrimaryImageIndex(verified), depthType as CFString
          ) != nil else {
      throw CameraPortraitCaptureModule.PortraitCaptureError.depthEmbeddingFailed
    }
    print("[PortraitNative] rebuilt file attachments depth=true")
    return data as Data
  }

  static func hasDepthData(at url: URL) -> Bool {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return false }
    return [kCGImageAuxiliaryDataTypeDisparity, kCGImageAuxiliaryDataTypeDepth].contains {
      CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, CGImageSourceGetPrimaryImageIndex(source), $0) != nil
    }
  }

  static func render(
    photoURL: URL, depthData: AVDepthData,
    portraitEffectsMatte: AVPortraitEffectsMatte?, aperture: Double
  ) throws -> URL {
    guard isUsable(depthData) else {
      throw CameraPortraitCaptureModule.PortraitCaptureError.invalidDepthData
    }
    let context = CIContext(options: [.cacheIntermediates: false])
    guard let source = CGImageSourceCreateWithURL(photoURL as CFURL, nil),
          let input = CIImage(contentsOf: photoURL, options: [.applyOrientationProperty: false]) else {
      throw CameraPortraitCaptureModule.PortraitCaptureError.missingPhotoData
    }
    let properties = CGImageSourceCopyPropertiesAtIndex(
      source, CGImageSourceGetPrimaryImageIndex(source), nil
    ) as? [String: Any] ?? [:]
    let orientation = CGImagePropertyOrientation(
      rawValue: (properties[kCGImagePropertyOrientation as String] as? NSNumber)?.uint32Value ?? 1
    ) ?? .up
    let disparity = depthData.converting(toDepthDataType: kCVPixelFormatType_DisparityFloat32)
    let disparityImage = CIImage(cvPixelBuffer: disparity.depthDataMap)
    let matteImage = portraitEffectsMatte.map { CIImage(cvPixelBuffer: $0.mattingImage) }
    print("[PortraitNative] render input=\(input.extent) disparity=\(disparityImage.extent) orientation=\(orientation.rawValue) matte=\(matteImage != nil)")
    // Use the sensor objects directly; a missing HEIC attachment must not be
    // mistaken for the camera failing to deliver depth.
    guard let filter = context.depthBlurEffectFilter(
      for: input, disparityImage: disparityImage,
      portraitEffectsMatte: matteImage, orientation: orientation, options: nil
    ) else {
      print("[PortraitNative] depth filter creation failed depthType=\(disparity.depthDataType) matte=\(matteImage != nil)")
      throw CameraPortraitCaptureModule.PortraitCaptureError.portraitRenderingFailed
    }

    filter.setValue(aperture.isFinite ? max(1.4, min(16, aperture)) : 4.5, forKey: "inputAperture")
    guard let output = filter.outputImage,
          let image = context.createCGImage(
            output, from: output.extent, format: .RGBA8,
            colorSpace: CGColorSpace(name: CGColorSpace.displayP3)
          ) else {
      print("[PortraitNative] depth filter failed to render pixels")
      throw CameraPortraitCaptureModule.PortraitCaptureError.portraitRenderingFailed
    }

    let isJpeg = photoURL.pathExtension.lowercased() == "jpg"
    let renderedURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("komorebi-portrait-blur-\(UUID().uuidString).\(isJpeg ? "jpg" : "heic")")
    guard let destination = CGImageDestinationCreateWithURL(
      renderedURL as CFURL,
      (isJpeg ? UTType.jpeg : UTType.heic).identifier as CFString,
      1,
      nil
    ) else {
      throw CameraPortraitCaptureModule.PortraitCaptureError.captureFailed
    }
    CGImageDestinationAddImage(destination, image, properties as CFDictionary)
    // Keep the sensor depth alongside the rendered pixels for downstream saves.
    for type in [kCGImageAuxiliaryDataTypeDisparity, kCGImageAuxiliaryDataTypeDepth,
                 kCGImageAuxiliaryDataTypePortraitEffectsMatte] {
      if let data = CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, CGImageSourceGetPrimaryImageIndex(source), type) {
        CGImageDestinationAddAuxiliaryDataInfo(destination, type, data)
      }
    }
    guard CGImageDestinationFinalize(destination) else {
      try? FileManager.default.removeItem(at: renderedURL)
      throw CameraPortraitCaptureModule.PortraitCaptureError.captureFailed
    }
    guard hasDepthData(at: renderedURL) else {
      try? FileManager.default.removeItem(at: renderedURL)
      throw CameraPortraitCaptureModule.PortraitCaptureError.depthEmbeddingFailed
    }
    print("[PortraitNative] rendered portrait aperture=\(aperture) depthEmbedded=true")
    return renderedURL
  }
}

// Kept in the existing pod source so Xcode picks it up without regenerating Pods.
enum PortraitDepthPolicy {
  static func nearestZoom(to requested: CGFloat, ranges: [ClosedRange<CGFloat>]) -> CGFloat? {
    guard requested.isFinite else { return nil }
    return ranges.map { max($0.lowerBound, min($0.upperBound, requested)) }
      .filter { $0.isFinite && $0 > 0 }
      .min { abs($0 - requested) < abs($1 - requested) }
  }
}
