import AVFoundation
import CoreImage
import Foundation
import ImageIO
import Photos

extension PhotoDepthService {
  static func pairedMovie(_ asset: PHAsset, input: PHContentEditingInput) async throws -> URL? {
    guard asset.mediaSubtypes.contains(.photoLive) else { return nil }
    // Resources of the editing input represent the current Live Photo, including
    // previous edits. Never combine a current still with an original movie.
    guard let live = input.livePhoto,
          let resource = PHAssetResource.assetResources(for: live).first(where: { $0.type == .pairedVideo || $0.type == .fullSizePairedVideo }) else {
      throw PhotoDepthError.invalidLivePair
    }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("depth-live-\(UUID().uuidString).mov")
    let options = PHAssetResourceRequestOptions()
    options.isNetworkAccessAllowed = true
    do {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        PHAssetResourceManager.default().writeData(for: resource, toFile: url, options: options) { error in
          if let error { continuation.resume(throwing: error) }
          else { continuation.resume(returning: ()) }
        }
      }
      return url
    } catch {
      try? FileManager.default.removeItem(at: url)
      throw error
    }
  }

  static func validatePair(photo: URL, movie: URL) async throws {
    let source = try PhotoDepthEngine.source(photo)
    let properties = CGImageSourceCopyPropertiesAtIndex(source, CGImageSourceGetPrimaryImageIndex(source), nil) as? [String: Any]
    let maker = properties?[kCGImagePropertyMakerAppleDictionary as String] as? [String: Any]
    guard let identifier = maker?["17"] as? String, !identifier.isEmpty else { throw PhotoDepthError.invalidLivePair }
    let metadata = try await AVURLAsset(url: movie).load(.metadata)
    let identifiers = AVMetadataItem.metadataItems(from: metadata, filteredByIdentifier: .quickTimeMetadataContentIdentifier)
    guard let item = identifiers.first, try await item.load(.stringValue) == identifier else { throw PhotoDepthError.invalidLivePair }
  }

  static func liveOutput(_ input: PHContentEditingInput, depthSource: URL? = nil, restoredPhoto: URL? = nil,
                         operationId: String) async throws -> PHContentEditingOutput {
    guard let context = PHLivePhotoEditingContext(livePhotoEditingInput: input) else { throw PhotoDepthError.invalidLivePair }
    let restored = restoredPhoto.flatMap { CIImage(contentsOf: $0, options: [.applyOrientationProperty: true]) }
    if restoredPhoto != nil && restored == nil { throw PhotoDepthError.invalidImage }
    context.frameProcessor = { frame, error in
      do { try PhotoDepthJobs.shared.check(operationId) }
      catch let failure { error?.pointee = failure as NSError; return nil }
      if frame.type == .photo, let restored { return restored }
      return frame.image
    }
    let output = PHContentEditingOutput(contentEditingInput: input)
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      context.saveLivePhoto(to: output, options: nil) { success, error in
        if success { continuation.resume(returning: ()) }
        else { continuation.resume(throwing: error ?? PhotoDepthError.invalidLivePair) }
      }
    }
    try PhotoDepthJobs.shared.check(operationId)
    if let depthSource {
      // Context owns video/audio and the pairing identifier. Add depth to its
      // rendered still, retaining that identifier rather than copying another
      // Live Photo's identifier over the generated pair.
      let rendered = try PhotoDepthEngine.source(output.renderedContentURL)
      let source = try PhotoDepthEngine.source(depthSource)
      let projection = try PhotoDepthPortraitEncoding.projection(rendered)
      let expected = try PhotoDepthPortraitEncoding.projection(source)
      guard projection.width == expected.width, projection.height == expected.height, projection.orientation == 1,
            let info = CGImageSourceCopyAuxiliaryDataInfoAtIndex(source, CGImageSourceGetPrimaryImageIndex(source), kCGImageAuxiliaryDataTypeDisparity) as? [AnyHashable: Any] else {
        throw PhotoDepthError.invalidLivePair
      }
      let depth = try AVDepthData(fromDictionaryRepresentation: info)
      let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("depth-live-still-\(UUID().uuidString).jpg")
      defer { try? FileManager.default.removeItem(at: temporary) }
      try PhotoDepthEngine.write(source: rendered, disparity: depth, to: temporary)
      _ = try FileManager.default.replaceItemAt(output.renderedContentURL, withItemAt: temporary)
    }
    return output
  }
}
