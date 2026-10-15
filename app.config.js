const easProject = require("./eas-project.json");

// Personal and destructive-test builds have separate UIDs and update channels.
const fs = require("fs");
const path = require("path");
// The build profile is persisted to a file so prebuild, Gradle's fingerprint/manifest step and
// `eas update` all resolve the same config even when a step runs without the shell's env.
const profileFile = path.join(__dirname, "kanakku-profile.json");
function resolveProfile() {
  const fromEnv = process.env.KANAKKU_BUILD_PROFILE;
  if (fromEnv === "e2e" || fromEnv === "personal") {
    fs.writeFileSync(profileFile, JSON.stringify({ profile: fromEnv }) + "\n");
    return fromEnv;
  }
  if (fromEnv) throw new Error("KANAKKU_BUILD_PROFILE must be 'e2e' or 'personal'.");
  try {
    const saved = JSON.parse(fs.readFileSync(profileFile, "utf8")).profile;
    if (saved === "e2e" || saved === "personal") return saved;
  } catch {}
  return "personal";
}
module.exports = ({ config }) => {
  const testBuild = resolveProfile() === "e2e";
  // Empty override explicitly disables remote delivery for offline/test builds.
  const projectId = (
    process.env.KANAKKU_EAS_PROJECT_ID ?? easProject.projectId
  )?.trim();
  if (
    projectId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId,
    )
  ) {
    throw new Error(
      "KANAKKU_EAS_PROJECT_ID must be the UUID of your own Expo EAS project.",
    );
  }
  const channel = testBuild ? "e2e" : "personal-beta";
  return {
    ...config,
    owner: easProject.owner,
    slug: easProject.slug,
    ...(testBuild
      ? {
          name: "Kanakku E2E",
          android: { ...config.android, package: "app.tinkerbox.kanakku.e2e" },
        }
      : {}),
    // Native dependency/plugin/model changes need an APK, not an OTA bundle.
    runtimeVersion: { policy: "fingerprint" },
    updates: {
      enabled: !!projectId,
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
      ...(projectId
        ? {
            url: `https://u.expo.dev/${projectId}`,
            requestHeaders: { "expo-channel-name": channel },
          }
        : {}),
    },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),
      kanakkuUpdates: { configured: !!projectId, channel },
    },
  };
};
