// DeviceMotion has one global sampling interval. Keep the fastest consumer's
// interval until that consumer leaves, without duplicating native listeners.
function createMotionSubscriptions(sensor, appState) {
  const consumers = new Map();
  let motionSubscription = null;
  let stateSubscription = null;
  let interval = null;

  function reconcile() {
    if (!consumers.size || appState.currentState !== "active") {
      motionSubscription?.remove();
      motionSubscription = null;
      interval = null;
      return;
    }
    const nextInterval = Math.min(...consumers.values());
    if (nextInterval !== interval) {
      sensor.setUpdateInterval(nextInterval);
      interval = nextInterval;
    }
    if (!motionSubscription) {
      motionSubscription = sensor.addListener((measurement) => {
        for (const callback of consumers.keys()) callback(measurement);
      });
    }
  }

  return (callback, intervalMs) => {
    consumers.set(callback, intervalMs);
    if (!stateSubscription) {
      stateSubscription = appState.addEventListener("change", reconcile);
    }
    reconcile();
    return () => {
      consumers.delete(callback);
      reconcile();
      if (!consumers.size) {
        stateSubscription?.remove();
        stateSubscription = null;
      }
    };
  };
}

module.exports = { createMotionSubscriptions };
