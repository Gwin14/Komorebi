const parseStoredBoolean = (value, fallback = false) => {
  if (value === null || value === undefined) return Boolean(fallback);
  return value === "true";
};

const restoreIntelligentPreferences = (
  { tags = null, filename = null } = {},
  defaults = {},
) => ({
  intelligentTagsEnabled: parseStoredBoolean(
    tags,
    defaults.intelligentTagsEnabled,
  ),
  intelligentFilenameEnabled: parseStoredBoolean(
    filename,
    defaults.intelligentFilenameEnabled,
  ),
});

module.exports = { restoreIntelligentPreferences };
