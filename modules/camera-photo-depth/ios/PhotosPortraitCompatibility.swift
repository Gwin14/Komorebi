import Foundation

enum PhotosPortraitCompatibility {
  // Records physical Photos acceptance; generation is enabled independently
  // at the user's request. Set true only after the device procedure passes.
  // Auxiliary disparity alone does not prove that Photos exposes portrait edits.
  static let validated = false
  static let generationEnabled = true
  static var generationReason: String {
    validated
      ? "Gerar profundidade no aparelho, preservando a versão anterior."
      : "Gerar profundidade experimental. Confira o desfoque no Fotos."
  }
  static let reason = "Profundidade aguardando validação do desfoque no Fotos."
}
