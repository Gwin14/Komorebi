import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  addCompositionModelStatusListener,
  cancelCompositionModelDownload,
  deleteCompositionModel,
  downloadCompositionModel,
  getCompositionModelStatus,
} from "../../modules/composition-scan";

const unavailable = {
  state: "unsupported",
  modelName: "MiniCPM-V 4.6 Q4_K_M",
  isReady: false,
  isCompatible: false,
  runtimeAvailable: false,
  storageBytes: 0,
};

export default function useCompositionModel() {
  const [status, setStatus] = useState(unavailable);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    if (Platform.OS !== "ios") return;
    console.log("[CompositionScan] JS model-status-request");
    const next = await getCompositionModelStatus();
    if (next) {
      console.log("[CompositionScan] JS model-status", next);
      setStatus(next);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = addCompositionModelStatusListener((next) => {
      console.log("[CompositionScan] JS model-status-event", next);
      setStatus(next);
    });
    return () => subscription.remove();
  }, [refresh]);

  const download = useCallback(async () => {
    setPending(true);
    try {
      console.log("[CompositionScan] JS model-download-request");
      await downloadCompositionModel();
      await refresh();
    } finally {
      setPending(false);
    }
  }, [refresh]);

  const cancelDownload = useCallback(async () => {
    console.log("[CompositionScan] JS model-download-cancel");
    await cancelCompositionModelDownload();
    await refresh();
  }, [refresh]);

  const remove = useCallback(async () => {
    setPending(true);
    try {
      console.log("[CompositionScan] JS model-remove-request");
      await deleteCompositionModel();
      await refresh();
    } finally {
      setPending(false);
    }
  }, [refresh]);

  return { status, pending, download, cancelDownload, remove, refresh };
}
