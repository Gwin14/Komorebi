import AVFoundation
import CoreImage
import Foundation
import UIKit

// Shared by the three AVFoundation camera views. Core Image does all pixel work
// off the capture queue; a new frame is dropped while one is being rendered.
final class LiveEffectPreviewRenderer {
  let imageView = UIImageView()

  private let context = CIContext(options: [
    .useSoftwareRenderer: false,
    .workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
    .outputColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
  ])
  private let queue = DispatchQueue(label: "dev.komorebi.live-effect-preview", qos: .userInteractive)
  private let lock = NSLock()
  private var inFlight = false
  private var lastFrameAt = CFAbsoluteTime(0)
  private var generation = 0
  private var frameNumber = 0
  private var lutSize = 0
  private var lutValues: [Double] = []
  private var cubeData: Data?
  private var lutDomain: [Double] = [0, 0, 0, 1, 1, 1]
  private var grainStrength = 0.0
  private var halation: [Double] = []

  private static let grainKernel = CIColorKernel(source: """
    kernel vec4 grain(__sample image, __sample random, float strength) {
      float luma = dot(image.rgb, vec3(0.2126, 0.7152, 0.0722));
      float noise = (random.r - 0.5) * strength * (1.15 - 0.5 * luma);
      return vec4(clamp(image.rgb + noise, 0.0, 1.0), image.a);
    }
  """)
  private static let halationKernel = CIColorKernel(source: """
    kernel vec4 halo(__sample image, __sample nearby,
                     float threshold, float softness, float contrast, float intensity) {
      float peak = max(image.r, max(image.g, image.b));
      float local = dot(nearby.rgb, vec3(0.2126, 0.7152, 0.0722));
      float light = smoothstep(threshold - softness, threshold + softness, peak);
      float edge = smoothstep(contrast * 0.5, contrast * 1.5, peak - local);
      float alpha = light * edge * intensity;
      return vec4(alpha, alpha * 0.18, alpha * 0.055, alpha);
    }
  """)

  init() {
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.isUserInteractionEnabled = false
    imageView.isHidden = true
  }

  static func exifOrientation(for orientation: AVCaptureVideoOrientation) -> Int32 {
    switch orientation {
    case .portrait: return 6
    case .portraitUpsideDown: return 8
    case .landscapeLeft: return 3
    case .landscapeRight: return 1
    @unknown default: return 6
    }
  }

  func setLut(size: Int, values: [Double]) {
    lock.lock()
    lutSize = size
    lutValues = values
    cubeData = Self.makeCubeData(size: size, values: values)
    generation += 1
    let enabled = isEnabled
    lock.unlock()
    updateVisibility(enabled)
  }

  func setGrainStrength(_ strength: Double) {
    lock.lock()
    grainStrength = max(0, strength)
    generation += 1
    let enabled = isEnabled
    lock.unlock()
    updateVisibility(enabled)
  }

  func setLutDomain(_ values: [Double]) {
    lock.lock()
    lutDomain = values.count == 6 ? values : [0, 0, 0, 1, 1, 1]
    generation += 1
    lock.unlock()
  }

  func setHalation(_ parameters: [Double]) {
    lock.lock()
    halation = parameters
    generation += 1
    let enabled = isEnabled
    lock.unlock()
    updateVisibility(enabled)
  }

  private var isEnabled: Bool {
    cubeData != nil || grainStrength > 0 || halation.count >= 6
  }

  private func updateVisibility(_ enabled: Bool) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if !enabled { self.imageView.image = nil }
      self.imageView.isHidden = !enabled || self.imageView.image == nil
    }
  }

  func submit(_ pixelBuffer: CVPixelBuffer, orientation: Int32, mirrored: Bool) {
    let now = CFAbsoluteTimeGetCurrent()
    lock.lock()
    guard isEnabled, !inFlight, now - lastFrameAt >= 1.0 / 24.0 else {
      lock.unlock()
      return
    }
    inFlight = true
    lastFrameAt = now
    frameNumber += 1
    let currentFrame = frameNumber
    let currentGeneration = generation
    let size = lutSize
    let cube = cubeData
    let domain = lutDomain
    let grain = grainStrength
    let halo = halation
    lock.unlock()

    queue.async { [weak self] in
      guard let self else { return }
      autoreleasepool {
        var image = CIImage(cvPixelBuffer: pixelBuffer)
        if orientation != 1 { image = image.oriented(forExifOrientation: orientation) }
        if mirrored { image = image.oriented(.upMirrored) }
        let scale = min(1.0, 720.0 / max(image.extent.width, image.extent.height))
        image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let extent = image.extent

        if let cube, size >= 2 {
          if domain != [0, 0, 0, 1, 1, 1] {
            let scale = (0..<3).map { 1 / max(0.0001, domain[$0 + 3] - domain[$0]) }
            image = image.applyingFilter("CIColorMatrix", parameters: [
              "inputRVector": CIVector(x: CGFloat(scale[0]), y: 0, z: 0, w: 0),
              "inputGVector": CIVector(x: 0, y: CGFloat(scale[1]), z: 0, w: 0),
              "inputBVector": CIVector(x: 0, y: 0, z: CGFloat(scale[2]), w: 0),
              "inputBiasVector": CIVector(
                x: CGFloat(-domain[0] * scale[0]),
                y: CGFloat(-domain[1] * scale[1]),
                z: CGFloat(-domain[2] * scale[2]), w: 0
              ),
            ])
          }
          image = image.applyingFilter("CIColorCube", parameters: [
            "inputCubeDimension": size,
            "inputCubeData": cube,
          ])
        }
        if halo.count >= 6, let kernel = Self.halationKernel {
          let nearby = image.applyingFilter("CIGaussianBlur", parameters: [
            kCIInputRadiusKey: halo[2] * scale,
          ]).cropped(to: extent)
          if let highlights = kernel.apply(extent: extent, arguments: [
            image, nearby, halo[0], halo[1], halo[3], halo[5],
          ]) {
            let glow = highlights.applyingFilter("CIGaussianBlur", parameters: [
              kCIInputRadiusKey: halo[4] * scale,
            ]).cropped(to: extent)
            image = glow.applyingFilter("CIScreenBlendMode", parameters: [
              kCIInputBackgroundImageKey: image,
            ]).cropped(to: extent)
          }
        }
        if grain > 0, let kernel = Self.grainKernel {
          let random = CIFilter(name: "CIRandomGenerator")!.outputImage!
            .transformed(by: CGAffineTransform(translationX: CGFloat(currentFrame * 37), y: CGFloat(currentFrame * 53)))
          image = kernel.apply(extent: extent, arguments: [image, random, grain]) ?? image
        }
        let output = self.context.createCGImage(image.cropped(to: extent), from: extent)
        self.lock.lock()
        let current = self.generation == currentGeneration && self.isEnabled
        self.inFlight = false
        self.lock.unlock()
        if current, let output {
          DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let valid = self.generation == currentGeneration && self.isEnabled
            self.lock.unlock()
            if valid {
              self.imageView.image = UIImage(cgImage: output)
              self.imageView.isHidden = false
            }
          }
        }
      }
    }
  }

  private static func makeCubeData(size: Int, values: [Double]) -> Data? {
    guard size >= 2, values.count == size * size * size * 3 else { return nil }
    var rgba = [Float]()
    rgba.reserveCapacity(size * size * size * 4)
    for index in stride(from: 0, to: values.count, by: 3) {
      rgba.append(Float(min(1, max(0, values[index]))))
      rgba.append(Float(min(1, max(0, values[index + 1]))))
      rgba.append(Float(min(1, max(0, values[index + 2]))))
      rgba.append(1)
    }
    return rgba.withUnsafeBytes { Data($0) }
  }
}
