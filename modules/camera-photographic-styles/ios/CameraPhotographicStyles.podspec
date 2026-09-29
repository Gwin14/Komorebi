Pod::Spec.new do |s|
  s.name           = 'CameraPhotographicStyles'
  s.version        = '1.0.0'
  s.summary        = 'Apple Photographic Styles-compatible HEIF writer for Komorebi.'
  s.description    = 'Builds the auxiliary HEIF graph required by Apple Photos without applying a visual style.'
  s.license        = 'MIT'
  s.author         = 'Komorebi'
  s.homepage       = 'https://github.com/BeetMan/XDRemux-Flutter'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.vendored_frameworks = 'Frameworks/XDRemuxCore.xcframework'
  s.frameworks = 'VideoToolbox', 'CoreMedia', 'CoreVideo', 'ImageIO', 'Photos', 'CoreLocation'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
