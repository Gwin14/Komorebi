const CAPTURE_TIMER_OPTIONS = [
  { seconds: 0, label: "Desligado" },
  { seconds: 3, label: "3 seg" },
  { seconds: 10, label: "10 seg" },
];

const normalizeCaptureTimer = (value) => {
  const seconds = Number(value);
  return seconds === 3 || seconds === 10 ? seconds : 0;
};

// Use a deadline so delayed JS ticks do not extend the selected duration.
function createCaptureCountdown(seconds, onTick) {
  let timeout;
  let settled = false;
  let resolve;
  const finished = new Promise((done) => { resolve = done; });
  const deadline = Date.now() + normalizeCaptureTimer(seconds) * 1000;
  const finish = (completed) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    onTick(0);
    resolve(completed);
  };
  const tick = () => {
    if (settled) return;
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (!remaining) return finish(true);
    onTick(remaining);
    timeout = setTimeout(tick, Math.min(1000, deadline - Date.now()));
  };
  tick();
  return { finished, cancel: () => finish(false) };
}

module.exports = {
  CAPTURE_TIMER_OPTIONS,
  normalizeCaptureTimer,
  createCaptureCountdown,
};
