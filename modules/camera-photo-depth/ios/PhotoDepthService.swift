import Foundation
import Photos
import UniformTypeIdentifiers
import ImageIO

final class PhotoDepthJobs {
  static let shared = PhotoDepthJobs()
  private let lock = NSLock()
  private var jobs: [String: (assetId: String, cancelled: Bool)] = [:]
  private var earlyCancellations = Set<String>()
  func begin(_ operationId: String, assetId: String) throws {
    lock.lock(); defer { lock.unlock() }
    guard jobs[operationId] == nil, !jobs.values.contains(where: { $0.assetId == assetId }) else { throw PhotoDepthError.busy }
    jobs[operationId] = (assetId, earlyCancellations.remove(operationId) != nil)
  }
  func cancel(_ operationId: String) {
    lock.lock(); defer { lock.unlock() }
    if let job = jobs[operationId] { jobs[operationId] = (job.assetId, true) }
    else {
      if earlyCancellations.count > 64 { earlyCancellations.removeAll() }
      earlyCancellations.insert(operationId)
    }
  }
  func check(_ operationId: String) throws {
    lock.lock(); defer { lock.unlock() }
    if jobs[operationId]?.cancelled == true { throw PhotoDepthError.cancelled }
  }
  func end(_ operationId: String) {
    lock.lock(); defer { lock.unlock() }
    jobs.removeValue(forKey: operationId)
    earlyCancellations.remove(operationId)
  }
}

enum PhotoDepthService {
  static let adjustmentIdentifier = "app.komorebi.depth"
  typealias Progress = (Double, Bool) -> Void

  static func asset(_ identifier: String) throws -> PHAsset {
    let id = identifier.hasPrefix("ph://") ? String(identifier.dropFirst(5)) : identifier
    guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else { throw PhotoDepthError.invalidImage }
    return asset
  }

  static func marker(_ adjustment: PHAdjustmentData?) -> (id: String, phase: String)? {
    guard let data = adjustment, data.formatIdentifier == adjustmentIdentifier, data.formatVersion == "1",
          let payload = try? JSONSerialization.jsonObject(with: data.data) as? [String: String],
          let id = payload["recoveryId"], let phase = payload["phase"] else { return nil }
    return (id, phase)
  }

  static func adjustment(_ record: PhotoDepthRecovery, phase: String = "applied") throws -> PHAdjustmentData {
    PHAdjustmentData(formatIdentifier: adjustmentIdentifier, formatVersion: "1",
      data: try JSONSerialization.data(withJSONObject: ["recoveryId": record.recoveryId, "phase": phase]))
  }

  static func formatReason(_ asset: PHAsset) -> String? {
    if asset.mediaSubtypes.contains(.photoLive) { return "Live Photos ainda não podem receber profundidade." }
    let resources = PHAssetResource.assetResources(for: asset)
    if resources.contains(where: { UTType($0.uniformTypeIdentifier)?.conforms(to: .rawImage) == true }) {
      return "Fotos RAW ainda não podem receber profundidade."
    }
    return nil
  }

  static func state(_ identifier: String) async throws -> [String: Any] {
    let asset = try asset(identifier)
    let store = try PhotoDepthRecoveryStore()
    if let record = try store.read(asset.localIdentifier) {
      let requested = try await PhotoEditingInput.read(asset)
      let marker = marker(requested.previousAdjustment)
      switch PhotoDepthRecoveryDisposition.resolve(record, markerId: marker?.id, markerPhase: marker?.phase,
        modificationTime: asset.modificationDate?.timeIntervalSince1970) {
      case .clearReverted, .clearUncommitted:
        // No PhotoKit edit was committed before the interrupted operation.
        // A changed revision is ambiguous and must retain its recovery data.
        try store.remove(asset.localIdentifier)
      case .restoreAvailable:
        _ = try store.backup(record)
        let reason = PhotosPortraitCompatibility.validated
          ? "Profundidade adicionada. Abra Editar no Fotos para ajustar Retrato. Você pode reverter."
          : "Profundidade experimental salva. Abra Editar no Fotos para ajustar Retrato. Você pode reverter."
        return ["eligible": false, "canRevert": true, "reason": reason]
      case .conflict:
        // A prepared record can also be a committed edit followed by an external
        // edit before recovery reconciliation. Never discard its backup on doubt.
        return ["eligible": false, "canRevert": false, "reason": PhotoDepthError.externalEdit.localizedDescription]
      }
    }
    if let reason = formatReason(asset) { return ["eligible": false, "canRevert": false, "reason": reason] }
    guard PhotosPortraitCompatibility.generationEnabled else {
      return ["eligible": false, "canRevert": false, "reason": PhotosPortraitCompatibility.reason]
    }
    let requested = try await PhotoEditingInput.read(asset)
    let input = requested.content
    guard let url = input.fullSizeImageURL else { throw PhotoDepthError.invalidImage }
    let source = try PhotoDepthEngine.source(url)
    if PhotoDepthEngine.hasDepth(source) { return ["eligible": false, "canRevert": false, "reason": "Esta foto já possui profundidade."] }
    _ = try PhotoDepthPortraitEncoding.projection(source)
    return ["eligible": true, "canRevert": false, "reason": PhotosPortraitCompatibility.generationReason]
  }

  static func output(_ input: PHContentEditingInput, source: URL) throws -> (PHContentEditingOutput, URL) {
    let output = PHContentEditingOutput(contentEditingInput: input)
    guard let imageSource = CGImageSourceCreateWithURL(source as CFURL, nil), let type = CGImageSourceGetType(imageSource),
          let contentType = UTType(type as String), output.supportedRenderedContentTypes.contains(contentType) else {
      throw PhotoDepthError.invalidImage
    }
    return (output, try output.renderedContentURL(for: contentType))
  }

  static func commit(_ output: PHContentEditingOutput, asset: PHAsset, rating: Int?) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      PHPhotoLibrary.shared().performChanges {
        let request = PHAssetChangeRequest(for: asset)
        request.contentEditingOutput = output
        if #available(iOS 27, *), let rating, let value = PHAsset.Rating(rawValue: rating) { request.rating = value }
      } completionHandler: { success, error in
        if success { continuation.resume(returning: ()) }
        else {
          if let error = error as NSError? {
            print("[PhotoDepth] commit failed domain=\(error.domain) code=\(error.code) underlying=\(String(describing: error.userInfo[NSUnderlyingErrorKey]))")
          }
          continuation.resume(throwing: error ?? PhotoDepthError.commitFailed)
        }
      }
    }
  }

  static func currentRating(_ asset: PHAsset, url: URL) -> Int? {
    if #available(iOS 27, *) { return asset.rating.rawValue }
    return PhotoDepthEngine.rating(url)
  }

  static func assertUnchanged(_ asset: PHAsset) throws {
    let current = try self.asset(asset.localIdentifier)
    guard current.modificationDate == asset.modificationDate else { throw PhotoDepthError.externalEdit }
  }

  static func add(_ identifier: String, operationId: String, progress: Progress) async throws {
    guard PhotosPortraitCompatibility.generationEnabled else { throw PhotoDepthError.unavailable }
    let asset = try asset(identifier)
    try PhotoDepthJobs.shared.begin(operationId, assetId: asset.localIdentifier)
    defer { PhotoDepthJobs.shared.end(operationId) }
    guard formatReason(asset) == nil else { throw PhotoDepthError.invalidImage }
    progress(0.05, true)
    let requested = try await PhotoEditingInput.read(asset)
    let input = requested.content
    try PhotoDepthJobs.shared.check(operationId)
    guard let url = input.fullSizeImageURL else { throw PhotoDepthError.invalidImage }
    let source = try PhotoDepthEngine.source(url)
    guard !PhotoDepthEngine.hasDepth(source) else { throw PhotoDepthError.invalidImage }
    _ = try PhotoDepthPortraitEncoding.projection(source)
    let store = try PhotoDepthRecoveryStore()
    var record = try store.prepare(assetId: asset.localIdentifier, source: url, modificationDate: asset.modificationDate)
    var committed = false
    defer { if !committed { try? store.remove(asset.localIdentifier) } }
    progress(0.2, true)
    let normalizedURL = FileManager.default.temporaryDirectory.appendingPathComponent("depth-input-\(UUID().uuidString).\(url.pathExtension)")
    defer { try? FileManager.default.removeItem(at: normalizedURL) }
    let editingSource = try PhotoDepthEditingImage.prepare(source, to: normalizedURL)
    let model = try PhotoDepthEngine.loadModel()
    let disparity = try PhotoDepthEngine.disparity(source: editingSource, model: model) { try PhotoDepthJobs.shared.check(operationId) }
    progress(0.65, true)
    let (output, destination) = try self.output(input, source: url)
    defer { try? FileManager.default.removeItem(at: destination) }
    try PhotoDepthEngine.write(source: editingSource, disparity: disparity, to: destination)
    let rating = currentRating(asset, url: url)
    if let rating { try PhotoCatalogMetadata.apply(to: destination, metadata: ["catalogMetadata": ["rating": rating]]) }
    output.adjustmentData = try adjustment(record)
    try PhotoDepthJobs.shared.check(operationId)
    try assertUnchanged(asset)
    progress(0.9, false)
    let projection = try PhotoDepthPortraitEncoding.projection(try PhotoDepthEngine.source(destination))
    print("[PhotoDepth] commit prepared dimensions=\(projection.width)x\(projection.height) orientation=\(projection.orientation)")
    try await commit(output, asset: asset, rating: rating)
    committed = true
    record.phase = "applied"
    // The prepared record plus PhotoKit marker already identifies a successful
    // commit if the process exits before this final atomic write.
    try? store.write(record)
    progress(1, false)
  }

  static func revert(_ identifier: String, operationId: String, progress: Progress) async throws {
    let asset = try asset(identifier)
    try PhotoDepthJobs.shared.begin(operationId, assetId: asset.localIdentifier)
    defer { PhotoDepthJobs.shared.end(operationId) }
    let store = try PhotoDepthRecoveryStore()
    guard let record = try store.read(asset.localIdentifier) else { throw PhotoDepthError.invalidRecovery }
    progress(0.1, true)
    let requested = try await PhotoEditingInput.read(asset)
    let input = requested.content
    let marker = marker(requested.previousAdjustment)
    guard marker?.id == record.recoveryId, marker?.phase == "applied" else { throw PhotoDepthError.externalEdit }
    guard let currentURL = input.fullSizeImageURL else { throw PhotoDepthError.invalidImage }
    let backup = try store.backup(record)
    let (output, destination) = try self.output(input, source: backup)
    defer { try? FileManager.default.removeItem(at: destination) }
    let rating = currentRating(asset, url: currentURL)
    let restoredSource = try PhotoDepthEngine.source(backup)
    let normalizedURL = FileManager.default.temporaryDirectory.appendingPathComponent("depth-restore-\(UUID().uuidString).\(backup.pathExtension)")
    defer { try? FileManager.default.removeItem(at: normalizedURL) }
    _ = try PhotoDepthEditingImage.prepare(restoredSource, to: normalizedURL)
    let restoredURL = FileManager.default.fileExists(atPath: normalizedURL.path) ? normalizedURL : backup
    if let rating { try PhotoCatalogMetadata.write(from: restoredURL, to: destination, fields: ["rating": rating]) }
    else { try FileManager.default.copyItem(at: restoredURL, to: destination) }
    output.adjustmentData = try adjustment(record, phase: "reverted")
    try PhotoDepthJobs.shared.check(operationId)
    try assertUnchanged(asset)
    progress(0.9, false)
    try await commit(output, asset: asset, rating: rating)
    // Cleanup failure cannot turn a confirmed restore into a failed operation.
    // state() recognizes the reverted marker and retries cleanup after restart.
    try? store.remove(asset.localIdentifier)
    progress(1, false)
  }

  static func export(_ identifier: String, destination: String) async throws -> String {
    let asset = try asset(identifier)
    let requested = try await PhotoEditingInput.read(asset)
    let input = requested.content
    guard let source = input.fullSizeImageURL, let base = URL(string: destination), base.isFileURL else { throw PhotoDepthError.invalidImage }
    let target = base.appendingPathExtension(source.pathExtension.isEmpty ? "jpg" : source.pathExtension)
    // Only allow cache destinations; never overwrite a caller-supplied photo.
    let temporary = FileManager.default.temporaryDirectory.standardizedFileURL.path + "/"
    let cache = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).standardizedFileURL.path + "/"
    guard target.standardizedFileURL.path.hasPrefix(temporary) || target.standardizedFileURL.path.hasPrefix(cache) else { throw PhotoDepthError.invalidImage }
    try FileManager.default.copyItem(at: source, to: target)
    return target.absoluteString
  }

  static func cleanupDeleted(_ confirmedDeletedIds: [String] = []) throws {
    let store = try PhotoDepthRecoveryStore()
    // Expo's successful deleteAssets transaction confirms these specific IDs,
    // including under limited access. Never infer other deletions from hiding.
    for identifier in confirmedDeletedIds {
      let id = identifier.hasPrefix("ph://") ? String(identifier.dropFirst(5)) : identifier
      try store.remove(id)
    }
    // Limited access may hide assets that still exist. Never remove recovery
    // data on the basis of a fetch performed with limited library permission.
    guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { return }
    for record in try store.all() {
      if PHAsset.fetchAssets(withLocalIdentifiers: [record.assetId], options: nil).firstObject == nil,
         PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized { try store.remove(record.assetId) }
    }
  }
}
