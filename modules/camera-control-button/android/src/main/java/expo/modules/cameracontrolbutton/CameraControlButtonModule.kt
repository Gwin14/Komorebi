package expo.modules.cameracontrolbutton

import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.Window
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CameraControlButtonModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var listeningRequested = false
  private var window: Window? = null
  private var callback: Window.Callback? = null
  private var originalCallback: Window.Callback? = null
  private val pressedKeys = mutableSetOf<Int>()

  override fun definition() = ModuleDefinition {
    Name("CameraControlButton")
    Events("onCameraButtonPressed")
    Function("isSupported") { true }
    AsyncFunction("startListening") {
      listeningRequested = true
      attach()
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("stopListening") {
      listeningRequested = false
      detach()
    }.runOnQueue(Queues.MAIN)
    OnActivityEntersBackground { mainHandler.post { detach() } }
    OnActivityEntersForeground {
      mainHandler.post { if (listeningRequested) attach() }
    }
    OnActivityDestroys {
      listeningRequested = false
      mainHandler.post { detach() }
    }
    OnDestroy {
      listeningRequested = false
      mainHandler.post { detach() }
    }
  }

  private fun attach() {
    if (callback != null) return
    val activeWindow = appContext.currentActivity?.window ?: return
    val original = activeWindow.callback ?: return
    val wrapper = object : Window.Callback by original {
      override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val code = event.keyCode
        if (callback !== this || !listeningRequested || (code != KeyEvent.KEYCODE_VOLUME_UP && code != KeyEvent.KEYCODE_VOLUME_DOWN)) {
          return original.dispatchKeyEvent(event)
        }
        when (event.action) {
          KeyEvent.ACTION_DOWN -> if (event.repeatCount == 0) pressedKeys.add(code)
          KeyEvent.ACTION_UP -> {
            val wasPressed = pressedKeys.remove(code)
            if (wasPressed && !event.isCanceled) {
              sendEvent("onCameraButtonPressed", mapOf("type" to
                if (code == KeyEvent.KEYCODE_VOLUME_UP) "secondary" else "primary"))
            }
          }
        }
        return true
      }
    }
    window = activeWindow
    originalCallback = original
    callback = wrapper
    activeWindow.callback = wrapper
  }

  private fun detach() {
    // Do not replace a callback that another interaction installed after ours.
    if (window?.callback === callback) window?.callback = originalCallback
    pressedKeys.clear()
    callback = null
    originalCallback = null
    window = null
  }
}
