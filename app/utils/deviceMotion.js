import { DeviceMotion } from "expo-sensors";
import { AppState } from "react-native";
import { createMotionSubscriptions } from "./motionSubscriptions";

export const subscribeDeviceMotion = createMotionSubscriptions(DeviceMotion, AppState);
