import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import ManualControlDial from "./ManualControlDial";
import styles from "./ManualControlsPanel.styles";

const TABS = [
  { id: "iso", label: "ISO" },
  { id: "shutter", label: "SS" },
  { id: "wb", label: "WB" },
  { id: "focus", label: "AF" },
];

const DEFAULT_ISO_RANGE = { min: 50, max: 3200 };
const DEFAULT_SHUTTER_RANGE = { minSeconds: 1 / 4000, maxSeconds: 1 };
const DEFAULT_WB_RANGE = { minKelvin: 2500, maxKelvin: 8000 };

function formatShutter(seconds) {
  if (seconds >= 1) return `${seconds.toFixed(1)}s`;
  return `1/${Math.round(1 / seconds)}s`;
}

export default function ManualControlsPanel({ manual }) {
  const [activeTab, setActiveTab] = useState("iso");
  const caps = manual.capabilities;

  const isoRange = caps
    ? { min: caps.minISO, max: caps.maxISO }
    : DEFAULT_ISO_RANGE;
  const shutterRange = caps
    ? {
        minSeconds: caps.minExposureDurationSeconds,
        maxSeconds: caps.maxExposureDurationSeconds,
      }
    : DEFAULT_SHUTTER_RANGE;

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === tab.id && styles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "iso" && (
        <ManualControlDial
          value={manual.manualISO}
          min={isoRange.min}
          max={isoRange.max}
          onChange={manual.setISO}
          formatLabel={(v) => `ISO ${Math.round(v)}`}
        />
      )}

      {activeTab === "shutter" && (
        <ManualControlDial
          value={manual.manualShutterSeconds}
          min={shutterRange.minSeconds}
          max={shutterRange.maxSeconds}
          onChange={manual.setShutterSeconds}
          formatLabel={formatShutter}
        />
      )}

      {activeTab === "wb" && (
        <ManualControlDial
          value={manual.manualWBKelvin}
          min={DEFAULT_WB_RANGE.minKelvin}
          max={DEFAULT_WB_RANGE.maxKelvin}
          onChange={manual.setWBKelvin}
          formatLabel={(v) => `${Math.round(v)}K`}
        />
      )}

      {activeTab === "focus" && (
        <ManualControlDial
          value={manual.manualFocus}
          min={0}
          max={1}
          onChange={manual.setFocus}
          formatLabel={(v) => `Foco ${v.toFixed(2)}`}
        />
      )}
    </View>
  );
}
