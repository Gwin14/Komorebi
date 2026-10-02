import ExpoModulesCore
import AVFoundation
import UIKit

// VisionCamera captures DNGs; this module develops, checkpoints and saves HEIF+.
public class CameraRawCaptureModule: Module {
  private let engine = HeifPlusEngine()
  private let ioWorker = DispatchQueue(label: "dev.komorebi.heif-plus-files", qos: .utility)
  private let worker = DispatchQueue(label: "dev.komorebi.heif-plus", qos: .utility)

  private func runIO(_ promise: Promise, operation: @escaping () throws -> Any) {
    ioWorker.async {
      autoreleasepool {
        do { promise.resolve(try operation()) }
        catch { promise.reject("HEIF_PLUS_FAILED", error.localizedDescription) }
      }
    }
  }

  private func run(_ promise: Promise, jobId: String? = nil, operation: @escaping () throws -> Any) {
    worker.async {
      var task = UIBackgroundTaskIdentifier.invalid
      DispatchQueue.main.sync {
        task = UIApplication.shared.beginBackgroundTask(withName: "HEIF+") {
          self.engine.expire()
          if task != .invalid { UIApplication.shared.endBackgroundTask(task); task = .invalid }
        }
      }
      self.engine.resetExpiration()
      defer {
        DispatchQueue.main.async {
          if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
        }
      }
      autoreleasepool {
        do { promise.resolve(try operation()) }
        catch {
          if let jobId { self.engine.markFailed(jobId, error: error) }
          promise.reject("HEIF_PLUS_FAILED", error.localizedDescription)
        }
      }
    }
  }
  public func definition() -> ModuleDefinition {
    Name("CameraRawCapture")

    Function("isSupported") { () -> Bool in
      true
    }

    AsyncFunction("saveRawPhotoPair") { (rawURI: String, processedURI: String, options: [String: Any], promise: Promise) in
      self.runIO(promise) { try RawPhotoLibrary.save(rawURI: rawURI, processedURI: processedURI, options: options) }
    }

    // Capture capabilities come from VisionCamera's active photo output event.
    AsyncFunction("listHeifPlusJobs") { (promise: Promise) in
      self.runIO(promise) { try self.engine.jobs() }
    }
    AsyncFunction("enqueueHeifPlus") { (uri: String, options: [String: Any], promise: Promise) in
      self.runIO(promise) { try self.engine.enqueue(uri, options: options) }
    }
    AsyncFunction("inspectHeifPlus") { (id: String, promise: Promise) in
      self.run(promise) { try self.engine.inspect(id) }
    }
    AsyncFunction("renderHeifPlus") { (id: String, promise: Promise) in
      self.run(promise, jobId: id) { try self.engine.render(id) }
    }
    AsyncFunction("enrichHeifPlus") { (id: String, data: [String: Any], promise: Promise) in
      self.run(promise, jobId: id) { try self.engine.enrich(id, data: data); return true }
    }
    AsyncFunction("saveHeifPlus") { (id: String, promise: Promise) in
      self.run(promise, jobId: id) { try self.engine.save(id) }
    }
    AsyncFunction("retryHeifPlus") { (id: String, promise: Promise) in
      self.run(promise) { try self.engine.retry(id); return true }
    }
    AsyncFunction("discardHeifPlus") { (id: String, promise: Promise) in
      self.run(promise) { try self.engine.discard(id); return true }
    }
  }

}
