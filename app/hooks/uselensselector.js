import { getPhysicalLenses } from "../utils/controlGestures";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { Camera } from "react-native-vision-camera";
import { getCameraZoomCapabilities } from "../../modules/camera-manual-controls";

const PHYSICAL_DEVICE_META = {
  "ultra-wide-angle-camera": {
    id: "ultra-wide",
    label: "0.5",
    type: "ultra-wide",
    order: 0,
  },
  "wide-angle-camera": {
    id: "wide",
    label: "1",
    type: "wide",
    order: 1,
  },
  "telephoto-camera": {
    id: "telephoto",
    label: "T",
    type: "telephoto",
    order: 2,
  },
};

const getMaxResolution = (device, widthKey, heightKey) =>
  Math.max(
    0,
    ...(device.formats ?? []).map(
      (format) => (format[widthKey] ?? 0) * (format[heightKey] ?? 0),
    ),
  );

const getDevicePreferenceScore = (device, preferLogical = false) => {
  const name = String(device.name ?? "").toLowerCase();
  let score = 0;

  if (name.includes("lidar") || name.includes("depth")) score -= 1_000_000;
  if (preferLogical && device.isMultiCam) score += 2_000_000;
  if (preferLogical) score += (device.physicalDevices?.length ?? 0) * 100_000;
  if (device.physicalDevices?.includes("wide-angle-camera")) score += 10_000;
  if (device.hasFlash) score += 500;
  if (device.supportsFocus) score += 250;
  if (device.supportsRawCapture) score += 100;

  score += getMaxResolution(device, "photoWidth", "photoHeight") / 1_000_000;
  score += getMaxResolution(device, "videoWidth", "videoHeight") / 2_000_000;

  return score;
};

const formatZoomLabel = (displayZoom) => {
  if (!Number.isFinite(displayZoom)) return "1";
  const rounded = Math.round(displayZoom * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const makeZoomPreset = (device, preset) => ({
  id: `zoom:${device.id}:${preset.displayZoom.toFixed(4)}`,
  label: formatZoomLabel(preset.displayZoom),
  type:
    Math.abs(preset.displayZoom - 1) < 0.05
      ? "wide"
      : preset.displayZoom < 1
        ? "ultra-wide"
        : "telephoto",
  device,
  order: preset.displayZoom,
  zoomFactor: preset.zoomFactor,
  displayZoom: preset.displayZoom,
  source: preset.source,
});

const dedupePresets = (presets) => {
  const sorted = [...presets].sort((a, b) => a.displayZoom - b.displayZoom);
  return sorted.filter(
    (preset, index) =>
      index === 0 ||
      Math.abs(preset.displayZoom - sorted[index - 1].displayZoom) >= 0.01,
  );
};

const normalizeIOSPresets = (presets) => {
  const uniquePresets = dedupePresets(presets);
  const hasNominalWide = uniquePresets.some(
    (preset) => Math.abs(preset.displayZoom - 1) < 0.05,
  );
  const subWidePresets = uniquePresets.filter(
    (preset) => preset.displayZoom < 0.95,
  );

  if (!hasNominalWide || subWidePresets.length <= 1) return uniquePresets;

  // AVFoundation can report an intermediate switch-over threshold (for
  // example 0.9x) between the ultra-wide and the nominal 1x camera. It is
  // useful to the capture pipeline, but it is not a user-facing native stop.
  const widestPreset = subWidePresets.reduce((widest, preset) =>
    preset.displayZoom < widest.displayZoom ? preset : widest,
  );

  return uniquePresets.filter(
    (preset) => preset.displayZoom >= 0.95 || preset === widestPreset,
  );
};

export function usePhysicalCameraDevices(facing = "back", enabled = true) {
  const [devices, setDevices] = useState([]);
  const [activeLensId, setActiveLensId] = useState(null);
  const [iosZoomCapabilities, setIOSZoomCapabilities] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setDevices([]);
      return undefined;
    }

    setDevices(Camera.getAvailableCameraDevices());
    const subscription = Camera.addCameraDevicesChangedListener(setDevices);
    return () => subscription.remove();
  }, [enabled]);

  const position = facing === "back" ? "back" : "front";
  const iosDevice = useMemo(() => {
    if (Platform.OS !== "ios") return null;

    return devices
      .filter((device) => device.position === position)
      .sort(
        (a, b) =>
          getDevicePreferenceScore(b, true) - getDevicePreferenceScore(a, true),
      )[0];
  }, [devices, position]);

  const refreshZoomCapabilities = useCallback(async () => {
    if (!enabled || Platform.OS !== "ios" || !iosDevice?.id) return null;

    try {
      const capabilities = await getCameraZoomCapabilities(iosDevice.id);
      if (capabilities) {
        setIOSZoomCapabilities({ deviceId: iosDevice.id, ...capabilities });
      }
      return capabilities;
    } catch (error) {
      console.warn("Não foi possível ler os fatores nativos de zoom:", error);
      return null;
    }
  }, [enabled, iosDevice?.id]);

  useEffect(() => {
    setIOSZoomCapabilities(null);
    void refreshZoomCapabilities();
  }, [refreshZoomCapabilities]);

  const lenses = useMemo(() => {
    const lensMap = new Map();

    devices
      .filter(
        (device) =>
          device.position === position &&
          device.physicalDevices?.length === 1 &&
          PHYSICAL_DEVICE_META[device.physicalDevices[0]],
      )
      .forEach((device) => {
        const physicalDeviceType = device.physicalDevices[0];
        const meta = PHYSICAL_DEVICE_META[physicalDeviceType];
        const candidate = {
          id: meta.id,
          label: meta.label,
          type: meta.type,
          device,
          order: meta.order,
          zoomFactor: device.neutralZoom ?? 1,
          displayZoom: Number(meta.label) || 1,
          score: getDevicePreferenceScore(device),
        };
        const current = lensMap.get(meta.type);

        if (!current || candidate.score > current.score) {
          lensMap.set(meta.type, candidate);
        }
      });

    const physicalLenses = Array.from(lensMap.values())
      .map(({ score, ...lens }) => lens)
      .sort((a, b) => a.order - b.order);

    if (
      Platform.OS === "ios" &&
      iosDevice &&
      iosZoomCapabilities?.deviceId === iosDevice.id &&
      iosZoomCapabilities.presets?.length > 0
    ) {
      const presets = normalizeIOSPresets(iosZoomCapabilities.presets)
        .map((preset) => {
          const presetDevice = devices.find(
            (device) => device.id === preset.deviceId,
          );
          if (!presetDevice) return null;
          return makeZoomPreset(presetDevice, preset);
        })
        .filter(Boolean);

      if (presets.length > 0) return presets;
    }

    if (physicalLenses.length > 0) return physicalLenses;

    return devices
      .filter((device) => device.position === position)
      .map((device, index) => ({
        id: device.id,
        label: "1",
        type: "unknown",
        device,
        order: index + 10,
        zoomFactor: device.neutralZoom ?? 1,
        displayZoom: 1,
      }));
  }, [devices, iosDevice, iosZoomCapabilities, position]);

  useEffect(() => {
    if (lenses.length === 0) return;
    if (lenses.some((lens) => lens.id === activeLensId)) return;

    const wide = lenses.find((lens) => lens.type === "wide");
    setActiveLensId(wide?.id ?? lenses[0].id);
  }, [lenses, activeLensId]);

  const activeLens =
    lenses.find((lens) => lens.id === activeLensId) ??
    lenses.find((lens) => lens.type === "wide") ??
    lenses[0];

  const physicalLenses = useMemo(() => getPhysicalLenses(lenses), [lenses]);

  return {
    lenses,
    physicalLenses,
    activeLens,
    activeLensId: activeLens?.id ?? activeLensId,
    setActiveLensId,
    refreshZoomCapabilities,
  };
}
