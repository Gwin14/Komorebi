import { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import ManualControlDial from "./ManualControlDial";
import ExposureSlider from "./ExposureSlider";
import exposureStyles from "./ExposureSlider.styles";
import styles from "./ManualControlsPanel.styles";

const TABS = [
  { id: "ev", label: "EV" },
  { id: "iso", label: "ISO" },
  { id: "shutter", label: "SS" },
  { id: "wb", label: "WB" },
  { id: "focus", label: "AF" },
];

const DEFAULT_ISO_RANGE = { min: 50, max: 3200 };
const DEFAULT_SHUTTER_RANGE = { minSeconds: 1 / 4000, maxSeconds: 1 };
const DEFAULT_WB_RANGE = { minKelvin: 2500, maxKelvin: 8000 };

const DEFAULT_ISO = 100;
const DEFAULT_SHUTTER_SECONDS = 1 / 125;
const DEFAULT_WB_KELVIN = 5500;
const DEFAULT_FOCUS = 0.5;

function formatShutter(seconds) {
  if (seconds >= 1) return `${seconds.toFixed(1)}s`;
  return `1/${Math.round(1 / seconds)}s`;
}

export default function ManualControlsPanel({
  manual,
  topBarBelow,
  // EV props (passados quando manualMode === "manual")
  exposure,
  setExposure,
}) {
  const [activeTab, setActiveTab] = useState("ev");
  const { width } = useWindowDimensions();
  const sliderWidth = Math.max(100, width - 180);
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

  // Quando sai do modo manual, volta para a aba EV
  // (o componente é desmontado/montado, então o useState já reseta)

  return (
    <View style={styles.container}>
      <View
        style={[
          exposureStyles.container,
          topBarBelow && { marginVertical: -5 },
        ]}
      >
        {/* Reserva o mesmo espaço do valor do slider para alinhar as réguas. */}
        {!topBarBelow && (
          <Text
            accessible={false}
            style={[exposureStyles.exposureText, styles.labelSpacer]}
          >
            EV
          </Text>
        )}
        <ManualControlDial
          options={TABS}
          selectedId={activeTab}
          onSelect={setActiveTab}
        />
        {topBarBelow && (
          <Text
            accessible={false}
            style={[
              exposureStyles.exposureText,
              exposureStyles.exposureTextBelow,
              styles.labelSpacer,
            ]}
          >
            EV
          </Text>
        )}
      </View>

      <View style={styles.slider}>
        {activeTab === "ev" && (
          <ExposureSlider
            dialWidth={sliderWidth}
            exposure={exposure}
            setExposure={setExposure}
            topBarBelow={topBarBelow}
          />
        )}

        {activeTab === "iso" && (
          <ExposureSlider
            dialWidth={sliderWidth}
            exposure={manual.manualISO}
            setExposure={manual.setISO}
            minExposure={isoRange.min}
            maxExposure={isoRange.max}
            resetValue={DEFAULT_ISO}
            topBarBelow={topBarBelow}
            formatLabel={(v) => `ISO ${Math.round(v)}`}
            isAuto={manual.isoAuto}
            onReset={manual.resetISOToAuto}
          />
        )}

        {activeTab === "shutter" && (
          <ExposureSlider
            dialWidth={sliderWidth}
            exposure={manual.manualShutterSeconds}
            setExposure={manual.setShutterSeconds}
            minExposure={shutterRange.minSeconds}
            maxExposure={shutterRange.maxSeconds}
            resetValue={DEFAULT_SHUTTER_SECONDS}
            topBarBelow={topBarBelow}
            formatLabel={formatShutter}
            isAuto={manual.shutterAuto}
            onReset={manual.resetShutterToAuto}
          />
        )}

        {activeTab === "wb" && (
          <ExposureSlider
            dialWidth={sliderWidth}
            exposure={manual.manualWBKelvin}
            setExposure={manual.setWBKelvin}
            minExposure={DEFAULT_WB_RANGE.minKelvin}
            maxExposure={DEFAULT_WB_RANGE.maxKelvin}
            resetValue={DEFAULT_WB_KELVIN}
            topBarBelow={topBarBelow}
            formatLabel={(v) => `${Math.round(v)}K`}
            isAuto={manual.wbAuto}
            onReset={manual.resetWBToAuto}
          />
        )}

        {activeTab === "focus" && (
          <ExposureSlider
            dialWidth={sliderWidth}
            exposure={manual.manualFocus}
            setExposure={manual.setFocus}
            minExposure={0}
            maxExposure={1}
            resetValue={DEFAULT_FOCUS}
            topBarBelow={topBarBelow}
            formatLabel={(v) => `Foco ${v.toFixed(2)}`}
            isAuto={manual.focusAuto}
            onReset={manual.resetFocusToAuto}
          />
        )}
      </View>
    </View>
  );
}
