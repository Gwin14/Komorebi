Pod::Spec.new do |s|
  s.name           = 'CameraLivePhoto'
  s.version        = '1.0.0'
  s.summary        = 'Live Photo capture module for Expo.'
  s.description    = 'Captures iOS Live Photos using AVFoundation and saves the paired photo/video resources to the user photo library.'
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
