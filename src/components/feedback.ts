import * as Haptics from "expo-haptics";
import { native } from "../native/bridge";
export function tapFeedback() {
  Haptics.selectionAsync().catch(() => {});
  native?.tapSound().catch(() => {});
}
export function successFeedback() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
}
