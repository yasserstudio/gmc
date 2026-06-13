import { describe, it, expect } from "vitest";
import { MerchantClient } from "../src/client.js";
import { ProductsService, productSegment, toProductInput, productKey } from "../src/products.js";
import type { Clock } from "../src/rate-limiter.js";

const auth = {
  getAccessToken: async () => "tok",
  getClientEmail: () => "e",
  getProjectId: () => undefined,
};

const instantClock: Clock = { now: () => 0, sleep: async () => {} };

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function service(fetchImpl: typeof fetch): ProductsService {
  return new ProductsService(
    new MerchantClient({ auth, accountId: "123", fetchImpl, clock: instantClock }),
  );
}

describe("ProductsService", () => {
  it("getProduct GETs the processed product and parses it", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return jsonResponse(200, {
        name: "accounts/123/products/online~en~US~SKU1",
        offerId: "SKU1",
      });
    }) as unknown as typeof fetch;

    const product = await service(fetchImpl).getProduct("online~en~US~SKU1");

    expect(product.offerId).toBe("SKU1");
    expect(url).toBe(
      "https://merchantapi.googleapis.com/products/v1/accounts/123/products/online~en~US~SKU1",
    );
  });

  it("getProduct accepts a full resource name", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return jsonResponse(200, { name: "x" });
    }) as unknown as typeof fetch;

    await service(fetchImpl).getProduct("accounts/123/products/online~en~US~SKU1");

    expect(url).toBe(
      "https://merchantapi.googleapis.com/products/v1/accounts/123/products/online~en~US~SKU1",
    );
  });

  // Contract test: a recorded-shape Merchant API v1 product response. Locks the v1
  // field names (`productAttributes`, itemLevelIssue `severity`/`reportingContext`/
  // `applicableCountries`) at compile time (the typed reads below) and runtime — the
  // exact bug class that shipped in 1.0.10 (`attributes`→`productAttributes`) and that
  // fully-mocked tests missed. Structure mirrors a real v1 response; content is synthetic.
  it("parses the real Merchant API v1 product shape (productAttributes + item-level issues)", async () => {
    const v1Response = {
      products: [
        {
          name: "accounts/123/products/en~GB~SKU1",
          offerId: "SKU1",
          contentLanguage: "en",
          feedLabel: "GB",
          dataSource: "accounts/123/dataSources/456",
          base64EncodedName: "ZXhhbXBsZQ==",
          productAttributes: {
            title: "Sample Product",
            description: "A sample product.",
            link: "https://example.com/p/sku1",
            availability: "in_stock",
            price: { amountMicros: "19990000", currencyCode: "GBP" },
          },
          productStatus: {
            itemLevelIssues: [
              {
                code: "policy_enforcement_account_disapproval",
                severity: "DISAPPROVED",
                resolution: "merchant_action",
                reportingContext: "SHOPPING_ADS",
                description: "Your products are not showing to customers",
                detail: "Fix policy issues.",
                documentation: "https://support.google.com/merchants/answer/12153802",
                applicableCountries: ["GB"],
              },
            ],
            creationDate: "2026-06-01T00:00:00Z",
            lastUpdateDate: "2026-06-13T00:00:00Z",
          },
        },
      ],
    };
    const fetchImpl = (async () => jsonResponse(200, v1Response)) as unknown as typeof fetch;

    const [p] = await service(fetchImpl).listProducts();

    expect(p?.productAttributes?.title).toBe("Sample Product");
    expect(p?.productAttributes?.price?.amountMicros).toBe("19990000");
    const issue = p?.productStatus?.itemLevelIssues?.[0];
    expect(issue?.severity).toBe("DISAPPROVED");
    expect(issue?.reportingContext).toBe("SHOPPING_ADS");
    expect(issue?.applicableCountries).toEqual(["GB"]);
  });

  it("listProducts follows pagination and passes pageSize", async () => {
    const pages = [
      { products: [{ name: "p1" }, { name: "p2" }], nextPageToken: "p2tok" },
      { products: [{ name: "p3" }] },
    ];
    const urls: string[] = [];
    let call = 0;
    const fetchImpl = (async (u: string) => {
      urls.push(u);
      return jsonResponse(200, pages[call++]);
    }) as unknown as typeof fetch;

    const products = await service(fetchImpl).listProducts({ pageSize: 50 });

    expect(products.map((p) => p.name)).toEqual(["p1", "p2", "p3"]);
    expect(urls[0]).toContain("/products/v1/accounts/123/products?");
    expect(urls[0]).toContain("pageSize=50");
    expect(urls[1]).toContain("pageToken=p2tok");
  });

  it("insertProductInput POSTs to productInputs:insert with the dataSource query", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const fetchImpl = (async (u: string, i: RequestInit) => {
      url = u;
      init = i;
      return jsonResponse(200, {
        name: "accounts/123/productInputs/online~en~US~SKU1",
        offerId: "SKU1",
      });
    }) as unknown as typeof fetch;

    const result = await service(fetchImpl).insertProductInput({ offerId: "SKU1" }, "55");

    expect(result.offerId).toBe("SKU1");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ offerId: "SKU1" });
    const u = new URL(url);
    expect(u.pathname).toBe("/products/v1/accounts/123/productInputs:insert");
    expect(u.searchParams.get("dataSource")).toBe("accounts/123/dataSources/55");
  });

  it("deleteProductInput DELETEs the input with the dataSource query (204 → undefined)", async () => {
    let url = "";
    let method = "";
    const fetchImpl = (async (u: string, i: RequestInit) => {
      url = u;
      method = i.method ?? "";
      return jsonResponse(204);
    }) as unknown as typeof fetch;

    // Pass the data source as a full resource name to exercise normalization.
    const res = await service(fetchImpl).deleteProductInput(
      "online~en~US~SKU1",
      "accounts/123/dataSources/55",
    );

    expect(res).toBeUndefined();
    expect(method).toBe("DELETE");
    const u = new URL(url);
    expect(u.pathname).toBe("/products/v1/accounts/123/productInputs/online~en~US~SKU1");
    expect(u.searchParams.get("dataSource")).toBe("accounts/123/dataSources/55");
  });

  it("productSegment reduces ids and resource names to the composite segment", () => {
    expect(productSegment("online~en~US~SKU1")).toBe("online~en~US~SKU1");
    expect(productSegment("accounts/123/products/online~en~US~SKU1")).toBe("online~en~US~SKU1");
    expect(productSegment("accounts/123/productInputs/online~en~US~SKU1")).toBe(
      "online~en~US~SKU1",
    );
  });
});

describe("toProductInput", () => {
  it("keeps writable fields and strips output-only ones", () => {
    const input = toProductInput({
      name: "accounts/123/products/local~en~US~SKU1",
      offerId: "SKU1",
      contentLanguage: "en",
      feedLabel: "US",
      legacyLocal: true,
      dataSource: "accounts/123/dataSources/55",
      productAttributes: { title: "Shoe", price: { amountMicros: "9990000", currencyCode: "USD" } },
      customAttributes: [{ name: "x", value: "y" }],
      productStatus: { itemLevelIssues: [{ code: "image_link" }] },
    });

    expect(input).toEqual({
      offerId: "SKU1",
      contentLanguage: "en",
      feedLabel: "US",
      legacyLocal: true,
      productAttributes: { title: "Shoe", price: { amountMicros: "9990000", currencyCode: "USD" } },
      customAttributes: [{ name: "x", value: "y" }],
    });
    // Output-only fields must not survive into a push-ready input.
    expect("name" in input).toBe(false);
    expect("productStatus" in input).toBe(false);
    expect("dataSource" in input).toBe(false);
  });

  it("omits absent fields", () => {
    expect(toProductInput({ name: "accounts/123/products/x", offerId: "SKU2" })).toEqual({
      offerId: "SKU2",
    });
  });
});

describe("productKey", () => {
  it("joins the three identity segments with ~", () => {
    expect(productKey({ contentLanguage: "en", feedLabel: "US", offerId: "sku" })).toBe(
      "en~US~sku",
    );
  });

  it("prefixes legacy-local products with local~", () => {
    expect(
      productKey({ legacyLocal: true, contentLanguage: "en", feedLabel: "US", offerId: "sku" }),
    ).toBe("local~en~US~sku");
  });

  it("collapses missing parts to empty segments", () => {
    expect(productKey({ offerId: "sku" })).toBe("~~sku");
    expect(productKey({})).toBe("~~");
  });
});
