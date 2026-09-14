export const SCAN_RESULT_DURATION = 7500;
export const SCAN_TIMEOUT = 8000;
export const SCAN_ENTER_DURATION = 150;
export const SCAN_EXIT_DURATION = 200;
let sequence = 0;

// Pure controller: no React, pixels, or native imports. Timers and model can be
// substituted in tests without linking the camera or loading fixtures in the app.
export function createCompositionScanSession({ model, generate, onChange, onError, timers = globalThis }) {
  let active = null;
  let timer = null;
  let disposed = false;
  let state = "idle";
  const emit = (next) => {
    state = next.state;
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
    if (old) void release(old.id);
    emit({ state: "idle", scanId: null, result: null, phase: null });
  };
  const fail = (session, error) => {
    if (active !== session || disposed) return;
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
      active = session;
      emit({ state: "capturing", scanId: null, result: null, phase: null });
      timer = timers.setTimeout(() => fail(session, new Error("Scan timed out")), SCAN_TIMEOUT);
      try {
        const armed = await model.arm(session.id);
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
      if (!session || session.id !== scanId || state !== "capturing" || disposed) {
        // Never release an in-flight analysis on a duplicate capture callback.
        if (session?.id !== scanId) await release(scanId);
        return;
      }
      if (!imageToken) { fail(session, new Error("Unable to capture scan frame")); return; }
      emit({ state: "analyzing", scanId: null, result: null, phase: null });
      try {
        const analysis = await model.analyze(imageToken, scanId);
        if (active !== session || disposed) return;
        const result = generate(analysis, session.preview);
        clearTimer();
        if (!result.gizmos.length) { cancel(); return; }
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
