import CoreImage
import Foundation

// Float kernels preserve precision through the creative stage. Grain is seeded
// once per capture so retries and alternative crops retain the same texture.
enum HeifPlusEffects {
  private static let statistics = CIContext(options: [.cacheIntermediates: false])
  private static let tetrahedral = CIKernel(source: """
    vec3 lookup(sampler table, vec3 p, float size) {
      return sample(table, samplerTransform(table, vec2(p.r + p.g * size + 0.5, size - p.b - 0.5))).rgb;
    }
    kernel vec4 tetrahedral(sampler sourceImage, sampler table, float size) {
      vec4 pixel = sample(sourceImage, samplerCoord(sourceImage));
      vec3 position = clamp(pixel.rgb, 0.0, 1.0) * (size - 1.0);
      vec3 low = min(floor(position), vec3(size - 2.0));
      vec3 f = position - low;
      vec3 c0 = lookup(table, low, size);
      vec3 c3 = lookup(table, low + vec3(1.0), size);
      vec3 result;
      if (f.r >= f.g) {
        if (f.g >= f.b) {
          vec3 c1 = lookup(table, low + vec3(1.0, 0.0, 0.0), size);
          vec3 c2 = lookup(table, low + vec3(1.0, 1.0, 0.0), size);
          result = c0 + f.r * (c1-c0) + f.g * (c2-c1) + f.b * (c3-c2);
        } else if (f.r >= f.b) {
          vec3 c1 = lookup(table, low + vec3(1.0, 0.0, 0.0), size);
          vec3 c2 = lookup(table, low + vec3(1.0, 0.0, 1.0), size);
          result = c0 + f.r * (c1-c0) + f.b * (c2-c1) + f.g * (c3-c2);
        } else {
          vec3 c1 = lookup(table, low + vec3(0.0, 0.0, 1.0), size);
          vec3 c2 = lookup(table, low + vec3(1.0, 0.0, 1.0), size);
          result = c0 + f.b * (c1-c0) + f.r * (c2-c1) + f.g * (c3-c2);
        }
      } else {
        if (f.b >= f.g) {
          vec3 c1 = lookup(table, low + vec3(0.0, 0.0, 1.0), size);
          vec3 c2 = lookup(table, low + vec3(0.0, 1.0, 1.0), size);
          result = c0 + f.b * (c1-c0) + f.g * (c2-c1) + f.r * (c3-c2);
        } else if (f.b >= f.r) {
          vec3 c1 = lookup(table, low + vec3(0.0, 1.0, 0.0), size);
          vec3 c2 = lookup(table, low + vec3(0.0, 1.0, 1.0), size);
          result = c0 + f.g * (c1-c0) + f.b * (c2-c1) + f.r * (c3-c2);
        } else {
          vec3 c1 = lookup(table, low + vec3(0.0, 1.0, 0.0), size);
          vec3 c2 = lookup(table, low + vec3(1.0, 1.0, 0.0), size);
          result = c0 + f.g * (c1-c0) + f.r * (c2-c1) + f.b * (c3-c2);
        }
      }
      return vec4(clamp(result, 0.0, 1.0), pixel.a);
    }
    """)
  private static let signal = CIColorKernel(source: """
    kernel vec4 signal(__sample p) {
      float y = dot(p.rgb, vec3(0.2126, 0.7152, 0.0722));
      float s = y * 0.72 + max(p.r, max(p.g, p.b)) * 0.28;
      return vec4(s, s, s, 1.0);
    }
    """)
  private static let mask = CIColorKernel(source: """
    kernel vec4 mask(__sample p, __sample nearby, float floorValue, float softness,
      float minContrast, float contrastSoftness) {
      float y = dot(p.rgb, vec3(0.2126, 0.7152, 0.0722));
      float s = y * 0.72 + max(p.r, max(p.g, p.b)) * 0.28;
      float local = dot(nearby.rgb, vec3(0.2126, 0.7152, 0.0722));
      float h = smoothstep(floorValue, floorValue + softness, s);
      float e = smoothstep(minContrast, minContrast + contrastSoftness, max(0.0, s - local));
      return vec4(h * e, h * e, h * e, 1.0);
    }
    """)
  private static let glow = CIColorKernel(source: """
    kernel vec4 glow(__sample p, __sample m, __sample fringeBlur, __sample diffusionBlur,
      float fringeIntensity, float diffusionIntensity) {
      float y = dot(p.rgb, vec3(0.2126, 0.7152, 0.0722));
      float dark = pow(max(0.0, 1.0 - y), 0.68);
      float f = max(0.0, fringeBlur.r - m.r * 0.72) * dark * fringeIntensity;
      float d = max(0.0, diffusionBlur.r - m.r * 0.9) * dark * diffusionIntensity;
      return vec4(f, d, f + d, 1.0);
    }
    """)
  private static let blend = CIColorKernel(source: """
    kernel vec4 blend(__sample p, __sample halo, float gain) {
      float sum = halo.r + halo.g;
      float alpha = clamp(sum * gain, 0.0, 1.0);
      vec3 color = sum > 0.001 ? vec3(1.0,
        (78.0 * halo.r + 151.0 * halo.g) / (255.0 * sum),
        (30.0 * halo.r + 74.0 * halo.g) / (255.0 * sum)) : vec3(0.0);
      return vec4(1.0 - (1.0 - p.rgb) * (1.0 - color * alpha), p.a);
    }
    """)
  private static let grain = CIColorKernel(source: """
    float hash(vec2 p, float seed) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453);
    }
    float triangular(vec2 p, float seed) {
      return (hash(p, seed) + hash(p, seed + 37.0) - 1.0) * 2.449489743;
    }
    float correlated(vec2 p, float seed, float correlation) {
      float w = correlation * 0.5;
      float raw = 1.0 - correlation;
      float gain = inversesqrt(raw * raw + 2.0 * w * w);
      // Symmetric neighbouring noise preserves the preset's correlation and variance.
      return (triangular(p, seed) * raw +
        (triangular(p + vec2(-1.0, 0.0), seed) + triangular(p + vec2(0.0, -1.0), seed)) * w) * gain;
    }
    kernel vec4 grain(__sample p, float seed, float lumaStrength, float chromaStrength,
      float shadowBoost, float highlightReduction, float correlation,
      float clumpSize, float clumpAmount) {
      vec2 xy = destCoord();
      float tone = dot(p.rgb, vec3(0.2126, 0.7152, 0.0722));
      float weight = smoothstep(0.025, 0.14, tone) *
        (1.0 - smoothstep(0.64, 1.0, tone) * highlightReduction) *
        (1.0 + (1.0 - smoothstep(0.16, 0.58, tone)) * shadowBoost);
      vec2 grid = xy / clumpSize;
      vec2 cell = floor(grid);
      vec2 f = smoothstep(vec2(0.0), vec2(1.0), fract(grid));
      float clump = mix(mix(hash(cell, seed), hash(cell + vec2(1.0, 0.0), seed), f.x),
        mix(hash(cell + vec2(0.0, 1.0), seed), hash(cell + vec2(1.0), seed), f.x), f.y) * 2.0 - 1.0;
      float mono = correlated(xy, seed, correlation) * lumaStrength * weight * (1.0 + clump * clumpAmount);
      float a = correlated(xy, seed + 101.0, correlation) * chromaStrength * weight;
      float b = correlated(xy, seed + 211.0, correlation) * chromaStrength * weight;
      return vec4(clamp(p.rgb + vec3(mono + a, mono - a * 0.45 + b * 0.2, mono + b), 0.0, 1.0), p.a);
    }
    """)
  private static func fail(_ message: String) -> NSError {
    NSError(domain: "HeifPlusEffects", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
  private static func scalar(_ image: CIImage, channel: Int = 0) -> Float {
    var pixel = [Float](repeating: 0, count: 4)
    statistics.render(image, toBitmap: &pixel, rowBytes: 16,
      bounds: CGRect(x: 0, y: 0, width: 1, height: 1), format: .RGBAf,
      colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
    return pixel[channel]
  }
  static func apply(to source: CIImage, effects: [String: Any]) throws -> CIImage {
    if effects["cube"] as? [String: Any] == nil && effects["halationConfig"] as? [String: Any] == nil && effects["grainConfig"] as? [String: Any] == nil { return source }
    var image = source
    let extent = image.extent
    // Existing creative presets/LUTs are defined in display-referred sRGB.
    image = image.matchedFromWorkingSpace(to: CGColorSpace(name: CGColorSpace.sRGB)!) ?? image
    if let cube = effects["cube"] as? [String: Any], let size = cube["size"] as? Int,
       let lut = cube["lut"] as? [[String: Any]] {
      guard (2...64).contains(size), lut.count == size * size * size else { throw fail("LUT HEIF+ inválido") }
      let low = cube["domainMin"] as? [Double] ?? [0, 0, 0]
      let high = cube["domainMax"] as? [Double] ?? [1, 1, 1]
      guard low.count == 3, high.count == 3,
        (0..<3).allSatisfy({ low[$0].isFinite && high[$0].isFinite && high[$0] > low[$0] }) else { throw fail("Domínio LUT inválido") }
      let scale = (0..<3).map { 1 / (high[$0] - low[$0]) }
      image = image.applyingFilter("CIColorMatrix", parameters: [
        "inputRVector": CIVector(x: scale[0], y: 0, z: 0, w: 0),
        "inputGVector": CIVector(x: 0, y: scale[1], z: 0, w: 0),
        "inputBVector": CIVector(x: 0, y: 0, z: scale[2], w: 0),
        "inputBiasVector": CIVector(x: -low[0] * scale[0], y: -low[1] * scale[1], z: -low[2] * scale[2], w: 0)])
      var values: [Float] = []; values.reserveCapacity(lut.count * 4)
      for entry in lut {
        for key in ["r", "g", "b"] {
          guard let value = entry[key] as? NSNumber, value.floatValue.isFinite else { throw fail("Cor LUT inválida") }
          values.append(min(1, max(0, value.floatValue)))
        }
        values.append(1)
      }
      let data = values.withUnsafeBytes { Data($0) }
      let table = CIImage(bitmapData: data, bytesPerRow: size * size * 16,
        size: CGSize(width: size * size, height: size), format: .RGBAf, colorSpace: nil)
      guard let tetrahedral, let result = tetrahedral.apply(extent: extent,
        roiCallback: { index, rect in index == 1 ? table.extent : rect },
        arguments: [image, table, size]) else { throw fail("Kernel LUT indisponível") }
      image = result
    }
    if let halo = effects["halationConfig"] as? [String: Any] {
      guard let signal, let mask, let glow, let blend else { throw fail("Kernels de halation indisponíveis") }
      func value(_ key: String, _ defaultValue: Double) -> Double {
        (halo[key] as? NSNumber)?.doubleValue ?? defaultValue
      }
      let resolutionScale = max(extent.width, extent.height) / 3000
      let smallScale = min(0.4, 1200 / max(extent.width, extent.height))
      let small = image.transformed(by: .init(scaleX: smallScale, y: smallScale))
      let bounds = small.extent
      guard let signals = signal.apply(extent: bounds, arguments: [small]) else { throw fail("Masque de luminância inválida") }
      let hist = signals.applyingFilter("CIAreaHistogram", parameters: [
        "inputExtent": CIVector(cgRect: bounds), "inputCount": 256, "inputScale": 1])
      var bins = [Float](repeating: 0, count: 256 * 4)
      statistics.render(hist, toBitmap: &bins, rowBytes: 256 * 16,
        bounds: CGRect(x: 0, y: 0, width: 256, height: 1), format: .RGBAf,
        colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
      var cumulative: Float = 0; var percentile = 1.0
      for i in 0..<256 { cumulative += bins[i * 4]; if cumulative >= 0.98 { percentile = Double(i) / 255; break } }
      let floorValue = min(max(0, value("threshold", 0.8) - value("softness", 0.14)), percentile * 0.82)
      let nearby = small.clampedToExtent().applyingFilter("CIBoxBlur", parameters: [
        kCIInputRadiusKey: max(2, value("contrastRadius", 56) * resolutionScale * smallScale)]).cropped(to: bounds)
      guard let highlights = mask.apply(extent: bounds, arguments: [small, nearby, floorValue,
        value("softness", 0.14), value("minContrast", 0.18), value("contrastSoftness", 0.2)]) else { throw fail("Máscara de halation inválida") }
      func blur(_ radius: Double) -> CIImage {
        let r = max(1, radius * resolutionScale * smallScale * 0.5)
        return highlights.clampedToExtent().applyingFilter("CIBoxBlur", parameters: [kCIInputRadiusKey: r])
          .applyingFilter("CIBoxBlur", parameters: [kCIInputRadiusKey: r]).cropped(to: bounds)
      }
      guard let haloImage = glow.apply(extent: bounds, arguments: [small, highlights,
        blur(value("fringeRadius", 10)), blur(value("diffusionRadius", 26)),
        value("fringeIntensity", 1), value("diffusionIntensity", 0.32)]) else { throw fail("Halation inválida") }
      let maximum = scalar(haloImage.applyingFilter("CIAreaMaximum", parameters: ["inputExtent": CIVector(cgRect: bounds)]), channel: 2)
      let gain = maximum > 0.001 ? max(1, value("targetPeakOpacity", 0.22) / Double(maximum)) : 1
      let fullHalo = haloImage.transformed(by: .init(scaleX: 1 / smallScale, y: 1 / smallScale))
      guard let result = blend.apply(extent: extent, arguments: [image, fullHalo, gain]) else { throw fail("Blend de halation inválido") }
      image = result
    }
    if let config = effects["grainConfig"] as? [String: Any] {
      guard let grain else { throw fail("Kernel de grain indisponível") }
      func value(_ key: String, _ fallback: Double) -> Double { (config[key] as? NSNumber)?.doubleValue ?? fallback }
      let scale = max(extent.width, extent.height) / 3000
      guard let result = grain.apply(extent: extent, arguments: [image,
        (effects["seed"] as? NSNumber)?.doubleValue ?? 1,
        value("lumaStrength", 0) / 255, value("chromaStrength", 0) / 255,
        value("shadowBoost", 0), value("highlightReduction", 0),
        min(0.45, max(0, value("correlation", 0))), max(8, value("clumpSize", 26) * scale), value("clumpAmount", 0)]) else { throw fail("Grain inválido") }
      image = result
    }
    return (image.matchedToWorkingSpace(from: CGColorSpace(name: CGColorSpace.sRGB)!) ?? image).cropped(to: extent)
  }
}
