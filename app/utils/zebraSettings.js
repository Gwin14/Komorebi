const parseStoredBoolean = (value, fallback = false) => {
  if (value === null || value === undefined) return Boolean(fallback);
  return value === "true";
};

const restoreZebraPreferences = (
  { highlights = null, shadows = null } = {},
  defaults = {},
) => ({
  zebraHighlightsEnabled: parseStoredBoolean(
    highlights,
    defaults.zebraHighlightsEnabled,
  ),
  zebraShadowsEnabled: parseStoredBoolean(
    shadows,
    defaults.zebraShadowsEnabled,
  ),
});

module.exports = { restoreZebraPreferences };
