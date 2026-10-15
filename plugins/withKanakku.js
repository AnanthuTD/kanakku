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
  // Release signing: when the four KANAKKU_RELEASE_* variables are set (the release workflow
  // sets them from repository secrets), sign release builds with that keystore. Without them a
  // local build keeps the development key, so nothing about signing is stored in the repo.
  config = withAppBuildGradle(config, (config) => {
    const marker = "// kanakku: release signing from environment";
    if (config.modResults.contents.includes(marker)) return config;
    config.modResults.contents = config.modResults.contents
      .replace(
        /signingConfigs \{\n/,
        (match) => `${match}        ${marker}
        release {
            if (System.getenv("KANAKKU_RELEASE_STORE_FILE")) {
                storeFile file(System.getenv("KANAKKU_RELEASE_STORE_FILE"))
                storePassword System.getenv("KANAKKU_RELEASE_STORE_PASSWORD")
                keyAlias System.getenv("KANAKKU_RELEASE_KEY_ALIAS")
                keyPassword System.getenv("KANAKKU_RELEASE_KEY_PASSWORD")
            }
        }
`,
      )
      .replace(
        /release \{\n(\s*\/\/ Caution![^\n]*\n\s*\/\/ see[^\n]*\n)?\s*signingConfig signingConfigs\.debug/,
        `release {
            signingConfig System.getenv("KANAKKU_RELEASE_STORE_FILE") ? signingConfigs.release : signingConfigs.debug`,
      );
    if (
      !/signingConfigs\.release : signingConfigs\.debug/.test(
        config.modResults.contents,
      )
    )
      throw new Error(
        "Could not wire Kanakku release signing into app/build.gradle",
      );
    return config;
  });
  // expo-updates' fingerprint/manifest task declares no source inputs, so Gradle treats it
  // as up to date after native edits and stamps a stale runtime version into the APK; a later
  // `eas update` would then be refused. Never let it be skipped.
  config = withAppBuildGradle(config, (config) => {
    const marker = "// kanakku: always recompute the OTA runtime fingerprint";
    if (!config.modResults.contents.includes(marker))
      config.modResults.contents += `
${marker}
tasks.configureEach { task ->
    if (task.name ==~ /create.*UpdatesResources/) task.outputs.upToDateWhen { false }
}
`;
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
