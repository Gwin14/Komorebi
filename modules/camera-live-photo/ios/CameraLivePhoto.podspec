Pod::Spec.new do |s|
  s.name           = 'CameraLivePhoto'
  s.version        = '1.0.0'
  s.summary        = 'Live Photo capture module for Expo.'
  s.description    = 'Captures iOS Live Photos using AVFoundation and saves the paired photo/video resources to the user photo library.'
  s.author         = ''
  s.homepage       = ''
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
end
