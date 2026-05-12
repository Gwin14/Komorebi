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

export function usePhysicalCameraDevices(facing = "back") {
  const devices = useCameraDevices();
  const [activeLensId, setActiveLensId] = useState(null);

  const lenses = useMemo(() => {
    const position = facing === "back" ? "back" : "front";

    const physicalLenses = Array.from(
      new Map(
        devices
          .filter(
            (device) =>
              device.position === position &&
              device.physicalDevices?.length === 1 &&
              PHYSICAL_DEVICE_META[device.physicalDevices[0]],
          )
          .map((device) => {
            const physicalDeviceType = device.physicalDevices[0];
            const meta = PHYSICAL_DEVICE_META[physicalDeviceType];

            return [
              meta.type,
              {
                id: meta.id,
                label: meta.label,
                type: meta.type,
                device,
                order: meta.order,
              },
            ];
          }),
      ).values(),
    ).sort((a, b) => a.order - b.order);

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

  const activeLens = lenses.find((lens) => lens.id === activeLensId) ?? lenses[0];

  return {
    lenses,
    activeLens,
    activeLensId,
    setActiveLensId,
  };
}
