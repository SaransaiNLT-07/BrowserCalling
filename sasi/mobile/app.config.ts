import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Saran",
  slug: "Saran",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "Saran",
  userInterfaceStyle: "light",
  ios: {
    icon: "./assets/expo.icon",
    bundleIdentifier: "com.saran2.calls",
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription: "Saran uses the camera during video calls.",
      NSMicrophoneUsageDescription: "Saran uses the microphone during audio and video calls.",
    },
    config: {
      usesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.Saran.calls",
    adaptiveIcon: {
      backgroundColor: "#EFE8DC",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    permissions: [
      "CAMERA",
      "RECORD_AUDIO",
      "MODIFY_AUDIO_SETTINGS",
      "ACCESS_NETWORK_STATE",
      "BLUETOOTH",
      "BLUETOOTH_CONNECT",
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#EFE8DC",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  
  extra: {
    eas: {
      projectId: "58ac3a02-fe60-47f9-af58-3c406b3940c8"
    }
  },
};

export default config;
