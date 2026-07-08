Pod::Spec.new do |s|
  s.name           = 'CameraControlButton'
  s.version        = '1.0.0'
  s.summary        = 'Hardware Camera Control / capture button bridge for Expo.'
  s.description    = 'Exposes AVCaptureEventInteraction so the iPhone 16/17 Pro Camera Control button (and capture hardware buttons) can trigger the app shutter.'
  s.license        = 'MIT'
  s.author         = 'Komorebi'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVKit'
  s.weak_frameworks = 'LockedCameraCapture'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
