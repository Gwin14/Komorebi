import ExpoModulesCore
import Foundation

public final class CameraPhotographicStylesModule: Module {
  enum CompatibilityError: Error, LocalizedError {
    case unsupported
    case invalidURL

    var errorDescription: String? {
      switch self {
      case .unsupported: return "Este dispositivo não oferece codificação HEVC compatível."
      case .invalidURL: return "O caminho da foto é inválido."
      }
    }
  }

  public func definition() -> ModuleDefinition {
    Name("CameraPhotographicStyles")

    Function("isSupported") { () -> Bool in
      VideoToolboxHEVCEncoder.isSupported
    }

    AsyncFunction("makeCompatible") { (photoUri: String) async throws -> [String: Any] in
      guard VideoToolboxHEVCEncoder.isSupported else { throw CompatibilityError.unsupported }
      guard let inputURL = Self.fileURL(from: photoUri) else { throw CompatibilityError.invalidURL }

      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("komorebi-styles-\(UUID().uuidString)")
        .appendingPathExtension("heic")

      return try await Task.detached(priority: .userInitiated) {
        try XDRemuxBridge.makeCompatible(from: inputURL.path, to: outputURL.path)
        return ["photoUri": outputURL.absoluteString, "verified": true]
      }.value
    }
  }

  private static func fileURL(from value: String) -> URL? {
    if value.hasPrefix("file://") { return URL(string: value) }
    guard value.hasPrefix("/") else { return nil }
    return URL(fileURLWithPath: value)
  }
}
