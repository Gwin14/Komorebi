Pod::Spec.new do |s|
  s.name           = 'CameraImageStacking'
  s.version        = '1.0.0'
  s.summary        = 'Extensible on-device image stacking for Komorebi.'
  s.description    = 'Captures, aligns, analyzes and composites image sequences using AVFoundation, Vision and Core Image.'
  s.license        = 'MIT'
  s.author         = 'Komorebi'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '18.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
