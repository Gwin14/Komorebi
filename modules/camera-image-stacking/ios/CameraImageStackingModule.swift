import ExpoModulesCore
import AVFoundation
import CoreImage
import CoreMotion
import ImageIO
import Metal
import os
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

public final class CameraImageStackingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CameraImageStacking")

    Function("isSupported") { () -> Bool in
      MTLCreateSystemDefaultDevice() != nil
    }

    View(ImageStackingCameraView.self) {
      Events(
        "onInitialized",
        "onError",
        "onHistogramUpdated",
        "onStackingProgress",
        "onPreviewImage"
      )

      Prop("deviceId") { (view, deviceId: String?) in
        view.deviceId = deviceId
      }
      Prop("isActive") { (view, active: Bool?) in
        view.isActive = active ?? true
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
      Prop("exposureBias") { (view, value: Double?) in
        view.exposureBias = Float(value ?? 0)
      }
      Prop("previewDoubleExposure") { (view, enabled: Bool?) in
        view.previewDoubleExposure = enabled ?? false
      }
      Prop("previewStacking") { (view, enabled: Bool?) in
        view.previewStacking = enabled ?? false
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
      guard AVCaptureDevice(uniqueID: deviceId) != nil else {
        throw StackingError.sessionNotReady
      }
      let available = MTLCreateSystemDefaultDevice() != nil
      return [
        "available": available,
        "supportedStrategies": available
          ? StackingStrategyID.allCases.map(\.rawValue)
          : [],
        "maximumBulbDurationSeconds": available ? 300 : 0
      ]
    }

    AsyncFunction("startImageStackingCapture") { (options: [String: Any]) async throws -> [String: Any] in
      guard
        let deviceId = options["deviceId"] as? String,
        let rawStrategy = options["strategyId"] as? String,
        let strategyID = StackingStrategyID(rawValue: rawStrategy),
        let view = await ImageStackingCameraView.activeView(for: deviceId)
      else { throw StackingError.sessionNotReady }

      return try await view.startCapture(strategyID: strategyID, options: options).dictionary
    }

    AsyncFunction("stopImageStackingCapture") { () async in
      await ImageStackingCameraView.activeView()?.stopContinuousCapture()
    }

    AsyncFunction("captureNextImageStackingExposure") { () async in
      await ImageStackingCameraView.activeView()?.captureNextDoubleExposure()
    }

    AsyncFunction("cancelImageStackingCapture") { () async in
      await ImageStackingCameraView.activeView()?.cancelCapture()
    }
  }
}

public final class ImageStackingCameraView: ExpoView {
  private static weak var currentActiveView: ImageStackingCameraView?
  private let controller = StackingCaptureCoordinator()
  private let zebraOverlay = UIImageView()

  let onInitialized = EventDispatcher()
  let onError = EventDispatcher()
  let onHistogramUpdated = EventDispatcher()
  let onStackingProgress = EventDispatcher()
  let onPreviewImage = EventDispatcher()
  let effectRenderer = LiveEffectPreviewRenderer()
  var previewLutSize = 0 {
    didSet { effectRenderer.setLut(size: previewLutSize, values: previewLutValues) }
  }
  var previewLutValues: [Double] = [] {
    didSet { effectRenderer.setLut(size: previewLutSize, values: previewLutValues) }
  }

  var deviceId: String? {
    didSet { updateSession() }
  }
  var isActive = true {
    didSet { updateSession() }
  }
  var histogramEnabled = false {
    didSet { controller.histogramEnabled = histogramEnabled }
  }
  var zebraHighlightsEnabled = false {
    didSet {
      controller.zebraHighlightsEnabled = zebraHighlightsEnabled
      if !zebraHighlightsEnabled && !zebraShadowsEnabled { zebraOverlay.image = nil }
    }
  }
  var zebraShadowsEnabled = false {
    didSet {
      controller.zebraShadowsEnabled = zebraShadowsEnabled
      if !zebraHighlightsEnabled && !zebraShadowsEnabled { zebraOverlay.image = nil }
    }
  }
  var exposureBias: Float = 0 {
    didSet { controller.setExposureBias(exposureBias) }
  }
  var previewDoubleExposure = false {
    didSet {
      if previewDoubleExposure == oldValue { return }
      controller.previewDoubleExposureEnabled = previewDoubleExposure
    }
  }
  var previewStacking = false {
    didSet {
      if previewStacking == oldValue { return }
      controller.previewStackingEnabled = previewStacking
    }
  }

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    previewLayer.videoGravity = .resizeAspectFill
    previewLayer.session = controller.session
    addSubview(effectRenderer.imageView)
    zebraOverlay.contentMode = .scaleAspectFill
    zebraOverlay.clipsToBounds = true
    zebraOverlay.isUserInteractionEnabled = false
    addSubview(zebraOverlay)
    controller.onProgress = { [weak self] snapshot in
      DispatchQueue.main.async {
        self?.onStackingProgress(snapshot.dictionary)
      }
    }
    controller.onHistogram = { [weak self] bins in
      DispatchQueue.main.async {
        self?.onHistogramUpdated(["bins": bins])
      }
    }
    controller.onDoubleExposurePreview = { [weak self] image in
      let base64 = image.flatMap {
        UIImage(cgImage: $0).jpegData(compressionQuality: 0.72)?.base64EncodedString()
      }
      DispatchQueue.main.async {
        self?.onPreviewImage(["type": "doubleExposure", "base64": base64 as Any? ?? NSNull()])
      }
    }
    controller.onStackingPreview = { [weak self] image in
      let base64 = image.flatMap {
        UIImage(cgImage: $0).jpegData(compressionQuality: 0.65)?.base64EncodedString()
      }
      DispatchQueue.main.async {
        self?.onPreviewImage(["type": "stacking", "base64": base64 as Any? ?? NSNull()])
      }
    }
    controller.onZebraUpdated = { [weak self] image in
      DispatchQueue.main.async { self?.zebraOverlay.image = image.map { UIImage(cgImage: $0) } }
    }
    controller.onEffectFrame = { [weak self] buffer, mirrored in
      self?.effectRenderer.submit(buffer, orientation: 1, mirrored: mirrored)
    }
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(appDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(sessionWasInterrupted(_:)),
      name: AVCaptureSession.wasInterruptedNotification,
      object: controller.session
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(sessionRuntimeError(_:)),
      name: AVCaptureSession.runtimeErrorNotification,
      object: controller.session
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(memoryPressure),
      name: UIApplication.didReceiveMemoryWarningNotification,
      object: nil
    )
  }

  public override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
  private var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }

  public override func layoutSubviews() {
    super.layoutSubviews()
    effectRenderer.imageView.frame = bounds
    zebraOverlay.frame = bounds
  }

  @MainActor
  static func activeView(for deviceId: String? = nil) -> ImageStackingCameraView? {
    guard let view = currentActiveView, view.isActive else { return nil }
    if let deviceId, view.deviceId != deviceId { return nil }
    return view
  }

  func startCapture(
    strategyID: StackingStrategyID,
    options: [String: Any]
  ) async throws -> StackingResult {
    previewDoubleExposure = options["previewDoubleExposure"] as? Bool ?? false
    previewStacking = options["previewStacking"] as? Bool ?? false
    return try await controller.startCapture(strategyID: strategyID, options: options)
  }

  func stopBulbCapture() { controller.stopBulbCapture() }
  func stopMotionBlurCapture() { controller.stopMotionBlurCapture() }
  func stopContinuousCapture() {
    stopBulbCapture()
    stopMotionBlurCapture()
  }
  func captureNextDoubleExposure() { controller.captureNextDoubleExposure() }
  func cancelCapture() { controller.cancelCapture() }

  private func updateSession() {
    guard let deviceId, isActive else {
      if Self.currentActiveView === self { Self.currentActiveView = nil }
      controller.stopSession()
      return
    }
    Self.currentActiveView = self
    controller.configure(
      deviceId: deviceId,
      onReady: { [weak self] in self?.onInitialized() },
      onError: { [weak self] error in
        self?.onError(["message": error.localizedDescription])
      }
    )
  }

  @objc private func appDidEnterBackground() { cancelCapture() }

  @objc private func sessionWasInterrupted(_ notification: Notification) {
    cancelCapture()
    onError(["code": "cameraInterrupted", "message": "Camera session was interrupted"])
  }

  @objc private func sessionRuntimeError(_ notification: Notification) {
    cancelCapture()
    let error = notification.userInfo?[AVCaptureSessionErrorKey] as? Error
    onError([
      "code": "cameraRuntimeError",
      "message": error?.localizedDescription ?? "Camera session failed"
    ])
  }

  @objc private func memoryPressure() {
    cancelCapture()
    onError(["code": "memoryPressure", "message": "Capture cancelled due to memory pressure"])
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    if Self.currentActiveView === self { Self.currentActiveView = nil }
    controller.cancelCapture()
    controller.stopSession()
  }
}

final class StackingCaptureCoordinator: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, @unchecked Sendable {
  let session = AVCaptureSession()
  var histogramEnabled = false
  var onProgress: ((StackingProgressSnapshot) -> Void)?
  var onHistogram: (([Double]) -> Void)?
  var onDoubleExposurePreview: ((CGImage?) -> Void)?
  var onStackingPreview: ((CGImage?) -> Void)?
  var onEffectFrame: ((CVPixelBuffer, Bool) -> Void)?
  var zebraHighlightsEnabled = false
  var zebraShadowsEnabled = false
  var onZebraUpdated: ((CGImage?) -> Void)?

  private let photoOutput = AVCapturePhotoOutput()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let sessionQueue = DispatchQueue(label: "dev.komorebi.image-stacking.session")
  private let videoQueue = DispatchQueue(label: "dev.komorebi.image-stacking.video")
  private let analysisQueue = DispatchQueue(label: "dev.komorebi.image-stacking.analysis", qos: .userInitiated)
  private let stateLock = NSLock()
  private var doubleExposurePreviewEnabled = false
  private var stackingPreviewEnabled = false
  private var stackingPreviewGeneration = 0
  private var lastStackingPreviewAt = Date.distantPast
  private var stackingPreviewInFlight = false

  var previewDoubleExposureEnabled: Bool {
    get {
      stateLock.lock()
      defer { stateLock.unlock() }
      return doubleExposurePreviewEnabled
    }
    set {
      stateLock.lock()
      doubleExposurePreviewEnabled = newValue
      stateLock.unlock()
      if !newValue { onDoubleExposurePreview?(nil) }
    }
  }

  var previewStackingEnabled: Bool {
    get {
      stateLock.lock()
      defer { stateLock.unlock() }
      return stackingPreviewEnabled
    }
    set {
      stateLock.lock()
      stackingPreviewEnabled = newValue
      stackingPreviewGeneration += 1
      stateLock.unlock()
      if !newValue { onStackingPreview?(nil) }
    }
  }
  private let logger = Logger(subsystem: "dev.komorebi", category: "ImageStacking")
  private let orientationTracker = StackingOrientationTracker()
  private let context: CIContext

  private var device: AVCaptureDevice?
  private var configuredDeviceID: String?
  private var requestedExposureBias: Float = 0
  private var ready = false
  private var busy = false
  private var cancelled = false
  private var activeStrategyID: StackingStrategyID?
  private var startedAt = Date()
  private var sceneLuminance = 0.35
  private var lastHistogramAt = Date.distantPast
  private let zebraRenderer = ZebraOverlayRenderer()
  private var lastZebraAt = Date.distantPast
  private var lastBulbFrameAt = Date.distantPast
  private var bulbAcceptingFrames = false
  private var inFlightDelegates: [StackingPhotoDelegate] = []
  private var bulbAccumulator: BulbAccumulator?
  private var bulbContinuation: CheckedContinuation<StackingResult, Error>?
  private var bulbTimer: DispatchWorkItem?
  private var bulbOutputFormat = "heif"
  private var bulbPlan: StackingCapturePlan?
  private var bulbFrameInterval: TimeInterval = 0.1
  private var lastMotionBlurFrameAt = Date.distantPast
  private var motionBlurAcceptingFrames = false
  private var motionBlurAccumulator: MotionBlurAccumulator?
  private var motionBlurContinuation: CheckedContinuation<StackingResult, Error>?
  private var motionBlurTimer: DispatchWorkItem?
  private var motionBlurOutputFormat = "heif"
  private var motionBlurPlan: StackingCapturePlan?
  private var motionBlurFrameInterval: TimeInterval = 0.1
  private var doubleExposureStore: FrameStore?
  private var doubleExposureStrategy: (any StackingStrategy)?
  private var doubleExposureContinuation: CheckedContinuation<StackingResult, Error>?
  private var doubleExposureOutputFormat = "heif"
  private var doubleExposureOptions: [String: Any] = [:]
  private var doubleExposureAdvancing = false
  private var currentPhase: StackingPhase = .idle
  private var currentPhaseStartedAt = Date()

  override init() {
    let workingColorSpace = CGColorSpace(name: CGColorSpace.extendedLinearSRGB)
      ?? CGColorSpaceCreateDeviceRGB()
    let displayColorSpace = CGColorSpace(name: CGColorSpace.sRGB)
      ?? CGColorSpaceCreateDeviceRGB()
    let contextOptions: [CIContextOption: Any] = [
      .cacheIntermediates: false,
      .workingColorSpace: workingColorSpace,
      .workingFormat: CIFormat.RGBAh.rawValue,
      .outputColorSpace: displayColorSpace
    ]
    if let metal = MTLCreateSystemDefaultDevice() {
      context = CIContext(mtlDevice: metal, options: contextOptions)
    } else {
      context = CIContext(options: contextOptions)
    }
    super.init()
  }

  func configure(
    deviceId: String,
    onReady: @escaping () -> Void,
    onError: @escaping (Error) -> Void
  ) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if self.ready && self.configuredDeviceID == deviceId {
        if !self.session.isRunning { self.session.startRunning() }
        DispatchQueue.main.async(execute: onReady)
        return
      }
      var configurationOpen = false
      do {
        guard let device = AVCaptureDevice(uniqueID: deviceId) else {
          throw StackingError.sessionNotReady
        }
        self.session.beginConfiguration()
        configurationOpen = true
        self.session.inputs.forEach(self.session.removeInput)
        self.session.outputs.forEach(self.session.removeOutput)
        self.session.sessionPreset = .photo

        let input = try AVCaptureDeviceInput(device: device)
        guard self.session.canAddInput(input) else { throw StackingError.cannotAddInput }
        self.session.addInput(input)
        guard self.session.canAddOutput(self.photoOutput) else { throw StackingError.cannotAddOutput }
        self.session.addOutput(self.photoOutput)
        self.photoOutput.maxPhotoQualityPrioritization = .quality

        guard self.session.canAddOutput(self.videoOutput) else { throw StackingError.cannotAddOutput }
        self.videoOutput.alwaysDiscardsLateVideoFrames = true
        self.videoOutput.videoSettings = [
          kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        self.videoOutput.setSampleBufferDelegate(self, queue: self.videoQueue)
        self.session.addOutput(self.videoOutput)

        self.device = device
        self.configuredDeviceID = deviceId
        self.applyExposureBias(to: device)
        self.ready = true
        self.session.commitConfiguration()
        configurationOpen = false
        self.session.startRunning()
        DispatchQueue.main.async(execute: onReady)
      } catch {
        if configurationOpen { self.session.commitConfiguration() }
        if self.session.isRunning { self.session.stopRunning() }
        self.ready = false
        self.device = nil
        self.configuredDeviceID = nil
        DispatchQueue.main.async { onError(error) }
      }
    }
  }

  func stopSession() {
    cancelCapture()
    sessionQueue.async { [weak self] in
      guard let self, self.session.isRunning else { return }
      self.session.stopRunning()
    }
  }

  func setExposureBias(_ value: Float) {
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.requestedExposureBias = value
      guard let device = self.device else { return }
      self.applyExposureBias(to: device)
    }
  }

  private func applyExposureBias(to device: AVCaptureDevice) {
    let bias = min(
      device.maxExposureTargetBias,
      max(device.minExposureTargetBias, requestedExposureBias)
    )
    do {
      try device.lockForConfiguration()
      device.setExposureTargetBias(bias, completionHandler: nil)
      device.unlockForConfiguration()
    } catch {
      logger.error(
        "Could not set exposure bias: \(error.localizedDescription, privacy: .public)"
      )
    }
  }

  func startCapture(
    strategyID: StackingStrategyID,
    options: [String: Any]
  ) async throws -> StackingResult {
    if let error = beginOperation(strategyID: strategyID) { throw error }

    guard let strategy = StackingStrategyRegistry.shared.strategy(for: strategyID) else {
      finishOperation()
      throw StackingError.unsupportedStrategy
    }
    let plan = strategy.capturePlan(sceneLuminance: sceneLuminance, options: options)
    emit(.preparing, strategyID: strategyID)
    sessionQueue.sync { self.applyOutputOrientation() }

    if strategyID == .doubleExposure {
      return try await startDoubleExposure(strategy: strategy, plan: plan, options: options)
    }

    lockCaptureSettings()

    if plan.usesVideoFrames {
      switch strategyID {
      case .bulb:
        return try await startBulb(plan: plan, options: options)
      case .motionBlur:
        return try await startMotionBlur(plan: plan, options: options)
      case .doubleExposure:
        finishOperation()
        throw StackingError.unsupportedStrategy
      }
    }

    let store: FrameStore
    do {
      store = try FrameStore()
    } catch {
      finishOperation()
      emit(.failed, strategyID: strategyID)
      throw error
    }
    defer {
      store.cleanup()
      restoreCaptureSettings()
      finishOperation()
    }
    do {
      emit(.capturing, strategyID: strategyID)
      for index in 0..<plan.targetFrameCount {
        if isCancelled() { throw StackingError.cancelled }
        let captured = try await capturePhoto()
        _ = try store.append(data: captured.data, metadata: captured.metadata)
        emit(
          .capturing,
          strategyID: strategyID,
          captured: index + 1,
          progress: Double(index + 1) / Double(plan.targetFrameCount) * 0.45
        )
      }

      emit(.analyzing, strategyID: strategyID, captured: store.frames.count, progress: 0.48)
      let composed = try analysisQueue.sync {
        try strategy.compose(
          frames: store.frames,
          context: context,
          options: options,
          progress: { accepted, rejected, processed in
            self.emit(
              .compositing,
              strategyID: strategyID,
              captured: store.frames.count,
              accepted: accepted,
              rejected: rejected,
              progress: 0.48 + 0.37 * Double(processed) / Double(max(1, store.frames.count))
            )
          },
          isCancelled: isCancelled
        )
      }
      guard composed.accepted >= plan.minimumFrameCount else {
        throw StackingError.insufficientFrames
      }
      emit(
        .exporting,
        strategyID: strategyID,
        captured: store.frames.count,
        accepted: composed.accepted,
        rejected: composed.rejected,
        progress: 0.9
      )
      let output = try StackingExporter(context: context).export(
        image: composed.image,
        referenceURL: composed.reference.url,
        outputFormat: options["outputFormat"] as? String ?? "heif",
        strategyID: strategyID
      )
      let result = StackingResult(
        photoURL: output.0,
        strategyID: strategyID,
        capturedFrames: store.frames.count,
        acceptedFrames: composed.accepted,
        rejectedFrames: composed.rejected,
        duration: Date().timeIntervalSince(startedAt),
        width: output.1,
        height: output.2,
        degraded: composed.accepted < plan.targetFrameCount
      )
      emit(
        .completed,
        strategyID: strategyID,
        captured: result.capturedFrames,
        accepted: result.acceptedFrames,
        rejected: result.rejectedFrames,
        progress: 1
      )
      logResult(result)
      return result
    } catch {
      emit(error is StackingError && (error as? StackingError) == .cancelled ? .cancelled : .failed,
           strategyID: strategyID)
      throw error
    }
  }

  private func startDoubleExposure(
    strategy: any StackingStrategy,
    plan: StackingCapturePlan,
    options: [String: Any]
  ) async throws -> StackingResult {
    guard plan.targetFrameCount == 2 else {
      finishOperation()
      throw StackingError.unsupportedStrategy
    }
    let store: FrameStore
    do {
      store = try FrameStore()
    } catch {
      finishOperation()
      emit(.failed, strategyID: .doubleExposure)
      throw error
    }
    doubleExposureStore = store
    doubleExposureStrategy = strategy
    doubleExposureOutputFormat = options["outputFormat"] as? String ?? "heif"
    doubleExposureOptions = [
      "exposureCompensationEV": options["exposureCompensationEV"] as? Double ?? -1.5
    ]

    do {
      emit(.capturing, strategyID: .doubleExposure)
      let first = try await capturePhoto(quality: .quality)
      if isCancelled() { throw StackingError.cancelled }
      _ = try store.append(data: first.data, metadata: first.metadata)
      if previewDoubleExposureEnabled {
        let preview = makePhotoPreview(first.data)
        if preview == nil { logger.error("double exposure preview thumbnail failed") }
        onDoubleExposurePreview?(preview)
      }
      emit(
        .awaitingSecondExposure,
        strategyID: .doubleExposure,
        captured: 1,
        accepted: 1,
        progress: 0.5
      )
      return try await withCheckedThrowingContinuation { continuation in
        stateLock.lock()
        doubleExposureContinuation = continuation
        stateLock.unlock()
      }
    } catch {
      onDoubleExposurePreview?(nil)
      store.cleanup()
      doubleExposureStore = nil
      doubleExposureStrategy = nil
      doubleExposureOptions = [:]
      finishOperation()
      emit(
        (error as? StackingError) == .cancelled ? .cancelled : .failed,
        strategyID: .doubleExposure
      )
      throw error
    }
  }

  func captureNextDoubleExposure() {
    stateLock.lock()
    guard busy, activeStrategyID == .doubleExposure,
          doubleExposureContinuation != nil, !doubleExposureAdvancing else {
      stateLock.unlock()
      return
    }
    doubleExposureAdvancing = true
    stateLock.unlock()

    Task { [weak self] in
      await self?.finishDoubleExposure()
    }
  }

  private func finishDoubleExposure() async {
    stateLock.lock()
    let continuation = doubleExposureContinuation
    let store = doubleExposureStore
    let strategy = doubleExposureStrategy
    doubleExposureContinuation = nil
    stateLock.unlock()

    guard let continuation, let store, let strategy else { return }
    defer {
      onDoubleExposurePreview?(nil)
      store.cleanup()
      doubleExposureStore = nil
      doubleExposureStrategy = nil
      doubleExposureOptions = [:]
      finishOperation()
    }

    do {
      if isCancelled() { throw StackingError.cancelled }
      emit(.capturing, strategyID: .doubleExposure, captured: 1, accepted: 1, progress: 0.55)
      let second = try await capturePhoto(quality: .quality)
      if isCancelled() { throw StackingError.cancelled }
      _ = try store.append(data: second.data, metadata: second.metadata)
      onDoubleExposurePreview?(nil)
      emit(.compositing, strategyID: .doubleExposure, captured: 2, progress: 0.72)
      let composed = try analysisQueue.sync {
        try strategy.compose(
          frames: store.frames,
          context: context,
          options: doubleExposureOptions,
          progress: { accepted, rejected, processed in
            self.emit(
              .compositing,
              strategyID: .doubleExposure,
              captured: 2,
              accepted: accepted,
              rejected: rejected,
              progress: 0.7 + 0.15 * Double(processed) / 2
            )
          },
          isCancelled: isCancelled
        )
      }
      emit(.exporting, strategyID: .doubleExposure, captured: 2, accepted: 2, progress: 0.9)
      let output = try StackingExporter(context: context).export(
        image: composed.image,
        referenceURL: composed.reference.url,
        outputFormat: doubleExposureOutputFormat,
        strategyID: .doubleExposure
      )
      let result = StackingResult(
        photoURL: output.0,
        strategyID: .doubleExposure,
        capturedFrames: 2,
        acceptedFrames: 2,
        rejectedFrames: 0,
        duration: Date().timeIntervalSince(startedAt),
        width: output.1,
        height: output.2,
        degraded: false
      )
      emit(.completed, strategyID: .doubleExposure, captured: 2, accepted: 2, progress: 1)
      logResult(result)
      continuation.resume(returning: result)
    } catch {
      emit(
        (error as? StackingError) == .cancelled ? .cancelled : .failed,
        strategyID: .doubleExposure
      )
      continuation.resume(throwing: error)
    }
  }

  private func makePhotoPreview(_ data: Data) -> CGImage? {
    if let source = CGImageSourceCreateWithData(data as CFData, nil),
       let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
         kCGImageSourceCreateThumbnailFromImageAlways: true,
         kCGImageSourceCreateThumbnailWithTransform: true,
         kCGImageSourceThumbnailMaxPixelSize: 1024
       ] as CFDictionary) {
      return thumbnail
    }
    guard let image = CIImage(data: data), !image.extent.isEmpty else { return nil }
    let scale = min(1, 1024 / max(image.extent.width, image.extent.height))
    let preview = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    return context.createCGImage(preview, from: preview.extent)
  }

  private func startBulb(
    plan: StackingCapturePlan,
    options: [String: Any]
  ) async throws -> StackingResult {
    guard let source = plan.frameSource as? PixelBufferStreamFrameSource else {
      restoreCaptureSettings()
      finishOperation()
      throw StackingError.unsupportedStrategy
    }
    bulbAccumulator = BulbAccumulator(
      context: context,
      maximumDimension: source.maximumDimension
    )
    bulbFrameInterval = source.minimumFrameInterval
    bulbPlan = plan
    bulbOutputFormat = options["outputFormat"] as? String ?? "heif"
    lastBulbFrameAt = .distantPast
    bulbAcceptingFrames = true
    emit(.capturing, strategyID: .bulb)

    let timer = DispatchWorkItem { [weak self] in self?.stopBulbCapture() }
    bulbTimer = timer
    sessionQueue.asyncAfter(deadline: .now() + plan.maximumDuration, execute: timer)

    return try await withCheckedThrowingContinuation { continuation in
      stateLock.lock()
      bulbContinuation = continuation
      stateLock.unlock()
    }
  }

  func stopBulbCapture() {
    stateLock.lock()
    guard busy, activeStrategyID == .bulb, let continuation = bulbContinuation else {
      stateLock.unlock()
      return
    }
    bulbContinuation = nil
    bulbAcceptingFrames = false
    let accumulator = bulbAccumulator
    let plan = bulbPlan
    stateLock.unlock()
    bulbTimer?.cancel()

    // All accumulator writes happen on videoQueue. Enqueueing finalization
    // here guarantees the last accepted frame is complete before export.
    videoQueue.async { [weak self] in
      self?.analysisQueue.async { [weak self] in
        guard let self, let accumulator, let plan else {
          continuation.resume(throwing: StackingError.insufficientFrames)
          return
        }
        defer {
          self.restoreCaptureSettings()
          self.bulbAccumulator = nil
          self.bulbPlan = nil
          self.finishOperation()
        }
        do {
          if self.isCancelled() { throw StackingError.cancelled }
          let duration = Date().timeIntervalSince(self.startedAt)
          guard duration >= 1,
                accumulator.accepted >= plan.minimumFrameCount,
                let image = accumulator.result() else {
            throw StackingError.insufficientFrames
          }
          self.emit(
            .exporting,
            strategyID: .bulb,
            captured: accumulator.captured,
            accepted: accumulator.accepted,
            rejected: accumulator.rejected,
            progress: 0.92
          )
          let output = try StackingExporter(context: self.context).export(
            image: image,
            referenceURL: nil,
            outputFormat: self.bulbOutputFormat,
            strategyID: .bulb
          )
          let result = StackingResult(
            photoURL: output.0,
            strategyID: .bulb,
            capturedFrames: accumulator.captured,
            acceptedFrames: accumulator.accepted,
            rejectedFrames: accumulator.rejected,
            duration: duration,
            width: output.1,
            height: output.2,
            degraded: false
          )
          self.emit(
            .completed,
            strategyID: .bulb,
            captured: result.capturedFrames,
            accepted: result.acceptedFrames,
            rejected: result.rejectedFrames,
            progress: 1
          )
          self.logResult(result)
          continuation.resume(returning: result)
        } catch {
          self.emit(error is StackingError && (error as? StackingError) == .cancelled ? .cancelled : .failed,
                    strategyID: .bulb)
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private func startMotionBlur(
    plan: StackingCapturePlan,
    options: [String: Any]
  ) async throws -> StackingResult {
    guard let source = plan.frameSource as? PixelBufferStreamFrameSource else {
      restoreCaptureSettings()
      finishOperation()
      throw StackingError.unsupportedStrategy
    }
    motionBlurAccumulator = MotionBlurAccumulator(
      context: context,
      maximumDimension: source.maximumDimension
    )
    motionBlurFrameInterval = source.minimumFrameInterval
    motionBlurPlan = plan
    motionBlurOutputFormat = options["outputFormat"] as? String ?? "heif"
    lastMotionBlurFrameAt = .distantPast
    motionBlurAcceptingFrames = true
    emit(.capturing, strategyID: .motionBlur)

    let timer = DispatchWorkItem { [weak self] in self?.stopMotionBlurCapture() }
    motionBlurTimer = timer
    sessionQueue.asyncAfter(deadline: .now() + plan.maximumDuration, execute: timer)

    return try await withCheckedThrowingContinuation { continuation in
      stateLock.lock()
      motionBlurContinuation = continuation
      stateLock.unlock()
    }
  }

  func stopMotionBlurCapture() {
    stateLock.lock()
    guard busy, activeStrategyID == .motionBlur,
          let continuation = motionBlurContinuation else {
      stateLock.unlock()
      return
    }
    motionBlurContinuation = nil
    motionBlurAcceptingFrames = false
    let accumulator = motionBlurAccumulator
    let plan = motionBlurPlan
    stateLock.unlock()
    motionBlurTimer?.cancel()

    videoQueue.async { [weak self] in
      self?.analysisQueue.async { [weak self] in
        guard let self, let accumulator, let plan else {
          continuation.resume(throwing: StackingError.insufficientFrames)
          return
        }
        defer {
          self.restoreCaptureSettings()
          self.motionBlurAccumulator = nil
          self.motionBlurPlan = nil
          self.finishOperation()
        }
        do {
          if self.isCancelled() { throw StackingError.cancelled }
          let duration = Date().timeIntervalSince(self.startedAt)
          guard duration >= 1,
                accumulator.accepted >= plan.minimumFrameCount,
                let image = accumulator.result() else {
            throw StackingError.insufficientFrames
          }
          self.emit(
            .exporting,
            strategyID: .motionBlur,
            captured: accumulator.captured,
            accepted: accumulator.accepted,
            rejected: accumulator.rejected,
            progress: 0.92
          )
          let output = try StackingExporter(context: self.context).export(
            image: image,
            referenceURL: nil,
            outputFormat: self.motionBlurOutputFormat,
            strategyID: .motionBlur
          )
          let result = StackingResult(
            photoURL: output.0,
            strategyID: .motionBlur,
            capturedFrames: accumulator.captured,
            acceptedFrames: accumulator.accepted,
            rejectedFrames: accumulator.rejected,
            duration: duration,
            width: output.1,
            height: output.2,
            degraded: false
          )
          self.emit(
            .completed,
            strategyID: .motionBlur,
            captured: result.capturedFrames,
            accepted: result.acceptedFrames,
            rejected: result.rejectedFrames,
            progress: 1
          )
          self.logResult(result)
          continuation.resume(returning: result)
        } catch {
          self.emit(
            error is StackingError && (error as? StackingError) == .cancelled
              ? .cancelled
              : .failed,
            strategyID: .motionBlur
          )
          continuation.resume(throwing: error)
        }
      }
    }
  }

  func cancelCapture() {
    stateLock.lock()
    guard busy else {
      stateLock.unlock()
      return
    }
    cancelled = true
    stackingPreviewGeneration += 1
    let bulb = activeStrategyID == .bulb
    let motionBlur = activeStrategyID == .motionBlur
    let doubleExposure = activeStrategyID == .doubleExposure
    let doubleContinuation = doubleExposure && !doubleExposureAdvancing
      ? doubleExposureContinuation
      : nil
    if doubleContinuation != nil { doubleExposureContinuation = nil }
    stateLock.unlock()
    if bulb || motionBlur { onStackingPreview?(nil) }
    if bulb { stopBulbCapture() }
    if motionBlur { stopMotionBlurCapture() }
    if let doubleContinuation {
      onDoubleExposurePreview?(nil)
      doubleExposureStore?.cleanup()
      doubleExposureStore = nil
      doubleExposureStrategy = nil
      doubleExposureOptions = [:]
      emit(.cancelled, strategyID: .doubleExposure)
      finishOperation()
      doubleContinuation.resume(throwing: StackingError.cancelled)
    }
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    onEffectFrame?(pixelBuffer, device?.position == .front)
    let now = Date()

    if (zebraHighlightsEnabled || zebraShadowsEnabled),
       now.timeIntervalSince(lastZebraAt) >= 0.1 {
      lastZebraAt = now
      let image = zebraRenderer.makeImage(
        from: pixelBuffer,
        highlights: zebraHighlightsEnabled,
        shadows: zebraShadowsEnabled,
        orientation: orientationTracker.outputOrientation,
        mirrored: device?.position == .front
      )
      onZebraUpdated?(image)
    }

    if histogramEnabled, now.timeIntervalSince(lastHistogramAt) >= 0.2 {
      lastHistogramAt = now
      let bins = histogram(pixelBuffer)
      onHistogram?(bins)
      sceneLuminance = histogramLuminance(bins)
    } else if now.timeIntervalSince(lastHistogramAt) >= 0.5 {
      lastHistogramAt = now
      let bins = histogram(pixelBuffer)
      sceneLuminance = histogramLuminance(bins)
    }

    stateLock.lock()
    let bulbActive = busy && activeStrategyID == .bulb && !cancelled && bulbAcceptingFrames
    stateLock.unlock()
    if bulbActive {
      guard now.timeIntervalSince(lastBulbFrameAt) >= bulbFrameInterval else { return }
      let frameDuration = lastBulbFrameAt == .distantPast
        ? bulbFrameInterval
        : now.timeIntervalSince(lastBulbFrameAt)
      lastBulbFrameAt = now
      bulbAccumulator?.append(pixelBuffer: pixelBuffer, duration: frameDuration)
      if let accumulator = bulbAccumulator, let plan = bulbPlan {
        scheduleStackingPreview(accumulator.result(), strategyID: .bulb, now: now)
        let elapsed = now.timeIntervalSince(startedAt)
        emit(
          .capturing,
          strategyID: .bulb,
          captured: accumulator.captured,
          accepted: accumulator.accepted,
          rejected: accumulator.rejected,
          progress: min(0.88, elapsed / plan.maximumDuration * 0.88)
        )
      }
      return
    }

    stateLock.lock()
    let motionBlurActive = busy && activeStrategyID == .motionBlur &&
      !cancelled && motionBlurAcceptingFrames
    stateLock.unlock()
    guard motionBlurActive,
          now.timeIntervalSince(lastMotionBlurFrameAt) >= motionBlurFrameInterval else { return }
    lastMotionBlurFrameAt = now
    motionBlurAccumulator?.append(pixelBuffer: pixelBuffer)
    if let accumulator = motionBlurAccumulator, let plan = motionBlurPlan {
      scheduleStackingPreview(accumulator.result(), strategyID: .motionBlur, now: now)
      let elapsed = now.timeIntervalSince(startedAt)
      emit(
        .capturing,
        strategyID: .motionBlur,
        captured: accumulator.captured,
        accepted: accumulator.accepted,
        rejected: accumulator.rejected,
        progress: min(0.88, elapsed / plan.maximumDuration * 0.88)
      )
    }
  }

  private func scheduleStackingPreview(
    _ image: CIImage?,
    strategyID: StackingStrategyID,
    now: Date
  ) {
    guard let image, !image.extent.isEmpty else { return }
    stateLock.lock()
    guard stackingPreviewEnabled,
          busy,
          !cancelled,
          activeStrategyID == strategyID,
          !stackingPreviewInFlight,
          now.timeIntervalSince(lastStackingPreviewAt) >= 0.2 else {
      stateLock.unlock()
      return
    }
    stackingPreviewInFlight = true
    lastStackingPreviewAt = now
    let generation = stackingPreviewGeneration
    stateLock.unlock()

    let mirrored = device?.position == .front
    analysisQueue.async { [weak self] in
      guard let self else { return }
      autoreleasepool {
        let scale = min(1, 640 / max(image.extent.width, image.extent.height))
        var preview = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        // The video output already rotates pixel buffers via videoRotationAngle.
        if mirrored { preview = preview.oriented(.upMirrored) }
        let output = self.context.createCGImage(preview, from: preview.extent)
        self.stateLock.lock()
        let current = self.stackingPreviewEnabled && self.busy && !self.cancelled &&
          self.activeStrategyID == strategyID && self.stackingPreviewGeneration == generation
        self.stateLock.unlock()
        if current {
          if output == nil { self.logger.error("stacking preview render failed") }
          self.onStackingPreview?(output)
        }
        self.stateLock.lock()
        self.stackingPreviewInFlight = false
        self.stateLock.unlock()
      }
    }
  }

  private func capturePhoto(
    quality: AVCapturePhotoOutput.QualityPrioritization = .speed
  ) async throws -> (data: Data, metadata: [String: Any]) {
    try await withCheckedThrowingContinuation { continuation in
      sessionQueue.async { [weak self] in
        guard let self, self.ready, self.session.isRunning else {
          continuation.resume(throwing: StackingError.sessionNotReady)
          return
        }
        let settings: AVCapturePhotoSettings
        if self.photoOutput.availablePhotoCodecTypes.contains(.hevc) {
          settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.hevc])
        } else {
          settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
        }
        settings.photoQualityPrioritization = quality
        self.applyOutputOrientation()
        let delegate = StackingPhotoDelegate(continuation: continuation)
        delegate.onFinish = { [weak self, weak delegate] in
          guard let self, let delegate else { return }
          self.sessionQueue.async {
            self.inFlightDelegates.removeAll { $0 === delegate }
          }
        }
        self.inFlightDelegates.append(delegate)
        self.photoOutput.capturePhoto(with: settings, delegate: delegate)
      }
    }
  }

  private func lockCaptureSettings() {
    guard let device else { return }
    do {
      try device.lockForConfiguration()
      if device.isFocusModeSupported(.locked) { device.focusMode = .locked }
      if device.isExposureModeSupported(.locked) { device.exposureMode = .locked }
      if device.isWhiteBalanceModeSupported(.locked) { device.whiteBalanceMode = .locked }
      device.unlockForConfiguration()
    } catch {
      print("[ImageStacking] Could not lock capture settings: \(error.localizedDescription)")
    }
  }

  private func applyOutputOrientation() {
    let orientation = orientationTracker.outputOrientation
    let rotationAngle: CGFloat = switch orientation {
    case .portrait: 90
    case .portraitUpsideDown: 270
    case .landscapeLeft: 180
    case .landscapeRight: 0
    @unknown default: 90
    }
    for output in [photoOutput as AVCaptureOutput, videoOutput as AVCaptureOutput] {
      guard let connection = output.connection(with: .video),
            connection.isVideoRotationAngleSupported(rotationAngle) else { continue }
      connection.videoRotationAngle = rotationAngle
    }
  }

  private func restoreCaptureSettings() {
    guard let device else { return }
    do {
      try device.lockForConfiguration()
      if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
      if device.isExposureModeSupported(.continuousAutoExposure) { device.exposureMode = .continuousAutoExposure }
      if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
        device.whiteBalanceMode = .continuousAutoWhiteBalance
      }
      device.unlockForConfiguration()
    } catch {
      print("[ImageStacking] Could not restore automatic settings: \(error.localizedDescription)")
    }
  }

  private func isCancelled() -> Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    return cancelled
  }

  private func beginOperation(strategyID: StackingStrategyID) -> StackingError? {
    stateLock.lock()
    defer { stateLock.unlock() }
    guard !busy else { return .busy }
    guard ready, session.isRunning else { return .sessionNotReady }
    busy = true
    cancelled = false
    activeStrategyID = strategyID
    stackingPreviewGeneration += 1
    lastStackingPreviewAt = .distantPast
    startedAt = Date()
    currentPhase = .idle
    currentPhaseStartedAt = startedAt
    return nil
  }

  private func finishOperation() {
    stateLock.lock()
    busy = false
    cancelled = false
    bulbAcceptingFrames = false
    motionBlurAcceptingFrames = false
    doubleExposureAdvancing = false
    activeStrategyID = nil
    stackingPreviewGeneration += 1
    stateLock.unlock()
    onStackingPreview?(nil)
  }

  private func emit(
    _ phase: StackingPhase,
    strategyID: StackingStrategyID,
    captured: Int = 0,
    accepted: Int = 0,
    rejected: Int = 0,
    progress: Double = 0
  ) {
    stateLock.lock()
    let previousPhase = currentPhase
    let previousDuration = Date().timeIntervalSince(currentPhaseStartedAt)
    let transitioned = previousPhase != phase
    if transitioned {
      currentPhase = phase
      currentPhaseStartedAt = Date()
    }
    stateLock.unlock()
    if transitioned {
      logger.debug(
        "phase=\(phase.rawValue, privacy: .public) previous=\(previousPhase.rawValue, privacy: .public) previousDurationMs=\(Int(previousDuration * 1000), privacy: .public)"
      )
    }
    onProgress?(StackingProgressSnapshot(
      phase: phase,
      strategyID: strategyID,
      capturedFrames: captured,
      acceptedFrames: accepted,
      rejectedFrames: rejected,
      elapsedSeconds: Date().timeIntervalSince(startedAt),
      progress: progress
    ))
  }

  private func logResult(_ result: StackingResult) {
    let estimatedPeakMB = Double(result.width * result.height * 8 * 3) / 1_048_576
    logger.debug(
      "completed strategy=\(result.strategyID.rawValue, privacy: .public) durationMs=\(Int(result.duration * 1000), privacy: .public) dimensions=\(result.width, privacy: .public)x\(result.height, privacy: .public) accepted=\(result.acceptedFrames, privacy: .public) rejected=\(result.rejectedFrames, privacy: .public) estimatedPeakMB=\(estimatedPeakMB, format: .fixed(precision: 1))"
    )
  }

  private func histogram(_ pixelBuffer: CVPixelBuffer) -> [Double] {
    let binsCount = 64
    var bins = [Int](repeating: 0, count: binsCount)
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else {
      return [Double](repeating: 0, count: binsCount)
    }
    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
    let step = max(1, Int(sqrt(Double(width * height) / 4096)))
    var peak = 0
    for y in stride(from: 0, to: height, by: step) {
      let row = base.advanced(by: y * bytesPerRow).assumingMemoryBound(to: UInt8.self)
      for x in stride(from: 0, to: width, by: step) {
        let offset = x * 4
        let luma = (29 * Int(row[offset]) + 150 * Int(row[offset + 1]) + 77 * Int(row[offset + 2])) >> 8
        let bin = min(63, luma >> 2)
        bins[bin] += 1
        peak = max(peak, bins[bin])
      }
    }
    guard peak > 0 else { return [Double](repeating: 0, count: binsCount) }
    return bins.map { Double($0) / Double(peak) }
  }

  private func histogramLuminance(_ bins: [Double]) -> Double {
    let total = bins.reduce(0, +)
    guard total > 0 else { return 0.35 }
    return bins.enumerated().reduce(0) { $0 + Double($1.offset) / 63 * $1.element } / total
  }
}

private final class StackingOrientationTracker: @unchecked Sendable {
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
    operationQueue.name = "dev.komorebi.image-stacking.orientation"
    operationQueue.maxConcurrentOperationCount = 1
    motionManager.accelerometerUpdateInterval = 0.1
    guard motionManager.isAccelerometerAvailable else { return }
    motionManager.startAccelerometerUpdates(to: operationQueue) { [weak self] data, _ in
      guard let self, let acceleration = data?.acceleration else { return }
      let horizontal = abs(acceleration.x)
      let vertical = abs(acceleration.y)
      let flat = abs(acceleration.z)
      guard flat <= horizontal || flat <= vertical else { return }

      let orientation: AVCaptureVideoOrientation
      if horizontal > vertical {
        orientation = acceleration.x > 0 ? .landscapeLeft : .landscapeRight
      } else {
        orientation = acceleration.y > 0 ? .portraitUpsideDown : .portrait
      }
      self.lock.lock()
      self.currentOrientation = orientation
      self.lock.unlock()
    }
  }

  deinit { motionManager.stopAccelerometerUpdates() }
}

private final class StackingPhotoDelegate: NSObject, AVCapturePhotoCaptureDelegate {
  private var continuation: CheckedContinuation<(data: Data, metadata: [String: Any]), Error>?
  var onFinish: (() -> Void)?

  init(continuation: CheckedContinuation<(data: Data, metadata: [String: Any]), Error>) {
    self.continuation = continuation
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingPhoto photo: AVCapturePhoto,
    error: Error?
  ) {
    if let error { finish(.failure(error)); return }
    guard let data = photo.fileDataRepresentation() else {
      finish(.failure(StackingError.missingImageData))
      return
    }
    var metadata: [String: Any] = [:]
    if let source = CGImageSourceCreateWithData(data as CFData, nil),
       let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any]
    {
      metadata = properties
    }
    finish(.success((data, metadata)))
  }

  private func finish(_ result: Result<(data: Data, metadata: [String: Any]), Error>) {
    guard let continuation else { return }
    self.continuation = nil
    onFinish?()
    onFinish = nil
    switch result {
    case .success(let value): continuation.resume(returning: value)
    case .failure(let error): continuation.resume(throwing: error)
    }
  }
}
