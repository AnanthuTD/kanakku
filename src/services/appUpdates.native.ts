import * as Updates from "expo-updates";
import Constants from "expo-constants";
import { AppUpdatesController } from "./appUpdatesController";

const configured =
  Constants.expoConfig?.extra?.kanakkuUpdates?.configured === true;
const unavailableReason = !configured
  ? "Update delivery has not been connected for this build. Install a new APK after the owner configures the Expo update project."
  : !Updates.isEnabled
    ? "Updates are unavailable in this build. Use an update-enabled release APK; development builds and Expo Go cannot install these updates."
    : undefined;

export const appUpdates = new AppUpdatesController({
  unavailableReason,
  pending: false,
  check: async () => {
    const result = await Updates.checkForUpdateAsync();
    return {
      available: result.isAvailable || result.isRollBackToEmbedded === true,
    };
  },
  download: async () => {
    const result = await Updates.fetchUpdateAsync();
    return { ready: result.isNew || result.isRollBackToEmbedded === true };
  },
  reload: () => Updates.reloadAsync(),
});
export const appUpdateInfo = {
  channel: Updates.channel,
  runtime: Updates.runtimeVersion,
  embedded: Updates.isEmbeddedLaunch,
};
export function useAppUpdatePending() {
  return Updates.useUpdates().isUpdatePending;
}
