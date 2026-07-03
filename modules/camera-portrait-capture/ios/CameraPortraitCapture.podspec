Pod::Spec.new do |s|
  s.name           = 'CameraPortraitCapture'
  s.version        = '1.0.0'
  s.summary        = 'Portrait photo capture module for Expo.'
  s.description    = 'Captures iOS portrait-style photos with depth data and portrait effects matte when available.'
  s.author         = ''
  s.homepage       = ''
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
end
