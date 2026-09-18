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

  func analyze(_ image: CGImage, recentAdvice: [[String: String]] = [],
               frameAspectRatio: Double = 0.75,
               subjectPoint: [String: Double]? = nil) -> [String: Any]? {
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
      let raw = try engine?.analyzeImage(
        atPath: temporary.path,
        prompt: Self.prompt(
          recentAdvice: recentAdvice,
          frameAspectRatio: frameAspectRatio,
          subjectPoint: subjectPoint
        )
      )
      let compactRaw = raw?
        .replacingOccurrences(of: "\n", with: " ")
        .replacingOccurrences(of: "\r", with: " ")
        .prefix(500) ?? "nil"
      compositionScanLog("model raw response elapsedMs=\(Int((CFAbsoluteTimeGetCurrent() - startedAt) * 1_000)) value=\(compactRaw)")
      var judgement = raw.flatMap(Self.parseCategorizedJudgement)
      if judgement == nil {
        compositionScanLog("model crop response unusable; retrying with a strict crop request")
        let recoveryRaw = try engine?.analyzeImage(
          atPath: temporary.path,
          prompt: Self.recoveryPrompt(subjectPoint: subjectPoint)
        )
        let compactRecovery = recoveryRaw?
          .replacingOccurrences(of: "\n", with: " ")
          .replacingOccurrences(of: "\r", with: " ")
          .prefix(500) ?? "nil"
        compositionScanLog("model recovery response value=\(compactRecovery)")
        judgement = recoveryRaw.flatMap(Self.parseCategorizedJudgement)
      }
      if var value = judgement,
         value["verdict"] as? String == "advice",
         value["frame"] == nil,
         let message = value["message"] as? String {
        let framingRaw = try engine?.analyzeImage(
          atPath: temporary.path,
          prompt: Self.framingPrompt(
            subject: value["subject"] as? String,
            advice: message,
            cropIntent: value["cropIntent"] as? String,
            frameAspectRatio: frameAspectRatio,
            subjectPoint: subjectPoint
          )
        )
        let compactFraming = framingRaw?
          .replacingOccurrences(of: "\n", with: " ")
          .replacingOccurrences(of: "\r", with: " ")
          .prefix(300) ?? "nil"
        compositionScanLog("model framing response value=\(compactFraming)")
        if let frame = framingRaw.flatMap(Self.parseFrame) {
          value["visualHint"] = "framing"
          value["frame"] = frame
          judgement = value
        }
      }
      if let judgement {
        compositionScanLog("model parsed verdict=\(judgement["verdict"] ?? "unknown") topic=\(judgement["topic"] ?? "unknown") hint=\(judgement["visualHint"] ?? "none") message=\(judgement["message"] ?? "none")")
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

  func prepare() throws -> Bool {
    let runtimeAvailable = KMCompositionModel.isRuntimeAvailable()
    guard isReady, isCompatible, runtimeAvailable else {
      compositionScanLog("model warmup skipped ready=\(isReady) compatible=\(isCompatible) runtime=\(runtimeAvailable)")
      return false
    }
    guard engine == nil else {
      compositionScanLog("model warmup already complete")
      return false
    }
    let startedAt = CFAbsoluteTimeGetCurrent()
    compositionScanLog("model warmup started")
    engine = try KMCompositionModel(modelPath: modelURL.path, mmprojPath: mmprojURL.path)
    compositionScanLog("model warmup completed elapsedMs=\(Int((CFAbsoluteTimeGetCurrent() - startedAt) * 1_000))")
    return true
  }

  private static func prompt(recentAdvice _: [[String: String]], frameAspectRatio: Double,
                             subjectPoint: [String: Double]?) -> String {
    let selection = selectionInstruction(subjectPoint)
    return """
    Act as an intelligent camera crop selector. Identify one concrete visible subject worth isolating from the wider scene. Do not critique lighting, lines, background, balance, depth, symmetry, horizon, or color. Do not describe the image and do not use JSON.
    \(selection)

    Return exactly: subject=SUBJECT;crop=CROP
    SUBJECT must be one of: person, group, plant, tree, flower, car, motorcycle, bicycle, vehicle, animal, food, building, chimney, tower, sign, furniture, object, landscape, interior, scene
    CROP must be one of: tight, medium, wide
    Use tight to isolate a self-contained object with little context, medium when some surroundings help recognize it, and wide only when the subject depends on its environment. The app will apply the final \(String(format: "%.4f", frameAspectRatio)):1 aspect ratio.
    """
  }

  private static func parseCategorizedJudgement(_ raw: String) -> [String: Any]? {
    let normalized = raw.lowercased()
    let subject = capturedStrings(
      in: normalized,
      pattern: #"subject\s*[:=]\s*[\"']?(person|group|plant|tree|flower|car|motorcycle|bicycle|vehicle|animal|food|building|chimney|tower|sign|furniture|object|landscape|interior|scene)\b"#
    ).first
    let crop = capturedStrings(
      in: normalized,
      pattern: #"crop\s*[:=]\s*[\"']?(tight|medium|wide)\b"#
    ).first
    guard let subject, let crop else { return nil }
    let subjectLabels: [String: String] = [
      "person": "a pessoa", "group": "o grupo", "plant": "as plantas",
      "tree": "a árvore", "flower": "a flor", "car": "o carro",
      "motorcycle": "a moto", "bicycle": "a bicicleta", "vehicle": "o veículo",
      "animal": "o animal", "building": "o prédio", "chimney": "a chaminé",
      "tower": "a torre", "sign": "a placa", "furniture": "o móvel",
      "food": "a comida", "object": "o objeto", "landscape": "a paisagem",
      "interior": "o ambiente", "scene": "a cena",
    ]
    let label = subjectLabels[subject] ?? "o assunto"
    return [
      "source": "minicpm-v-4.6",
      "verdict": "advice",
      "subject": label,
      "message": "Enquadrar \(label)",
      "topic": "subject",
      "cropIntent": crop,
      "visualHint": NSNull(),
    ]
  }

  private static func recoveryPrompt(subjectPoint: [String: Double]?) -> String {
    return """
    Choose one concrete object to crop from this photo. \(selectionInstruction(subjectPoint))
    Return only subject=SUBJECT;crop=CROP using these values:
    SUBJECT: person, group, plant, tree, flower, car, motorcycle, bicycle, vehicle, animal, food, building, chimney, tower, sign, furniture, object, landscape, interior, scene
    CROP: tight, medium, wide
    """
  }

  private static func framingPrompt(subject: String?, advice: String, cropIntent: String?,
                                    frameAspectRatio: Double,
                                    subjectPoint: [String: Double]?) -> String {
    let target = subject?.isEmpty == false ? subject! : advice
    let selection = selectionInstruction(subjectPoint)
    let crop = cropIntent ?? "medium"
    return """
    Localize somente os limites visíveis do objeto "\(target)". Devolva a caixa do objeto, não uma composição pronta, não a cena inteira e não inclua espaço vazio ao redor. A intenção de recorte é \(crop); o aplicativo adicionará a margem fotográfica e corrigirá a proporção final para \(String(format: "%.4f", frameAspectRatio)):1.
    \(selection)
    Responda somente com quatro números inteiros separados por vírgulas, nesta ordem: centro horizontal, centro vertical, largura e altura. Use coordenadas de 0 a 1000 e mantenha a caixa dentro da imagem.
    """
  }

  private static func selectionInstruction(_ point: [String: Double]?) -> String {
    guard let x = point?["x"], let y = point?["y"], x.isFinite, y.isFinite else {
      return "No subject was selected. Prefer a distinct object that can be isolated over the whole building, interior, landscape, or scene."
    }
    let normalizedX = min(1, max(0, x))
    let normalizedY = min(1, max(0, y))
    return "The user selected the main subject at x=\(Int(normalizedX * 1000)), y=\(Int(normalizedY * 1000)), measured from the image's top-left. Identify that exact visible object. Its bounding box must contain this point; never replace it with another subject or the whole scene."
  }

  private static func parseFrame(_ raw: String) -> [String: Any]? {
    for value in jsonObjects(in: raw).reversed() {
      let candidate: [String: Any]
      if let nested = value["frame"] as? [String: Any] {
        candidate = nested
      } else if let array = value["frame"] as? [NSNumber], array.count == 3 {
        candidate = ["cx": array[0], "cy": array[1], "width": array[2], "height": array[2]]
      } else {
        candidate = value
      }
      guard let centerX = ((candidate["cx"] ?? candidate["centerX"]) as? NSNumber)?.doubleValue,
            let centerY = ((candidate["cy"] ?? candidate["centerY"]) as? NSNumber)?.doubleValue,
            let width = ((candidate["width"] ?? candidate["size"]) as? NSNumber)?.doubleValue,
            let height = ((candidate["height"] ?? candidate["size"]) as? NSNumber)?.doubleValue,
            let frame = validatedFrame(centerX: centerX, centerY: centerY,
                                       width: width, height: height) else { continue }
      return frame
    }
    let numbers = capturedStrings(in: raw, pattern: #"(?<!\d)(\d{2,3})(?!\d)"#)
      .compactMap(Double.init)
    if numbers.count >= 4 {
      let values = Array(numbers.prefix(4))
      if let frame = validatedFrame(centerX: values[0], centerY: values[1],
                                    width: values[2], height: values[3]) {
        return frame
      }
    }
    return nil
  }

  private static func validatedFrame(centerX: Double, centerY: Double,
                                     width: Double, height: Double) -> [String: Any]? {
    guard centerX.isFinite, centerY.isFinite, width.isFinite, height.isFinite,
          width >= 40, width <= 900, height >= 40, height <= 900,
          centerX - width / 2 >= 0, centerX + width / 2 <= 1000,
          centerY - height / 2 >= 0, centerY + height / 2 <= 1000,
          !(abs(centerX - 500) <= 2 && abs(centerY - 450) <= 2 &&
            abs(width - 600) <= 2 && abs(height - 760) <= 2) else { return nil }
    return ["centerX": centerX, "centerY": centerY, "width": width, "height": height]
  }

  private static func capturedStrings(in raw: String, pattern: String) -> [String] {
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
    let range = NSRange(raw.startIndex..<raw.endIndex, in: raw)
    return regex.matches(in: raw, range: range).compactMap { match in
      guard match.numberOfRanges > 1,
            let capture = Range(match.range(at: 1), in: raw) else { return nil }
      return String(raw[capture])
    }
  }

  private static func jsonObjects(in raw: String) -> [[String: Any]] {
    var objects: [[String: Any]] = []
    var start: String.Index?
    var depth = 0
    var insideString = false
    var escaped = false
    var index = raw.startIndex
    while index < raw.endIndex {
      let character = raw[index]
      if insideString {
        if escaped { escaped = false }
        else if character == "\\" { escaped = true }
        else if character == "\"" { insideString = false }
      } else if character == "\"" {
        insideString = true
      } else if character == "{" {
        if depth == 0 { start = index }
        depth += 1
      } else if character == "}" && depth > 0 {
        depth -= 1
        if depth == 0, let start {
          let json = String(raw[start...index])
          if let data = json.data(using: .utf8),
             let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            objects.append(value)
          }
        }
      }
      index = raw.index(after: index)
    }
    return objects
  }
}
