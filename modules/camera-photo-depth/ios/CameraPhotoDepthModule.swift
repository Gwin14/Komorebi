import ExpoModulesCore
import Foundation

public final class CameraPhotoDepthModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CameraPhotoDepth")
    Events("onDepthProgress")
    AsyncFunction("getState") { (assetId: String) async throws -> [String: Any] in
      try await Task.detached(priority: .userInitiated) { try await PhotoDepthService.state(assetId) }.value
    }
    AsyncFunction("addDepth") { (assetId: String, operationId: String, createCopy: Bool) async throws -> String in
      try await Task.detached(priority: .userInitiated) {
        try await PhotoDepthService.add(assetId, operationId: operationId, createCopy: createCopy, preview: { uri in
          self.sendEvent("onDepthProgress", ["assetId": assetId, "operationId": operationId, "progress": 0.65, "cancellable": true, "previewUri": uri])
        }) { progress, cancellable in
          self.sendEvent("onDepthProgress", ["assetId": assetId, "operationId": operationId, "progress": progress, "cancellable": cancellable])
        }
      }.value
    }
    AsyncFunction("revertDepth") { (assetId: String, operationId: String) async throws in
      try await Task.detached(priority: .userInitiated) {
        try await PhotoDepthService.revert(assetId, operationId: operationId) { progress, cancellable in
          self.sendEvent("onDepthProgress", ["assetId": assetId, "operationId": operationId, "progress": progress, "cancellable": cancellable])
        }
      }.value
    }
    Function("cancel") { (operationId: String) in PhotoDepthJobs.shared.cancel(operationId) }
    AsyncFunction("exportCurrentPhoto") { (assetId: String, destination: String) async throws -> String in
      try await PhotoDepthService.export(assetId, destination: destination)
    }
    AsyncFunction("cleanupDeletedBackups") { (confirmedDeletedIds: [String]) throws in try PhotoDepthService.cleanupDeleted(confirmedDeletedIds) }
  }
}
