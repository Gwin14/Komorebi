import { useEffect, useMemo, useState } from "react";
import { useCameraDevices } from "react-native-vision-camera";

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

const getDevicePreferenceScore = (device) => {
  const name = String(device.name ?? "").toLowerCase();
  let score = 0;

  if (name.includes("lidar") || name.includes("depth")) score -= 1_000_000;
  if (name.includes("wide")) score += 10_000;
  if (device.hasFlash) score += 500;
  if (device.supportsFocus) score += 250;
  if (device.supportsRawCapture) score += 100;

  score += getMaxResolution(device, "photoWidth", "photoHeight") / 1_000_000;
  score += getMaxResolution(device, "videoWidth", "videoHeight") / 2_000_000;

  return score;
};

export function usePhysicalCameraDevices(facing = "back") {
  const devices = useCameraDevices();
  const [activeLensId, setActiveLensId] = useState(null);

  const lenses = useMemo(() => {
    const position = facing === "back" ? "back" : "front";

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

    if (physicalLenses.length > 0) {
      return physicalLenses;
    }

    return devices
      .filter((device) => device.position === position)
      .map((device, index) => ({
        id: device.id,
        label: "1",
        type: "unknown",
        device,
        order: index + 10,
      }));
  }, [devices, facing]);

  useEffect(() => {
    if (lenses.length === 0) return;
    if (lenses.some((lens) => lens.id === activeLensId)) return;

    const wide = lenses.find((lens) => lens.type === "wide");
    setActiveLensId(wide?.id ?? lenses[0].id);
  }, [lenses, activeLensId]);

  const activeLens =
    lenses.find((lens) => lens.id === activeLensId) ?? lenses[0];

  return {
    lenses,
    activeLens,
    activeLensId,
    setActiveLensId,
  };
}
