import ExpoModulesCore
import AVKit
import UIKit

// Bridges the iPhone hardware capture button (volume buttons and the
// iPhone 16/17 Pro "Camera Control") into JavaScript using
// `AVCaptureEventInteraction`. The interaction only takes over the hardware
// buttons while an `AVCaptureSession` is active in the app (provided here by
// the camera preview), so it is safe to keep attached while the camera is open.
public class CameraControlButtonModule: Module {
  private var interaction: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("CameraControlButton")

    Events("onCameraButtonPressed")

    // Whether the running OS can deliver capture-button events at all.
    Function("isSupported") { () -> Bool in
      if #available(iOS 17.2, *) {
        return true
      }
      return false
    }

    AsyncFunction("startListening") { [weak self] in
      self?.attachInteraction()
    }
    .runOnQueue(.main)

    AsyncFunction("stopListening") { [weak self] in
      self?.detachInteraction()
    }
    .runOnQueue(.main)

    OnDestroy { [weak self] in
      DispatchQueue.main.async {
        self?.detachInteraction()
      }
    }
  }

  @available(iOS 17.2, *)
  private func makeInteraction() -> AVCaptureEventInteraction {
    return AVCaptureEventInteraction(
      primary: { [weak self] event in
        // Fire once per click, on release, to mirror a shutter tap.
        if event.phase == .ended {
          self?.sendEvent("onCameraButtonPressed", ["type": "primary"])
        }
      },
      secondary: { [weak self] event in
        if event.phase == .ended {
          self?.sendEvent("onCameraButtonPressed", ["type": "secondary"])
        }
      }
    )
  }

  private func attachInteraction() {
    guard #available(iOS 17.2, *) else { return }
    if interaction != nil { return }
    guard let view = Self.topView() else { return }

    let interaction = makeInteraction()
    view.addInteraction(interaction)
    self.interaction = interaction
  }

  private func detachInteraction() {
    guard #available(iOS 17.2, *) else {
      interaction = nil
      return
    }
    if let interaction = interaction as? AVCaptureEventInteraction {
      interaction.view?.removeInteraction(interaction)
    }
    interaction = nil
  }

  // Resolves the active key window's root view to host the interaction.
  private static func topView() -> UIView? {
    let scenes = UIApplication.shared.connectedScenes
    let windowScene = scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene
      ?? scenes.first as? UIWindowScene
    let window = windowScene?.windows.first { $0.isKeyWindow }
      ?? windowScene?.windows.first
    return window?.rootViewController?.view
  }
}
