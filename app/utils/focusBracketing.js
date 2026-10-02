const MIN_FOCUS_FRAMES = 3;
const MAX_FOCUS_FRAMES = 20;
const DEFAULT_FOCUS_FRAMES = 10;

function isFocusRangeValid({ nearLensPosition, farLensPosition, frameCount }) {
  return Number.isFinite(nearLensPosition) && Number.isFinite(farLensPosition) &&
    nearLensPosition >= 0 && farLensPosition <= 1 && nearLensPosition < farLensPosition &&
    Number.isInteger(frameCount) && frameCount >= MIN_FOCUS_FRAMES && frameCount <= MAX_FOCUS_FRAMES;
}

function focusPositions(config) {
  if (!isFocusRangeValid(config)) throw new Error('Marque um limite próximo menor que o distante e escolha de 3 a 20 fotos.');
  const { nearLensPosition, farLensPosition, frameCount } = config;
  return Array.from({ length: frameCount }, (_, i) => i === frameCount - 1
    ? farLensPosition : nearLensPosition + i * (farLensPosition - nearLensPosition) / (frameCount - 1));
}

// One native adjustment at a time; dragging replaces only the queued value.
// Invalidating discards queued work and suppresses callbacks from an old lens.
function createFocusScheduler(apply, onConfirmed, onError, onPending) {
  let generation = 0;
  let pending = null;
  let running = false;
  async function drain() {
    if (running) return;
    running = true;
    while (pending) {
      const request = pending;
      pending = null;
      try {
        const position = await apply(request.value);
        if (request.generation === generation && !pending) onConfirmed(position);
      } catch (error) {
        if (request.generation === generation && !pending) onError(error);
      }
    }
    running = false;
    onPending(false);
  }
  return {
    request(value) {
      pending = { value, generation };
      onPending(true);
      void drain();
    },
    invalidate() {
      generation += 1;
      pending = null;
      onPending(false);
    },
  };
}

function stackingMetadataFields(value) {
  if (!value) return undefined;
  return Object.fromEntries(Object.entries({
    engineVersion: 1,
    strategyId: value.strategyId,
    capturedFrames: value.capturedFrames,
    acceptedFrames: value.acceptedFrames,
    rejectedFrames: value.rejectedFrames,
    durationSeconds: value.durationSeconds,
    degraded: value.degraded,
    focusBracketing: value.focusBracketing ?? undefined,
  }).filter(([, field]) => field !== undefined));
}

module.exports = { MIN_FOCUS_FRAMES, MAX_FOCUS_FRAMES, DEFAULT_FOCUS_FRAMES,
  isFocusRangeValid, focusPositions, createFocusScheduler, stackingMetadataFields };
