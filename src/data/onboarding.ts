import AsyncStorage from "@react-native-async-storage/async-storage";

/** Set once the first-run flow was finished or skipped; it never shows again after that. */
export const ONBOARDED_KEY = "kanakku-onboarded-v1";
export const markOnboarded = () =>
  AsyncStorage.setItem(ONBOARDED_KEY, "1").catch(() => undefined);
export const wasOnboarded = () =>
  AsyncStorage.getItem(ONBOARDED_KEY).then(
    (value) => value === "1",
    () => true,
  );
