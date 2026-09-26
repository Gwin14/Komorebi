import { AlphaType, ColorType, Skia } from "@shopify/react-native-skia";
import { buildLutAtlas } from "./lutAtlas";

const colorSource = `
uniform shader source;
uniform shader lut;
uniform float lutSize;
uniform float3 domainMin;
uniform float3 domainScale;
uniform float grainStrength;
uniform float grainPhase;

float3 lookup(float r, float g, float b) {
  return lut.eval(float2(b * (lutSize + 2.0) + r + 1.5, g + 0.5)).rgb;
}

half4 main(float2 xy) {
  half4 pixel = source.eval(xy);
  float3 coordinate = clamp((pixel.rgb - domainMin) * domainScale, 0.0, 1.0) * (lutSize - 1.0);
  float3 low = floor(coordinate);
  float3 high = min(low + 1.0, lutSize - 1.0);
  float3 fraction = coordinate - low;
  float3 color = mix(
    lookup(coordinate.r, coordinate.g, low.b),
    lookup(coordinate.r, coordinate.g, high.b),
    fraction.b
  );
  float luminance = dot(color, float3(0.2126, 0.7152, 0.0722));
  float noise = fract(sin(dot(floor(xy) + grainPhase, float2(12.9898, 78.233))) * 43758.5453) - 0.5;
  color = clamp(color + noise * grainStrength * (1.15 - 0.5 * luminance), 0.0, 1.0);
  return half4(color, pixel.a);
}`;

const halationSource = `
uniform shader source;
uniform float threshold;
uniform float softness;
uniform float contrastRadius;
uniform float minContrast;
uniform float contrastSoftness;

half4 main(float2 xy) {
  float3 color = source.eval(xy).rgb;
  float peak = max(max(color.r, color.g), color.b);
  float2 distance = float2(contrastRadius, 0.0);
  float nearby = (
    dot(source.eval(xy + distance).rgb, float3(0.2126, 0.7152, 0.0722)) +
    dot(source.eval(xy - distance).rgb, float3(0.2126, 0.7152, 0.0722)) +
    dot(source.eval(xy + distance.yx).rgb, float3(0.2126, 0.7152, 0.0722)) +
    dot(source.eval(xy - distance.yx).rgb, float3(0.2126, 0.7152, 0.0722))
  ) * 0.25;
  float highlight = smoothstep(threshold - softness, threshold + softness, peak) *
    smoothstep(minContrast - contrastSoftness, minContrast + contrastSoftness, peak - nearby);
  return half4(float3(1.0, 0.18, 0.055) * highlight, highlight);
}`;

export const colorEffect = Skia.RuntimeEffect.Make(colorSource);
export const halationEffect = Skia.RuntimeEffect.Make(halationSource);

export function makeLutImage(cube) {
  const atlas = buildLutAtlas(cube);
  if (!atlas) return null;
  const data = Skia.Data.fromBytes(atlas.pixels);
  return {
    image: Skia.Image.MakeImage({
      width: atlas.width,
      height: atlas.height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Opaque,
    }, data, atlas.width * 4),
    size: atlas.size,
    domainMin: atlas.domainMin,
    domainScale: atlas.domainScale,
  };
}

export const identityLut = makeLutImage({
  size: 2,
  lut: Array.from({ length: 8 }, (_, index) => ({
    r: index & 1,
    g: (index >> 1) & 1,
    b: (index >> 2) & 1,
  })),
});
