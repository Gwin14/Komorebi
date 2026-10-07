import { useLocalSearchParams } from "expo-router";
import Settings, { SETTINGS_PAGES } from "./Settings";

const VALID_SECTIONS = new Set([
  SETTINGS_PAGES.CAMERA,
  SETTINGS_PAGES.PREVIEWS,
  SETTINGS_PAGES.CAPTURE,
  SETTINGS_PAGES.INTELLIGENCE,
  SETTINGS_PAGES.CONTROLS,
  SETTINGS_PAGES.GESTURES,
  SETTINGS_PAGES.LUTS,
  SETTINGS_PAGES.ABOUT,
]);

export default function SettingsSection() {
  const { section, control } = useLocalSearchParams();
  const requestedSection = Array.isArray(section) ? section[0] : section;
  const initialPage = VALID_SECTIONS.has(requestedSection)
    ? requestedSection
    : SETTINGS_PAGES.ROOT;

  const gestureField = Array.isArray(control) ? control[0] : control;
  return <Settings initialPage={initialPage} gestureField={gestureField} />;
}
