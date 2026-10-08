import CryptoKit
import Foundation

struct PhotoDepthRecovery: Codable {
  let assetId: String
  let recoveryId: String
  let filename: String
  let baselineModificationTime: TimeInterval?
  var phase: String
}

enum PhotoDepthRecoveryDisposition {
  case clearUncommitted, clearReverted, restoreAvailable, conflict
  static func resolve(_ record: PhotoDepthRecovery, markerId: String?, markerPhase: String?, modificationTime: TimeInterval?) -> Self {
    if markerId == record.recoveryId {
      if markerPhase == "reverted" { return .clearReverted }
      if markerPhase == "applied" { return .restoreAvailable }
      return .conflict
    }
    if record.phase == "prepared", record.baselineModificationTime == modificationTime {
      return .clearUncommitted
    }
    return .conflict
  }
}

// Durable before PhotoKit commits; no dependency on the JS lifecycle or cache.
final class PhotoDepthRecoveryStore {
  let root: URL
  private let manager = FileManager.default

  init(root: URL? = nil) throws {
    self.root = try root ?? manager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("Komorebi/PhotoDepthRecovery", isDirectory: true)
    try manager.createDirectory(at: self.root, withIntermediateDirectories: true)
  }

  func directory(_ assetId: String) -> URL {
    let key = SHA256.hash(data: Data(assetId.utf8)).map { String(format: "%02x", $0) }.joined()
    return root.appendingPathComponent(key, isDirectory: true)
  }

  func read(_ assetId: String) throws -> PhotoDepthRecovery? {
    let url = directory(assetId).appendingPathComponent("recovery.json")
    if !manager.fileExists(atPath: url.path) { return nil }
    let record = try JSONDecoder().decode(PhotoDepthRecovery.self, from: Data(contentsOf: url))
    guard record.assetId == assetId, record.filename == "before.jpg" || record.filename == "before.heic" else {
      throw PhotoDepthError.invalidRecovery
    }
    return record
  }

  func prepare(assetId: String, source: URL, modificationDate: Date? = nil) throws -> PhotoDepthRecovery {
    guard try read(assetId) == nil else { throw PhotoDepthError.existingRecovery }
    let directory = directory(assetId)
    try manager.createDirectory(at: directory, withIntermediateDirectories: true)
    let ext = source.pathExtension.lowercased() == "heic" ? "heic" : "jpg"
    let record = PhotoDepthRecovery(assetId: assetId, recoveryId: UUID().uuidString, filename: "before.\(ext)", baselineModificationTime: modificationDate?.timeIntervalSince1970, phase: "prepared")
    do {
      try manager.copyItem(at: source, to: directory.appendingPathComponent(record.filename))
      try write(record)
    } catch {
      try? manager.removeItem(at: directory)
      throw error
    }
    return record
  }

  func write(_ record: PhotoDepthRecovery) throws {
    try JSONEncoder().encode(record).write(to: directory(record.assetId).appendingPathComponent("recovery.json"), options: .atomic)
  }

  func backup(_ record: PhotoDepthRecovery) throws -> URL {
    let url = directory(record.assetId).appendingPathComponent(record.filename)
    guard manager.fileExists(atPath: url.path) else { throw PhotoDepthError.invalidRecovery }
    return url
  }

  func remove(_ assetId: String) throws {
    let url = directory(assetId)
    if manager.fileExists(atPath: url.path) { try manager.removeItem(at: url) }
  }

  func all() throws -> [PhotoDepthRecovery] {
    try manager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).compactMap { directory in
      let url = directory.appendingPathComponent("recovery.json")
      guard manager.fileExists(atPath: url.path) else { return nil }
      let record = try JSONDecoder().decode(PhotoDepthRecovery.self, from: Data(contentsOf: url))
      // Route through read() to enforce the same path constraints.
      return try read(record.assetId)
    }
  }
}

enum PhotoDepthError: LocalizedError {
  case unavailable, invalidImage, missingGeometry, invalidRecovery, existingRecovery, externalEdit, cancelled, busy, commitFailed, modelMissing
  var errorDescription: String? {
    switch self {
    case .unavailable: return PhotosPortraitCompatibility.reason
    case .invalidImage: return "Esta foto não pode receber profundidade nesta versão."
    case .missingGeometry: return "Faltam dados EXIF de lente para gerar profundidade editável no Fotos."
    case .invalidRecovery: return "Os dados para recuperar a versão anterior não estão disponíveis."
    case .existingRecovery: return "Esta foto já possui uma edição de profundidade."
    case .externalEdit: return "A foto recebeu outra edição. A reversão sobrescreveria essa alteração."
    case .cancelled: return "Operação cancelada."
    case .busy: return "Uma ação já está em andamento nesta foto."
    case .commitFailed: return "O Fotos não conseguiu salvar a edição."
    case .modelMissing: return "O modelo de profundidade não foi incluído nesta compilação."
    }
  }
}
