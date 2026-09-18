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
               frameAspectRatio: Double = 0.75) -> [String: Any]? {
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
        prompt: Self.prompt(recentAdvice: recentAdvice, frameAspectRatio: frameAspectRatio)
      )
      let compactRaw = raw?
        .replacingOccurrences(of: "\n", with: " ")
        .replacingOccurrences(of: "\r", with: " ")
        .prefix(500) ?? "nil"
      compositionScanLog("model raw response elapsedMs=\(Int((CFAbsoluteTimeGetCurrent() - startedAt) * 1_000)) value=\(compactRaw)")
      var judgement = raw.flatMap(Self.parseCategorizedJudgement) ?? raw.flatMap(Self.parseJudgement)
      if judgement == nil {
        compositionScanLog("model structured response unusable; retrying with plain advice")
        let recoveryRaw = try engine?.analyzeImage(
          atPath: temporary.path,
          prompt: Self.recoveryPrompt(recentAdvice: recentAdvice)
        )
        let compactRecovery = recoveryRaw?
          .replacingOccurrences(of: "\n", with: " ")
          .replacingOccurrences(of: "\r", with: " ")
          .prefix(500) ?? "nil"
        compositionScanLog("model recovery response value=\(compactRecovery)")
        judgement = recoveryRaw.flatMap(Self.parseControlledJudgement)
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
            frameAspectRatio: frameAspectRatio
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

  private static func prompt(recentAdvice: [[String: String]], frameAspectRatio: Double) -> String {
    let recentTopics = recentAdvice.suffix(3).compactMap { $0["topic"] }.filter { !$0.isEmpty }
    let recentData = try? JSONSerialization.data(withJSONObject: recentTopics)
    let recentJSON = recentData.flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    return """
    Classify the visible photo composition. Do not describe it and do not use JSON.
    Recent topics to avoid when another useful choice exists: \(recentJSON)

    Return exactly: subject=SUBJECT;topic=TOPIC
    SUBJECT must be one of: person, group, plant, building, vehicle, animal, food, object, landscape, interior, scene
    TOPIC must be one of: subject, empty_space, background, light, lines, depth, symmetry, horizon, color, balance
    """
  }

  private static func parseCategorizedJudgement(_ raw: String) -> [String: Any]? {
    let normalized = raw.lowercased()
    let subject = capturedStrings(
      in: normalized,
      pattern: #"subject\s*[:=]\s*[\"']?(person|group|plant|building|vehicle|animal|food|object|landscape|interior|scene)\b"#
    ).first
    let topic = capturedStrings(
      in: normalized,
      pattern: #"topic\s*[:=]\s*[\"']?(subject|empty_space|background|light|lines|depth|symmetry|horizon|color|balance)\b"#
    ).first
    guard let subject, let topic else { return nil }
    let subjectLabels: [String: String] = [
      "person": "a pessoa", "group": "o grupo", "plant": "as plantas",
      "building": "o prédio", "vehicle": "o veículo", "animal": "o animal",
      "food": "a comida", "object": "o objeto", "landscape": "a paisagem",
      "interior": "o ambiente", "scene": "a cena",
    ]
    let topicMessages: [String: String] = [
      "subject": "Destacar \(subjectLabels[subject] ?? "o assunto")",
      "empty_space": "Reduzir espaço vazio",
      "background": "Simplificar o fundo",
      "light": "Equilibrar a luz",
      "lines": "Valorizar as linhas",
      "depth": "Criar profundidade",
      "symmetry": "Reforçar a simetria",
      "horizon": "Equilibrar o horizonte",
      "color": "Valorizar as cores",
      "balance": "Preservar o equilíbrio",
    ]
    return [
      "source": "minicpm-v-4.6",
      "verdict": topic == "balance" ? "keep" : "advice",
      "subject": subjectLabels[subject] ?? subject,
      "message": topicMessages[topic] ?? "Preservar o equilíbrio",
      "topic": topic,
      "visualHint": NSNull(),
    ]
  }

  private static func recoveryPrompt(recentAdvice: [[String: String]]) -> String {
    let recent = recentAdvice.suffix(3).compactMap { $0["topic"] }.filter { !$0.isEmpty }
      .joined(separator: ",")
    return """
    Look at the photo and choose the single most useful visible composition adjustment. Recent themes to avoid: \(recent).
    Reply with exactly one identifier:
    keep, move_left, move_right, move_up, move_down, closer, farther, center_subject, simplify_background, lower_angle, higher_angle, look_space, level, frame_subject, reduce_glare, soften_light, add_foreground, separate_subject, avoid_overlap, use_symmetry
    """
  }

  private static func parseControlledJudgement(_ raw: String) -> [String: Any]? {
    let token = capturedStrings(
      in: raw.lowercased(),
      pattern: #"\b(keep|move_left|move_right|move_up|move_down|closer|farther|center_subject|simplify_background|lower_angle|higher_angle|look_space|level|frame_subject|reduce_glare|soften_light|add_foreground|separate_subject|avoid_overlap|use_symmetry)\b"#
    ).first
    if token == "keep" { return keepJudgement() }
    let definitions: [String: (message: String, topic: String, hint: String?)] = [
      "move_left": ("Melhorar a perspectiva", "perspectiva", nil),
      "move_right": ("Melhorar a perspectiva", "perspectiva", nil),
      "move_up": ("Organizar os planos", "perspectiva", nil),
      "move_down": ("Organizar os planos", "perspectiva", nil),
      "closer": ("Destacar o assunto", "escala", "closer"),
      "farther": ("Dar espaço ao assunto", "escala", "farther"),
      "center_subject": ("Reforçar a simetria", "simetria", "center_symmetry"),
      "simplify_background": ("Simplificar o fundo", "fundo", nil),
      "lower_angle": ("Melhorar a perspectiva", "perspectiva", nil),
      "higher_angle": ("Melhorar a perspectiva", "perspectiva", nil),
      "look_space": ("Dar espaço ao olhar", "olhar", "look_space"),
      "level": ("Equilibrar o horizonte", "nível", "level"),
      "frame_subject": ("Destacar o assunto", "enquadramento", nil),
      "reduce_glare": ("Reduzir o reflexo", "luz", nil),
      "soften_light": ("Suavizar a luz", "luz", nil),
      "add_foreground": ("Criar profundidade", "profundidade", nil),
      "separate_subject": ("Separar assunto e fundo", "fundo", nil),
      "avoid_overlap": ("Separar os elementos", "relações", nil),
      "use_symmetry": ("Reforçar a simetria", "simetria", "center_symmetry"),
    ]
    guard let token, let definition = definitions[token] else { return nil }
    return [
      "source": "minicpm-v-4.6",
      "verdict": "advice",
      "message": definition.message,
      "topic": definition.topic,
      "visualHint": definition.hint as Any? ?? NSNull(),
    ]
  }

  private static func framingPrompt(subject: String?, advice: String,
                                    frameAspectRatio: Double) -> String {
    let target = subject?.isEmpty == false ? subject! : advice
    return """
    Localize na foto somente este alvo: "\(target)".
    Responda com quatro números inteiros separados por vírgulas, nesta ordem: centro horizontal, centro vertical, largura e altura. Use coordenadas de 0 a 1000, mantenha toda a região dentro da imagem e não repita estas instruções. A proporção final será corrigida pelo aplicativo para \(String(format: "%.4f", frameAspectRatio)):1.
    """
  }

  private static func parseJudgement(_ raw: String) -> [String: Any]? {
    let objects = jsonObjects(in: raw)
    var messageCandidates: [String] = []
    var explicitVerdict: String?
    var topic: String?
    var subject: String?
    var hint: String?
    var frameValue: [String: Any]?

    for value in objects {
      explicitVerdict = (value["verdict"] as? String) ?? explicitVerdict
      topic = (value["topic"] as? String) ?? (value["topico"] as? String) ?? topic
      subject = (value["subject"] as? String) ?? (value["assunto"] as? String) ?? subject
      hint = (value["hint"] as? String) ?? (value["visualHint"] as? String) ?? hint
      frameValue = (value["frame"] as? [String: Any]) ?? frameValue
      if frameValue == nil, let frame = value["frame"] as? [NSNumber], frame.count == 3 {
        frameValue = ["cx": frame[0], "cy": frame[1], "width": frame[2], "height": frame[2]]
      }
      for key in ["message", "recommendation", "dica", "advice"] {
        if let candidate = value[key] as? String { messageCandidates.append(candidate) }
      }
      if frameValue == nil,
         value["cx"] != nil || value["centerX"] != nil {
        frameValue = value
      }
    }
    messageCandidates.append(contentsOf: capturedStrings(
      in: raw,
      pattern: #"\"(?:message|recommendation|dica|advice)\"\s*:\s*\"([^\"]*)\""#
    ))
    var cleanedCandidates = messageCandidates.map { sanitizeMessage(cleanText($0)) }
    // Only inspect arbitrary values when no named message was usable. This
    // recovers malformed output such as {"verdict":"keep|advice":"..."}
    // without letting topic/hint overwrite a valid message.
    if !cleanedCandidates.contains(where: isUsefulMessage) {
      cleanedCandidates.append(contentsOf: capturedStrings(
        in: raw,
        pattern: #":\s*\"([^\"]{8,160})\""#
      ).map { sanitizeMessage(cleanText($0)) })
    }
    let keepWords: Set<String> = ["keep", "manter", "mantenha", "ok"]
    if cleanedCandidates.contains(where: { keepWords.contains($0.lowercased()) }) &&
       !cleanedCandidates.contains(where: isUsefulMessage) {
      return keepJudgement()
    }
    guard let message = cleanedCandidates.last(where: isUsefulMessage) else {
      return explicitVerdict?.lowercased() == "keep" ? keepJudgement() : nil
    }
    guard isNaturalAdvice(message) else { return nil }
    let topicValue = cleanText(topic ?? message)
    let allowedHints: Set<String> = ["framing", "reframe", "closer", "farther",
                                     "look_space", "center_symmetry", "level"]
    let normalizedHint = hint?.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    let acceptedHint = frameValue != nil ? "framing" :
      (normalizedHint.flatMap { allowedHints.contains($0) ? $0 : nil } ?? inferredHint(from: message))
    var result: [String: Any] = [
      "source": "minicpm-v-4.6",
      "verdict": "advice",
      "message": String(message.prefix(48)),
      "topic": String(topicValue.prefix(48)),
      "visualHint": acceptedHint as Any? ?? NSNull(),
    ]
    if let subject = sanitizedSubject(subject) { result["subject"] = subject }
    if acceptedHint == "framing", let frame = frameValue,
       let centerX = ((frame["cx"] ?? frame["centerX"]) as? NSNumber)?.doubleValue,
       let centerY = ((frame["cy"] ?? frame["centerY"]) as? NSNumber)?.doubleValue,
       let width = ((frame["width"] ?? frame["size"]) as? NSNumber)?.doubleValue,
       let height = ((frame["height"] ?? frame["size"]) as? NSNumber)?.doubleValue,
       let frame = validatedFrame(centerX: centerX, centerY: centerY,
                                  width: width, height: height) {
      result["frame"] = frame
    }
    return result
  }

  private static func keepJudgement() -> [String: Any] {
    ["source": "minicpm-v-4.6", "verdict": "keep", "message": "", "topic": "",
     "visualHint": NSNull()]
  }

  private static func parsePlainJudgement(_ raw: String) -> [String: Any]? {
    var message = sanitizeMessage(cleanText(raw))
      .trimmingCharacters(in: CharacterSet(charactersIn: "\"'`*-• "))
    if let period = message.firstIndex(of: "."), message.distance(from: message.startIndex, to: period) >= 8 {
      message = String(message[...period])
    }
    let lower = message.lowercased()
    if ["ok", "ok.", "keep", "manter"].contains(lower) { return keepJudgement() }
    guard !message.contains("{"), !message.contains("}"),
          isUsefulMessage(message), isNaturalAdvice(message) else { return nil }
    return [
      "source": "minicpm-v-4.6",
      "verdict": "advice",
      "message": String(message.prefix(48)),
      "topic": String(message.prefix(48)),
      "visualHint": inferredHint(from: message) as Any? ?? NSNull(),
    ]
  }

  private static func cleanText(_ value: String) -> String {
    value.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func sanitizeMessage(_ value: String) -> String {
    value.replacingOccurrences(
      of: #"[\s\.,;]+(?:hint|visual\s*hint|topic|t[oó]pico|size|width|height|frame|cx|cy)\s*[:=].*$"#,
      with: "",
      options: [.regularExpression, .caseInsensitive]
    ).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func isNaturalAdvice(_ value: String) -> Bool {
    let normalized = value.folding(options: .diacriticInsensitive, locale: Locale(identifier: "pt_BR"))
      .lowercased()
    let rejectedTerms = [
      " clarity", "lighting", "adjustment", "background", " focus", " view", "ensure",
      " clear", " visible", " frame", "technical", "metadado", "metadados",
      "elemento tecnico", "detalhes tecnicos",
      "melhor visibilidade", "enquadrar a vista", "vista da camera",
      "aproveite a posicao", "ajuste a posicao", "garantir a",
    ]
    guard !rejectedTerms.contains(where: normalized.contains), value.count <= 64 else { return false }
    let sentenceEnds = value.filter { ".!?".contains($0) }.count
    return sentenceEnds <= 1
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
          width >= 120, width <= 900, height >= 120, height <= 900,
          centerX - width / 2 >= 0, centerX + width / 2 <= 1000,
          centerY - height / 2 >= 0, centerY + height / 2 <= 1000,
          !(abs(centerX - 500) <= 2 && abs(centerY - 450) <= 2 &&
            abs(width - 600) <= 2 && abs(height - 760) <= 2) else { return nil }
    return ["centerX": centerX, "centerY": centerY, "width": width, "height": height]
  }

  private static func sanitizedSubject(_ value: String?) -> String? {
    guard let value else { return nil }
    let clean = cleanText(value)
    let words = clean.split(separator: " ")
    let normalized = clean.folding(options: .diacriticInsensitive, locale: Locale(identifier: "pt_BR"))
      .lowercased()
    let rejected: Set<String> = ["", "cena", "assunto", "elemento", "ambiente", "principal",
                                 "nome concreto", "objeto"]
    guard clean.count >= 3, clean.count <= 24, words.count <= 3,
          !rejected.contains(normalized) else { return nil }
    return clean
  }

  private static func isUsefulMessage(_ value: String) -> Bool {
    let lower = value.lowercased()
    let reserved: Set<String> = [
      "", "null", "none", "keep", "advice", "keep|advice", "dica livre",
      "tópico curto", "framing|reframe|closer|farther|look_space|center_symmetry|level|null",
      "<ação específica sobre um elemento visível>", "<tema curto>",
    ]
    return value.count >= 4 && !reserved.contains(lower)
  }

  private static func inferredHint(from message: String) -> String? {
    let lower = message.lowercased()
    if lower.contains("cortad") || lower.contains("borda") { return "reframe" }
    if lower.contains("closer") || lower.contains("aproxime") || lower.contains("chegue mais perto") { return "closer" }
    if lower.contains("farther") || lower.contains("afaste") || lower.contains("dê mais espaço") { return "farther" }
    if lower.contains("nível") || lower.contains("nivele") || lower.contains("horizonte") { return "level" }
    if lower.contains("direção do olhar") || lower.contains("espaço ao olhar") { return "look_space" }
    if lower.contains("simetr") || lower.contains("centralize") { return "center_symmetry" }
    return nil
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
