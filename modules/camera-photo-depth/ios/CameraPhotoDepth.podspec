Pod::Spec.new do |s|
  s.name = 'CameraPhotoDepth'
  s.version = '1.0.0'
  s.summary = 'Local depth estimation and recoverable Photos edits.'
  s.description = 'Depth Anything V2 Small Core ML inference with PhotoKit editing and recovery.'
  s.license = 'MIT'
  s.author = 'Komorebi'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.platforms = { :ios => '17.0' }
  s.swift_version = '5.9'
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.frameworks = 'CoreML', 'CoreImage', 'ImageIO', 'Photos', 'AVFoundation', 'CryptoKit'
  s.resource_bundles = { 'CameraPhotoDepth' => ['Models/DepthAnythingV2SmallF16.mlpackage', 'Models/model-lock.json', 'Models/LICENSE.txt', '../THIRD_PARTY_NOTICES.txt'] }
  s.script_phase = {
    :name => 'Verify pinned depth model',
    :execution_position => :before_compile,
    :script => '/usr/bin/ruby "${PODS_TARGET_SRCROOT}/../../../scripts/verify-depth-model.rb"'
  }
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
