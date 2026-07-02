Pod::Spec.new do |s|
  s.name           = 'CameraRawCapture'
  s.version        = '1.0.0'
  s.summary        = 'RAW and Apple ProRAW capability bridge for Expo.'
  s.description    = 'Exposes native AVCaptureDevice RAW capture capability checks used by Komorebi before requesting RAW/DNG captures from VisionCamera.'
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

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
