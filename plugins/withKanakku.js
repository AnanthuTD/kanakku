const {
  AndroidConfig,
  withAndroidColorsNight,
  withAndroidManifest,
  withAppBuildGradle,
  withGradleProperties,
} = require("expo/config-plugins");
module.exports = function withKanakku(config) {
  config = withGradleProperties(config, (config) => {
    const value = "-Xmx3072m -XX:MaxMetaspaceSize=1536m";
    const existing = config.modResults.find(
      (entry) =>
        entry.type === "property" && entry.key === "org.gradle.jvmargs",
    );
    if (existing) existing.value = value;
    else
      config.modResults.push({
        type: "property",
        key: "org.gradle.jvmargs",
        value,
      });
    return config;
  });
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.$["android:allowBackup"] = "false";
    app.$["android:fullBackupContent"] = "false";
    return config;
  });
  // Keep model files stored uncompressed: the app copies the voice model out
  // once (with a SHA-256 check) and ONNX loads its model directly.
  config = withAppBuildGradle(config, (config) => {
    const marker = "noCompress 'bin', 'onnx'";
    if (!config.modResults.contents.includes(marker))
      config.modResults.contents = config.modResults.contents.replace(
        /androidResources \{\n/,
        (match) => `${match}        ${marker}\n`,
      );
    if (!config.modResults.contents.includes(marker))
      throw new Error("Could not mark Kanakku model assets as uncompressed");
    return config;
  });
  // Expo sets only the light window background from app.json backgroundColor;
  // match the charcoal theme so dark launches never flash ivory after the splash.
  return withAndroidColorsNight(config, (config) => {
    config.modResults = AndroidConfig.Colors.assignColorValue(
      config.modResults,
      { name: "activityBackground", value: "#141C18" },
    );
    return config;
  });
};
