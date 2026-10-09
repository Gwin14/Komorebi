#!/usr/bin/env ruby
require 'json'
require 'digest'

root = File.expand_path('../modules/camera-photo-depth/ios/Models', __dir__)
lock = JSON.parse(File.read(File.join(root, 'model-lock.json')))
lock.fetch('files').each do |relative, expected|
  actual = Digest::SHA256.file(File.join(root, relative)).hexdigest
  abort("Depth model checksum mismatch: #{relative}") unless actual == expected
end
puts "#{lock.fetch('name')} #{lock.fetch('version')}: checksums verified"
