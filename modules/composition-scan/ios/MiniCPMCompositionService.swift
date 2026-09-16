import Foundation
import ImageIO

final class MiniCPMCompositionService: NSObject, URLSessionDownloadDelegate {
  static let shared = MiniCPMCompositionService()

  static let modelName = "MiniCPM-V 4.6 Q4_K_M"
  private static let minimumPhysicalMemory: UInt64 = 5 * 1024 * 1024 * 1024
  private static let requiredFreeSpace: Int64 = 2_200_000_000
  private static let files: [(name: String, url: String)] = [
    ("MiniCPM-V-4_6-Q4_K_M.gguf", "https://huggingface.co/openbmb/MiniCPM-V-4.6-gguf/resolve/main/MiniCPM-V-4_6-Q4_K_M.gguf"),
    ("MiniCPM-V-4_6-mmproj-master-f16.gguf", "https://huggingface.co/openbmb/MiniCPM-V-4.6-gguf/resolve/main/mmproj-model-f16.gguf"),
  ]

  var onStatus: (([String: Any]) -> Void)?

  private let lock = NSLock()
  private var currentFile = 0
  private var downloading = false
  private var lastError: String?
  private var task: URLSessionDownloadTask?
  private var engine: KMCompositionModel?
  private var lastLoggedProgressBucket = -1
  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = 90
    configuration.timeoutIntervalForResource = 60 * 60
    configuration.allowsCellularAccess = true
    let delegateQueue = OperationQueue()
    delegateQueue.name = "komorebi.minicpm-download"
    delegateQueue.maxConcurrentOperationCount = 1
    return URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)
  }()

  private override init() {
    super.init()
    try? FileManager.default.createDirectory(at: modelDirectory, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var directory = modelDirectory
    try? directory.setResourceValues(values)
  }

  private var modelDirectory: URL {
    let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return root.appendingPathComponent("CompositionScanModels/v4.6", isDirectory: true)
  }

  private var modelURL: URL { modelDirectory.appendingPathComponent(Self.files[0].name) }
  private var mmprojURL: URL { modelDirectory.appendingPathComponent(Self.files[1].name) }

  private func validFile(at url: URL) -> Bool {
    guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
          let size = attributes[.size] as? NSNumber else { return false }
    return size.int64Value > 100_000_000
  }

  var isReady: Bool { validFile(at: modelURL) && validFile(at: mmprojURL) }
  var isCompatible: Bool { ProcessInfo.processInfo.physicalMemory >= Self.minimumPhysicalMemory }

  func status(progress: Double? = nil) -> [String: Any] {
    lock.lock()
    let active = downloading
    let error = lastError
    lock.unlock()
    let state: String
    if !KMCompositionModel.isRuntimeAvailable() { state = "runtime-missing" }
    else if !isCompatible { state = "unsupported" }
    else if active { state = "downloading" }
    else if isReady { state = "ready" }
    else if error != nil { state = "error" }
    else { state = "not-downloaded" }
    var result: [String: Any] = [
      "state": state,
      "modelName": Self.modelName,
      "isReady": state == "ready",
      "isCompatible": isCompatible,
      "runtimeAvailable": KMCompositionModel.isRuntimeAvailable(),
      "storageBytes": Self.files.reduce(Int64(0)) { total, file in
        let url = modelDirectory.appendingPathComponent(file.name)
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.int64Value ?? 0
        return total + size
      },
    ]
    if let progress { result["progress"] = progress }
    if let error { result["error"] = error }
    return result
  }

  func startDownload() throws -> Bool {
    compositionScanLog("model download requested ready=\(isReady) compatible=\(isCompatible) runtime=\(KMCompositionModel.isRuntimeAvailable())")
    guard KMCompositionModel.isRuntimeAvailable() else {
      throw NSError(domain: "CompositionScan", code: 20,
                    userInfo: [NSLocalizedDescriptionKey: "Runtime MiniCPM-V ausente neste build."])
    }
    guard isCompatible else {
      throw NSError(domain: "CompositionScan", code: 21,
                    userInfo: [NSLocalizedDescriptionKey: "Este aparelho não tem memória suficiente para o modelo local."])
    }
    if isReady { return false }
    let capacity = try modelDirectory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
      .volumeAvailableCapacityForImportantUsage ?? 0
    guard capacity >= Self.requiredFreeSpace else {
      throw NSError(domain: "CompositionScan", code: 22,
                    userInfo: [NSLocalizedDescriptionKey: "Libere pelo menos 2,2 GB para baixar a inteligência do Scan."])
    }
    lock.lock()
    if downloading { lock.unlock(); return false }
    downloading = true
    lastError = nil
    currentFile = validFile(at: modelURL) ? 1 : 0
    lastLoggedProgressBucket = -1
    lock.unlock()
    notify(progress: Double(currentFile) / Double(Self.files.count))
    downloadCurrentFile()
    return true
  }

  func cancelDownload() {
    lock.lock()
    task?.cancel()
    task = nil
    downloading = false
    lock.unlock()
    compositionScanLog("model download cancelled")
    notify()
  }

  func removeModel() throws {
    cancelDownload()
    engine = nil
    if FileManager.default.fileExists(atPath: modelDirectory.path) {
      try FileManager.default.removeItem(at: modelDirectory)
    }
    try FileManager.default.createDirectory(at: modelDirectory, withIntermediateDirectories: true)
    lastError = nil
    compositionScanLog("model files removed")
    notify()
  }

  private func downloadCurrentFile() {
    guard currentFile < Self.files.count,
          let remote = URL(string: Self.files[currentFile].url) else {
      finishDownload(error: nil)
      return
    }
    let next = session.downloadTask(with: remote)
    lock.lock()
    task = next
    lock.unlock()
    compositionScanLog("model download started file=\(currentFile + 1)/\(Self.files.count)")
    next.resume()
  }

  private func finishDownload(error: Error?) {
    lock.lock()
    downloading = false
    task = nil
    lastError = error?.localizedDescription
    lock.unlock()
    if let error {
      compositionScanLog("model download failed error=\(error.localizedDescription)")
    } else {
      compositionScanLog("model download completed")
    }
    notify(progress: error == nil ? 1 : nil)
  }

  private func notify(progress: Double? = nil) {
    let value = status(progress: progress)
    DispatchQueue.main.async { [weak self] in self?.onStatus?(value) }
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                  didWriteData bytesWritten: Int64, totalBytesWritten: Int64,
                  totalBytesExpectedToWrite: Int64) {
    guard totalBytesExpectedToWrite > 0 else { return }
    let fileProgress = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
    let overallProgress = (Double(currentFile) + fileProgress) / Double(Self.files.count)
    let bucket = Int(overallProgress * 10)
    if bucket != lastLoggedProgressBucket {
      lastLoggedProgressBucket = bucket
      compositionScanLog("model download progress=\(Int(overallProgress * 100))%")
    }
    notify(progress: overallProgress)
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                  didFinishDownloadingTo location: URL) {
    let destination = modelDirectory.appendingPathComponent(Self.files[currentFile].name)
    do {
      try? FileManager.default.removeItem(at: destination)
      try FileManager.default.moveItem(at: location, to: destination)
      try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                                            ofItemAtPath: destination.path)
      guard validFile(at: destination) else {
        throw NSError(domain: "CompositionScan", code: 23,
                      userInfo: [NSLocalizedDescriptionKey: "O arquivo baixado está incompleto."])
      }
      compositionScanLog("model file stored file=\(currentFile + 1)/\(Self.files.count)")
      currentFile += 1
      if currentFile < Self.files.count { downloadCurrentFile() }
      else { finishDownload(error: nil) }
    } catch {
      try? FileManager.default.removeItem(at: destination)
      finishDownload(error: error)
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask,
                  didCompleteWithError error: Error?) {
    if let error, (error as NSError).code != NSURLErrorCancelled {
      finishDownload(error: error)
    }
  }

  func analyze(_ image: CGImage) -> [String: Any]? {
    let runtimeAvailable = KMCompositionModel.isRuntimeAvailable()
    guard isReady, isCompatible, runtimeAvailable else {
      compositionScanLog("model skipped ready=\(isReady) compatible=\(isCompatible) runtime=\(runtimeAvailable)")
      return nil
    }
    let startedAt = CFAbsoluteTimeGetCurrent()
    compositionScanLog("model analysis started image=\(image.width)x\(image.height) engineLoaded=\(engine != nil)")
    let temporary = FileManager.default.temporaryDirectory
      .appendingPathComponent("komorebi-scan-\(UUID().uuidString).jpg")
    defer { try? FileManager.default.removeItem(at: temporary) }
    guard let destination = CGImageDestinationCreateWithURL(temporary as CFURL, "public.jpeg" as CFString, 1, nil) else {
      return nil
    }
    CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.82] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { return nil }

    do {
      if engine == nil {
        let loadStartedAt = CFAbsoluteTimeGetCurrent()
        compositionScanLog("model engine loading")
        engine = try KMCompositionModel(modelPath: modelURL.path, mmprojPath: mmprojURL.path)
        compositionScanLog("model engine loaded elapsedMs=\(Int((CFAbsoluteTimeGetCurrent() - loadStartedAt) * 1_000))")
      }
      let raw = try engine?.analyzeImage(atPath: temporary.path, prompt: Self.prompt)
      let compactRaw = raw?
        .replacingOccurrences(of: "\n", with: " ")
        .replacingOccurrences(of: "\r", with: " ")
        .prefix(500) ?? "nil"
      compositionScanLog("model raw response elapsedMs=\(Int((CFAbsoluteTimeGetCurrent() - startedAt) * 1_000)) value=\(compactRaw)")
      let judgement = raw.flatMap(Self.parseJudgement)
      if let judgement {
        compositionScanLog("model parsed action=\(judgement["action"] ?? "unknown") confidence=\(judgement["confidence"] ?? "unknown") message=\(judgement["message"] ?? "none")")
      } else {
        compositionScanLog("model response rejected by JSON parser")
      }
      return judgement
    } catch {
      lastError = "Falha na inferência: \(error.localizedDescription)"
      engine = nil
      compositionScanLog("model analysis failed elapsedMs=\(Int((CFAbsoluteTimeGetCurrent() - startedAt) * 1_000)) error=\(error.localizedDescription)")
      notify()
      return nil
    }
  }

  private static let prompt = """
  Você é um diretor de fotografia criterioso. Analise a composição desta foto como ela está, respeitando escolhas intencionais. Não aplique regra dos terços automaticamente e não peça para nivelar sem inclinação evidente. Escolha somente uma mudança que produza melhora clara; se nada for realmente necessário, escolha keep.

  Responda apenas JSON válido, sem markdown:
  {"action":"keep|reframe|closer|farther|look_space|center_symmetry|level|reduce_empty_space|simplify_background|change_viewpoint","confidence":0.0,"message":"máximo 55 caracteres em português"}

  Use level raramente. Use reframe apenas se o assunto principal estiver cortado ou perigosamente colado à borda. Considere relações entre pessoas, direção do olhar, espaço vazio, fundo, intenção e equilíbrio visual. confidence deve medir a certeza de que a mudança melhora a foto, não a certeza de que você reconheceu a cena.
  """

  private static func parseJudgement(_ raw: String) -> [String: Any]? {
    guard let start = raw.firstIndex(of: "{"), let end = raw.lastIndex(of: "}"), start <= end else { return nil }
    let json = String(raw[start...end])
    guard let data = json.data(using: .utf8),
          let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let action = value["action"] as? String,
          let confidence = (value["confidence"] as? NSNumber)?.doubleValue,
          let message = value["message"] as? String else { return nil }
    let allowed: Set<String> = ["keep", "reframe", "closer", "farther", "look_space",
                                "center_symmetry", "level", "reduce_empty_space",
                                "simplify_background", "change_viewpoint"]
    guard allowed.contains(action) else { return nil }
    return [
      "source": "minicpm-v-4.6",
      "action": action,
      "confidence": min(1, max(0, confidence)),
      "message": String(message.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)),
    ]
  }
}
