export const SCAN_POST_ZOOM_DURATION = 1500;
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
  getAnalysisContext = () => ({ recentAdvice: [] }),
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
    emit({ state: "idle", scanId: null, trackingScanId: null, result: null, phase: null });
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
    completeZoom() {
      const session = active;
      if (!session || state !== "showing-results" || session.zoomCompleted || disposed) return false;
      session.zoomCompleted = true;
      clearTimer();
      timer = timers.setTimeout(() => {
        if (active !== session) return;
        emit({ state: "showing-results", scanId: null, trackingScanId: session.id, result: session.result, phase: "leaving" });
        timer = timers.setTimeout(cancel, SCAN_EXIT_DURATION);
      }, SCAN_POST_ZOOM_DURATION);
      return true;
    },
    async start(preview) {
      if (disposed || state === "capturing" || state === "analyzing") return false;
      cancel();
      const session = {
        id: `scan-${Date.now()}-${++sequence}`,
        preview,
        analysisContext: getAnalysisContext(),
      };
      log("start", { scanId: session.id, preview });
      active = session;
      emit({ state: "capturing", scanId: null, trackingScanId: null, result: null, phase: null });
      timer = timers.setTimeout(() => fail(session, new Error("Scan timed out")), SCAN_TIMEOUT);
      try {
        const armed = await model.arm(session.id);
        log("arm-result", { scanId: session.id, armed });
        if (active !== session || disposed) {
          await release(session.id);
          return false;
        }
        if (!armed) throw new Error("Scan worker unavailable or still stopping");
        emit({ state: "capturing", scanId: session.id, trackingScanId: null, result: null, phase: null });
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
      emit({ state: "analyzing", scanId: null, trackingScanId: scanId, result: null, phase: null });
      try {
        const analysisStartedAt = Date.now();
        const analysis = await model.analyze(imageToken, scanId, session.analysisContext);
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
        const result = generate(analysis, session.preview, session.analysisContext);
        session.result = result;
        log("advice-result", { scanId, result });
        clearTimer();
        emit({ state: "showing-results", scanId: null, trackingScanId: scanId, result, phase: "entering" });
        timer = timers.setTimeout(() => {
          if (active !== session) return;
          emit({ state: "showing-results", scanId: null, trackingScanId: scanId, result, phase: "visible" });
          timer = null;
        }, SCAN_ENTER_DURATION);
      } catch (error) { fail(session, error); }
    },
  };
}
