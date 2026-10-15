/** A deliberately small public-brand allowlist. Unknown labels need a reviewed query. */
const publicBrands = [
  "Netflix",
  "Spotify",
  "Adobe",
  "Canva",
  "Microsoft",
  "Google",
  "Apple",
  "YouTube",
  "Disney Hotstar",
  "Prime Video",
  "Amazon",
  "Flipkart",
  "Myntra",
  "Swiggy",
  "Zomato",
  "Blinkit",
  "Zepto",
  "BigBasket",
  "Uber",
  "Ola",
  "Rapido",
  "IRCTC",
  "Airtel",
  "Jio",
  "ACT Fibernet",
  "Notion",
  "OpenAI",
  "Anthropic",
] as const;
export function automaticMerchantQuery(label: string): string | null {
  const normalized = label
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return (
    publicBrands.find((brand) => brand.toLowerCase() === normalized) ?? null
  );
}
export function validatePublicBusinessQuery(value: string): string {
  const label = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (
    label.length < 2 ||
    label.length > 64 ||
    !/^[\p{L} &'.()-]+$/u.test(label)
  )
    throw new Error(
      "Enter only a public business name, without payment IDs, numbers, email, or SMS text.",
    );
  if (
    /\b(?:upi|utr|ifsc|account|credited|debited|received|paid|payment|balance|card|rs|inr|otp)\b/i.test(
      label,
    )
  )
    throw new Error(
      "Use a public business name rather than a payment description.",
    );
  return label;
}
export type MerchantQueryKind = "business" | "vpa";
/** A single reviewed address only: no SMS extraction, Unicode folding or query operators. */
export function validateVpaQuery(value: string): string {
  const vpa = value.trim();
  if (
    vpa.length > 164 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(vpa)
  )
    throw new Error(
      "Enter one complete UPI ID (VPA), such as shop@bank, without SMS text or other payment details.",
    );
  return vpa.toLowerCase();
}
/** Exact token evidence, never a claim that a source owns or received the payment. */
export function sourceMentionsVpa(
  source: MerchantSource,
  vpa: string,
): boolean {
  const escaped = validateVpaQuery(vpa).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const token = new RegExp(
    `(^|[^a-z0-9._@-])${escaped}(?=$|[^a-z0-9._@-]|\\.(?=\\s|$))`,
    "i",
  );
  // Addresses in URL query strings are not ownership evidence. Only displayed excerpts count.
  return token.test(
    `${source.title} ${source.description} ${(source.extraSnippets ?? []).join(" ")}`,
  );
}
export interface MerchantSource {
  title: string;
  url: string;
  description: string;
  extraSnippets?: string[];
  mentionsVpa?: boolean;
}
export interface MerchantLookupResult {
  query: string;
  provider: "brave";
  kind?: MerchantQueryKind;
  sources: MerchantSource[];
  fetchedAt: number;
}
export interface MerchantLookupPreferences {
  enabled: boolean;
  automatic: boolean;
  hasKey: boolean;
  dailyUsed: number;
  monthlyUsed: number;
  dailyLimit: number;
  monthlyLimit: number;
}
export const disabledMerchantLookup: MerchantLookupPreferences = {
  enabled: false,
  automatic: false,
  hasKey: false,
  dailyUsed: 0,
  monthlyUsed: 0,
  dailyLimit: 20,
  monthlyLimit: 300,
};
/** Search evidence is untrusted; it is displayed for review and never mutates the ledger. */
export function parseMerchantSources(raw: string): MerchantSource[] {
  const value = JSON.parse(raw) as { sources?: unknown };
  if (!Array.isArray(value.sources))
    throw new Error("Unexpected search response.");
  return value.sources.slice(0, 5).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    if (typeof source.url !== "string" || typeof source.title !== "string")
      return [];
    try {
      const url = new URL(source.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !url.hostname.includes(".")
      )
        return [];
      return [
        {
          url: url.href,
          title: source.title.replace(/<[^>]*>/g, "").slice(0, 180),
          description:
            typeof source.description === "string"
              ? source.description.replace(/<[^>]*>/g, "").slice(0, 500)
              : "",
          extraSnippets: Array.isArray(source.extraSnippets)
            ? source.extraSnippets
                .slice(0, 3)
                .filter(
                  (snippet): snippet is string => typeof snippet === "string",
                )
                .map((snippet) => snippet.replace(/<[^>]*>/g, "").slice(0, 500))
            : [],
        },
      ];
    } catch {
      return [];
    }
  });
}
