import { describe, expect, it } from "vitest";
import {
  automaticMerchantQuery,
  validatePublicBusinessQuery,
  parseMerchantSources,
  validateVpaQuery,
  sourceMentionsVpa,
} from "./merchantLookup";
import { createMerchantLookupService } from "../services/merchantLookupService";
const response = JSON.stringify({
  sources: [
    { title: "Netflix", url: "https://netflix.com/", description: "Streaming" },
  ],
});
describe("merchant lookup privacy and evidence", () => {
  it("automatically sends only an exact recognized public brand", () => {
    expect(automaticMerchantQuery(" NETFLIX ")).toBe("Netflix");
    for (const label of [
      "Rahul S",
      "netflix.rahul@upi",
      "Netflix Rahul",
      "Netflix 12345",
      "Received INR Netflix",
      "Lakshmi Stores",
      "APOLLO/ABC/123",
    ])
      expect(automaticMerchantQuery(label)).toBeNull();
  });
  it("rejects identifiers and SMS fragments even with manual query approval", () => {
    for (const value of [
      "rahul@oksbi",
      "Acme 9123456789",
      "INR paid Netflix",
      "credited to Acme",
      "UPI Netflix",
      "https://merchant.com",
    ])
      expect(() => validatePublicBusinessQuery(value)).toThrow();
    expect(validatePublicBusinessQuery("Acme Café Pvt. Ltd.")).toBe(
      "Acme Café Pvt. Ltd.",
    );
  });
  it("discards unsafe URLs and sanitizes untrusted visible snippets", () => {
    const sources = parseMerchantSources(
      JSON.stringify({
        sources: [
          { title: "x", url: "javascript:alert(1)" },
          { title: "x", url: "https://a:b@evil.com" },
          {
            title: "<b>Acme</b>",
            url: "https://acme.com",
            description: "<script>bad</script>Nice",
          },
        ],
      }),
    );
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe("Acme");
  });
  it("deduplicates concurrent queries without transmitting transaction fields", async () => {
    const calls: unknown[] = [];
    const service = createMerchantLookupService({
      search: async (...args) => {
        calls.push(args);
        return response;
      },
      cancel: () => {},
    });
    const [a, b] = await Promise.all([
      service.lookup("Netflix"),
      service.lookup("netflix"),
    ]);
    expect(a).toEqual(b);
    expect(calls).toEqual([["Netflix", false, "business"]]);
    await expect(service.lookup("Rahul")).rejects.toThrow(
      "Review a public business",
    );
    expect(calls).toHaveLength(1);
  });
  it("never retains completed results and rejects late responses after clearing", async () => {
    let time = 1,
      calls = 0,
      resolve: (value: string) => void = () => {};
    let delayed = false;
    const service = createMerchantLookupService(
      {
        search: async () => {
          calls++;
          return delayed
            ? new Promise<string>((r) => {
                resolve = r;
              })
            : response;
        },
        cancel: () => {},
      },
      () => time,
    );
    await service.lookup("Netflix");
    time += 1;
    await service.lookup("Netflix");
    expect(calls).toBe(2);
    delayed = true;
    const request = service.lookup("Spotify");
    service.clear();
    resolve(response);
    await expect(request).rejects.toThrow("cancelled");
  });
});

describe("merchant lookup cancellation ordering", () => {
  it("waits for native cancellation before starting replacement work", async () => {
    let finishCancel: () => void = () => {};
    const calls: string[] = [];
    const service = createMerchantLookupService({
      search: async (query) => {
        calls.push(query);
        return response;
      },
      cancel: () =>
        new Promise<void>((resolve) => {
          finishCancel = resolve;
        }),
    });
    const cancellation = service.clear();
    const next = service.lookup("Netflix");
    await Promise.resolve();
    expect(calls).toEqual([]);
    finishCancel();
    await cancellation;
    await next;
    expect(calls).toEqual(["Netflix"]);
  });
  it("rejects an obsolete request waiting behind the cancellation barrier", async () => {
    const cancellations: (() => void)[] = [];
    const calls: string[] = [];
    const service = createMerchantLookupService({
      search: async (query) => {
        calls.push(query);
        return response;
      },
      cancel: () => new Promise<void>((resolve) => cancellations.push(resolve)),
    });
    const first = service.clear();
    const obsolete = service.lookup("Netflix");
    const second = service.clear();
    const rejected = expect(obsolete).rejects.toThrow("cancelled");
    cancellations.forEach((resolve) => resolve());
    await first;
    await second;
    await rejected;
    expect(calls).toEqual([]);
  });
});

describe("reviewed VPA merchant evidence", () => {
  it("requires a separate exact-address approval and never expands automatic eligibility", async () => {
    const calls: unknown[] = [];
    const service = createMerchantLookupService({
      search: async (...args) => {
        calls.push(args);
        return response;
      },
      cancel: () => {},
    });
    await expect(service.lookup("netflix@oksbi", false, "vpa")).rejects.toThrow(
      "approve sending",
    );
    await expect(service.lookup("netflix@oksbi")).rejects.toThrow(
      "never searched automatically",
    );
    await expect(service.lookup("netflix@oksbi", true)).rejects.toThrow(
      "public business name",
    );
    expect(calls).toEqual([]);
    const result = await service.lookup(" SHOP.42@OkAxis ", true, "vpa");
    expect(calls).toEqual([["shop.42@okaxis", true, "vpa"]]);
    expect(result.kind).toBe("vpa");
    expect(result.sources[0].mentionsVpa).toBe(false);
  });
  it("rejects query injection, SMS fragments, multiple IDs and deceptive Unicode", () => {
    for (const value of [
      "Rs 500 to shop@oksbi",
      "shop@oksbi OR Netflix",
      "shop@oksbi other@upi",
      "shop＠oksbi",
      "shop@oksbi\nINR 500",
      "https://shop@oksbi",
      "shop@oksbi?account=123",
      'shop@oksbi"',
      "shop@oksbi\u200b",
      "s@b",
      "a".repeat(101) + "@oksbi",
    ])
      expect(() => validateVpaQuery(value)).toThrow("one complete UPI ID");
    expect(validateVpaQuery("Store-2@paytm")).toBe("store-2@paytm");
  });
  it("requires a full VPA token in displayed evidence, not a similar handle or URL query", () => {
    const source = {
      title: "Acme Cafe",
      description: "Pay us at shop@oksbi.",
      url: "https://acme.example",
    };
    expect(sourceMentionsVpa(source, "shop@oksbi")).toBe(true);
    for (const description of [
      "shop@okaxis",
      "myshop@oksbi",
      "shop@oksbi-other",
      "shop@oksbi.example",
      "shop@oksbi_2",
      "shop@oksbi@other",
      "No address shown",
    ])
      expect(sourceMentionsVpa({ ...source, description }, "shop@oksbi")).toBe(
        false,
      );
    expect(
      sourceMentionsVpa(
        {
          ...source,
          description: "",
          url: "https://acme.example?q=shop@oksbi",
        },
        "shop@oksbi",
      ),
    ).toBe(false);
    expect(
      sourceMentionsVpa(
        {
          ...source,
          description: "",
          extraSnippets: ["UPI: SHOP@OKSBI (Acme Café)"],
        },
        "shop@oksbi",
      ),
    ).toBe(true);
  });
  it("treats punctuation inside an address literally rather than as a search pattern", () => {
    const source = {
      title: "Acme",
      url: "https://acme.example",
      description: "shop.42@okaxis",
    };
    expect(sourceMentionsVpa(source, "shop.42@okaxis")).toBe(true);
    expect(
      sourceMentionsVpa(
        { ...source, description: "shopX42@okaxis" },
        "shop.42@okaxis",
      ),
    ).toBe(false);
  });
  it("sanitizes extra excerpts before determining exact address evidence", async () => {
    const service = createMerchantLookupService({
      search: async () =>
        JSON.stringify({
          sources: [
            {
              title: "Acme",
              url: "https://acme.example",
              description: "Related page",
              extraSnippets: [
                "<b>shop@oksbi</b>",
                123,
                "x".repeat(600),
                "ignored",
              ],
            },
          ],
        }),
      cancel: () => {},
    });
    const result = await service.lookup("shop@oksbi", true, "vpa");
    expect(result.sources[0].mentionsVpa).toBe(true);
    expect(result.sources[0].extraSnippets).toEqual([
      "shop@oksbi",
      "x".repeat(500),
    ]);
  });
  it("discards a cancelled VPA response and fetches anew after completion", async () => {
    let complete: (value: string) => void = () => {};
    let calls = 0;
    const service = createMerchantLookupService({
      search: () => {
        calls++;
        return new Promise<string>((resolve) => {
          complete = resolve;
        });
      },
      cancel: () => {},
    });
    const first = service.lookup("shop@oksbi", true, "vpa");
    await Promise.resolve();
    await Promise.resolve();
    const rejects = expect(first).rejects.toThrow("cancelled");
    await service.clear();
    complete(response);
    await rejects;
    const second = service.lookup("shop@oksbi", true, "vpa");
    await Promise.resolve();
    await Promise.resolve();
    complete(response);
    await second;
    const third = service.lookup("shop@oksbi", true, "vpa");
    await Promise.resolve();
    await Promise.resolve();
    complete(response);
    await third;
    expect(calls).toBe(3);
  });
});
