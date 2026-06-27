Pod::Spec.new do |s|
  s.name           = 'CameraManualControls'
  s.version        = '1.0.0'
  s.summary        = 'Manual ISO, shutter speed, white balance and focus control for Expo.'
  s.description    = 'Locks AVCaptureDevice exposure (ISO/duration), white balance gains and lens position to enable manual camera controls alongside react-native-vision-camera.'
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

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
