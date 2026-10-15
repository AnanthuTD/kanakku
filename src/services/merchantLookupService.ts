import {
  automaticMerchantQuery,
  MerchantQueryKind,
  validateVpaQuery,
  sourceMentionsVpa,
  validatePublicBusinessQuery,
  parseMerchantSources,
  MerchantLookupResult,
} from "../domain/merchantLookup";
export interface MerchantSearchTransport {
  search(
    query: string,
    manuallyApproved: boolean,
    kind?: MerchantQueryKind,
  ): Promise<string>;
  cancel(): void | Promise<void>;
}
/** Coalesce only in-flight work. Completed results belong to the active UI, never a reusable cache. */
export function createMerchantLookupService(
  transport: MerchantSearchTransport,
  now = Date.now,
) {
  const pending = new Map<string, Promise<MerchantLookupResult>>();
  let generation = 0;
  let cancellationBarrier: Promise<void> = Promise.resolve();
  return {
    async lookup(
      label: string,
      manuallyApproved = false,
      kind: MerchantQueryKind = "business",
    ): Promise<MerchantLookupResult> {
      if (kind === "vpa" && !manuallyApproved)
        throw new Error(
          "Review the exact UPI ID and approve sending it to Brave first.",
        );
      const query =
        kind === "vpa"
          ? validateVpaQuery(label)
          : manuallyApproved
            ? validatePublicBusinessQuery(label)
            : automaticMerchantQuery(label);
      if (!query)
        throw new Error(
          "Review a public business name before searching. Personal names and payment IDs are never searched automatically.",
        );
      const requestGeneration = generation;
      await cancellationBarrier;
      if (requestGeneration !== generation)
        throw new Error("Merchant lookup cancelled.");
      const key = `${kind}:${query.toLowerCase()}`;
      const inFlight = pending.get(key);
      if (inFlight) return inFlight;
      const request = transport
        .search(query, manuallyApproved, kind)
        .then((raw) => {
          if (generation !== requestGeneration)
            throw new Error("Merchant lookup cancelled.");
          const result: MerchantLookupResult = {
            query,
            kind,
            provider: "brave",
            sources: parseMerchantSources(raw).map((source) =>
              kind === "vpa"
                ? { ...source, mentionsVpa: sourceMentionsVpa(source, query) }
                : source,
            ),
            fetchedAt: now(),
          };
          return result;
        })
        .finally(() => {
          if (generation === requestGeneration) pending.delete(key);
        });
      pending.set(key, request);
      return request;
    },
    clear() {
      generation++;
      pending.clear();
      let cancellation: Promise<void>;
      try {
        cancellation = Promise.resolve(transport.cancel());
      } catch (error) {
        cancellation = Promise.reject(error);
      }
      cancellationBarrier = Promise.all([
        cancellationBarrier.catch(() => {}),
        cancellation,
      ]).then(() => {});
      return cancellationBarrier;
    },
  };
}
