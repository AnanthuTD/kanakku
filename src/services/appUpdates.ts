import { AppUpdatesController } from "./appUpdatesController";

// Web does not receive native OTA bundles. Never simulate a successful check.
export const appUpdates = new AppUpdatesController({
  unavailableReason:
    "In-app updates are available in the installed Android app. The browser preview does not download app updates.",
  pending: false,
  check: async () => {
    throw new Error("Native updates unavailable");
  },
  download: async () => {
    throw new Error("Native updates unavailable");
  },
  reload: async () => {
    throw new Error("Native updates unavailable");
  },
});
export const appUpdateInfo = { channel: null, runtime: null, embedded: true };
export function useAppUpdatePending() {
  return false;
}
