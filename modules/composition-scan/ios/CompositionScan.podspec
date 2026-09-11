Pod::Spec.new do |s|
  s.name = 'CompositionScan'
  s.version = '1.0.0'
  s.summary = 'On-demand, on-device composition analysis.'
  s.description = 'Captures one reduced camera frame and analyzes it with Apple Vision.'
  s.license = 'MIT'
  s.author = 'Komorebi'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.platforms = { :ios => '18.0' }
  s.swift_version = '5.9'
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'VisionCamera'
  s.frameworks = 'Vision', 'CoreImage', 'AVFoundation'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.{h,m,mm,swift}'
end
