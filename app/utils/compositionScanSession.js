export const SCAN_RESULT_DURATION = 7500;
// Cold-loading a 1.3B local vision model can take tens of seconds. The
// timeout prevents a wedged native inference without penalizing normal cold starts.
export const SCAN_TIMEOUT = 120000;
export const SCAN_ENTER_DURATION = 150;
export const SCAN_EXIT_DURATION = 200;
let sequence = 0;

// Pure controller: no React, pixels, or native imports. Timers and model can be
// substituted in tests without linking the camera or loading fixtures in the app.
export function createCompositionScanSession({
  model,
  generate,
  onChange,
  onError,
  timers = globalThis,
  log = () => {},
}) {
  let active = null;
  let timer = null;
  let disposed = false;
  let state = "idle";
  const emit = (next) => {
    state = next.state;
    log("state", { state: next.state, phase: next.phase, hasResult: Boolean(next.result) });
    if (!disposed) onChange(next);
  };
  const clearTimer = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };
  const release = (id) => Promise.resolve(model.cancel(id)).catch(() => {});
  const cancel = () => {
    clearTimer();
    const old = active;
    active = null;
    if (old) {
      log("cancel", { scanId: old.id, previousState: state });
      void release(old.id);
    }
    emit({ state: "idle", scanId: null, result: null, phase: null });
  };
  const fail = (session, error) => {
    if (active !== session || disposed) return;
    log("failed", { scanId: session.id, message: error?.message ?? String(error) });
    cancel();
    onError?.(error);
  };
  return {
    cancel,
    dispose() { disposed = true; cancel(); },
    async start(preview) {
      if (disposed || state === "capturing" || state === "analyzing") return false;
      cancel();
      const session = { id: `scan-${Date.now()}-${++sequence}`, preview };
      log("start", { scanId: session.id, preview });
      active = session;
      emit({ state: "capturing", scanId: null, result: null, phase: null });
      timer = timers.setTimeout(() => fail(session, new Error("Scan timed out")), SCAN_TIMEOUT);
      try {
        const armed = await model.arm(session.id);
        log("arm-result", { scanId: session.id, armed });
        if (active !== session || disposed) {
          await release(session.id);
          return false;
        }
        if (!armed) throw new Error("Scan worker unavailable or still stopping");
        emit({ state: "capturing", scanId: session.id, result: null, phase: null });
        return true;
      } catch (error) {
        fail(session, error);
        return false;
      }
    },
    async captured(imageToken, scanId) {
      const session = active;
      log("capture-callback", {
        scanId,
        matchesActive: session?.id === scanId,
        hasToken: Boolean(imageToken),
        state,
      });
      if (!session || session.id !== scanId || state !== "capturing" || disposed) {
        // Never release an in-flight analysis on a duplicate capture callback.
        if (session?.id !== scanId) await release(scanId);
        return;
      }
      if (!imageToken) { fail(session, new Error("Unable to capture scan frame")); return; }
      emit({ state: "analyzing", scanId: null, result: null, phase: null });
      try {
        const analysisStartedAt = Date.now();
        const analysis = await model.analyze(imageToken, scanId);
        log("analysis-result", {
          scanId,
          elapsedMs: Date.now() - analysisStartedAt,
          people: analysis?.people?.length ?? 0,
          faces: analysis?.faces?.length ?? 0,
          subjects: analysis?.subjects?.length ?? 0,
          rectangles: analysis?.rectangles?.length ?? 0,
          horizon: analysis?.horizon ?? null,
          judgement: analysis?.judgement ?? null,
        });
        if (active !== session || disposed) return;
        const result = generate(analysis, session.preview);
        log("advice-result", { scanId, result });
        clearTimer();
        emit({ state: "showing-results", scanId: null, result, phase: "entering" });
        timer = timers.setTimeout(() => {
          if (active !== session) return;
          emit({ state: "showing-results", scanId: null, result, phase: "visible" });
          timer = timers.setTimeout(() => {
            if (active !== session) return;
            emit({ state: "showing-results", scanId: null, result, phase: "leaving" });
            timer = timers.setTimeout(cancel, SCAN_EXIT_DURATION);
          }, SCAN_RESULT_DURATION);
        }, SCAN_ENTER_DURATION);
      } catch (error) { fail(session, error); }
    },
  };
}
