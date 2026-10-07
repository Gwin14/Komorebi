const VERTICAL_GESTURE_OPTIONS = [
  { id: "off", label: "Desativado" },
  { id: "luts", label: "LUTs" },
  { id: "manual", label: "Manual", iosOnly: true },
  { id: "bulb", label: "Bulb", iosOnly: true },
  { id: "motionBlur", label: "Motion Blur", iosOnly: true },
  { id: "focusBracketing", label: "Focus Bracketing", iosOnly: true },
  { id: "doubleExposure", label: "Dupla exposição", iosOnly: true },
];
const HORIZONTAL_GESTURE_OPTIONS = [
  { id: "off", label: "Desativado" },
  { id: "luts", label: "LUTs" },
  { id: "halation", label: "Halation" },
  { id: "grain", label: "Grão" },
];
const VOLUME_ACTION_OPTIONS = [
  { id: "capture", label: "Tirar foto", description: "Usa o timer geral da câmera." },
  { id: "capture3", label: "Foto com timer de 3s" },
  { id: "capture10", label: "Foto com timer de 10s" },
  ...[
    ["luts", "LUT"], ["halation", "Halation"],
    ["grain", "Grão"], ["lens", "lente física"],
  ].flatMap(([id, label]) => [
    { id: `${id}Next`, label: id === "lens" ? "Próxima lente física" : `${label} seguinte` },
    { id: `${id}Previous`, label: id === "lens" ? "Lente física anterior" : `${label} anterior` },
  ]),
];
const DEFAULT_CONTROL_GESTURES = {
  vertical: "luts", horizontal: "off", volumeUp: "capture", volumeDown: "capture",
};
function normalizeControlGestures(value) {
  const options = {
    vertical: VERTICAL_GESTURE_OPTIONS, horizontal: HORIZONTAL_GESTURE_OPTIONS,
    volumeUp: VOLUME_ACTION_OPTIONS, volumeDown: VOLUME_ACTION_OPTIONS,
  };
  return Object.fromEntries(Object.entries(options).map(([key, catalog]) => [
    key, catalog.some(({ id }) => id === value?.[key])
      ? value[key] : DEFAULT_CONTROL_GESTURES[key],
  ]));
}
function cycleOption(options, currentId, direction) {
  if (!options.length) return null;
  const index = options.findIndex(({ id }) => id === currentId);
  // A removed imported LUT has no position; resume at the no-effect entry.
  if (index < 0) return options[0];
  return options[(index + direction + options.length) % options.length];
}
function getPhysicalLenses(lenses) {
  const unique = new Map();
  for (const lens of lenses) {
    const physical = lens.source === "physical" ||
      (!lens.source && lens.device?.physicalDevices?.length === 1);
    if (physical && !unique.has(lens.device.id)) unique.set(lens.device.id, lens);
  }
  return [...unique.values()].sort((a, b) => a.order - b.order);
}

// State is read at dispatch time. The camera's existing handlers own capture
// locks, compatibility rules and native session transitions.
async function executeCameraShortcut(action, direction, state) {
  if (action === "off" || !state.active) return;
  if (action.startsWith("capture")) {
    const seconds = action === "capture3" ? 3 : action === "capture10" ? 10 : undefined;
    return state.capture({ seconds });
  }
  if (state.busy) return;
  if (action === "lutsPanel") {
    state.setActiveControl((current) => direction > 0 ? "lut" : current === "lut" ? "none" : current);
    return;
  }
  if (action === "manual") {
    const enabled = state.manual.manualMode === "manual";
    if (direction > 0 && (!state.manual.available || state.stacking.enabled)) {
      state.notice("Manual indisponível neste modo ou lente.");
      return;
    }
    if (enabled === (direction > 0)) return;
    state.manual.toggleManualMode();
    state.setActiveControl(direction > 0 ? "manual" : "none");
    state.notice(direction > 0 ? "Modo manual ativado" : "Modo manual desativado");
    return;
  }
  const strategy = VERTICAL_GESTURE_OPTIONS.find(({ id, iosOnly }) => iosOnly && id === action);
  if (strategy) {
    if (direction < 0 && state.stacking.strategyId !== action) return;
    if (direction > 0 && state.stacking.strategyId === action) return;
    if (direction > 0 && !state.stacking.capabilities?.supportedStrategies.includes(action)) {
      state.notice("Modo indisponível nesta lente.");
      return;
    }
    await state.selectStacking(direction > 0 ? action : null);
    state.notice(direction > 0 ? `${strategy.label} ativado` : `${strategy.label} desativado`);
    return;
  }
  const target = state.targets[action];
  if (!target?.options.length) return;
  const selected = cycleOption(target.options, target.currentId, direction);
  if (selected.id === target.currentId) return;
  target.select(selected.id);
  state.notice(`${target.label}: ${selected.name ?? selected.label}`);
}
module.exports = {
  VERTICAL_GESTURE_OPTIONS, HORIZONTAL_GESTURE_OPTIONS, VOLUME_ACTION_OPTIONS,
  DEFAULT_CONTROL_GESTURES, normalizeControlGestures, cycleOption,
  getPhysicalLenses, executeCameraShortcut,
};
