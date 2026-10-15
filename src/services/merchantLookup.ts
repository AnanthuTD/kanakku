import { native } from "../native/bridge";
import { createMerchantLookupService } from "./merchantLookupService";
export const merchantLookup = createMerchantLookupService({
  async search(query, approved, kind) {
    if (!native)
      throw new Error(
        "Web merchant lookup requires the Android app and your own Brave API key.",
      );
    return native.lookupMerchant(query, approved, kind ?? "business");
  },
  cancel() {
    return native?.cancelMerchantLookup() ?? Promise.resolve();
  },
});
