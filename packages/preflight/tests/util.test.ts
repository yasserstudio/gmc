import { describe, it, expect } from "vitest";
import { blank, text, quote, parseMicros, isHttpUrl } from "../src/rules/_util.js";

describe("blank", () => {
  it("treats absent/empty as blank, a present non-string as not blank", () => {
    expect(blank(undefined)).toBe(true);
    expect(blank(null)).toBe(true);
    expect(blank("")).toBe(true);
    expect(blank("   ")).toBe(true);
    expect(blank("x")).toBe(false);
    expect(blank(0)).toBe(false); // present, just not a string
  });
});

describe("text", () => {
  it("trims strings and treats blank as absent", () => {
    expect(text("  hi ")).toBe("hi");
    expect(text("   ")).toBeUndefined();
    expect(text(undefined)).toBeUndefined();
    expect(text(null)).toBeUndefined();
  });
  it("coerces non-strings rather than throwing", () => {
    expect(text(42)).toBe("42");
    expect(text(["a", "b"])).toBe("a,b");
  });
});

describe("quote", () => {
  it("replaces control characters (newline, tab, ANSI ESC) with spaces", () => {
    const nl = String.fromCharCode(10);
    const tab = String.fromCharCode(9);
    const esc = String.fromCharCode(27);
    expect(quote(`a${nl}b${tab}c`)).toBe("a b c");
    expect(quote(`x${esc}[31my`)).toBe("x [31my");
  });
  it("caps length with an ellipsis", () => {
    const out = quote("x".repeat(100));
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe(81); // 80 chars + ellipsis
  });
});

describe("parseMicros", () => {
  it("classifies absent / valid / invalid", () => {
    expect(parseMicros(undefined).kind).toBe("absent");
    expect(parseMicros("").kind).toBe("absent");
    expect(parseMicros("1000").kind).toBe("valid");
    expect(parseMicros(1000).kind).toBe("valid"); // numeric tolerated
    expect(parseMicros("-5").kind).toBe("invalid");
    expect(parseMicros("4.99").kind).toBe("invalid");
    expect(parseMicros("abc").kind).toBe("invalid");
    // Beyond MAX_SAFE_INTEGER → invalid (Number() would lose precision).
    expect(parseMicros("90071992547409930000").kind).toBe("invalid");
  });
});

describe("isHttpUrl", () => {
  it("accepts http/https, rejects other schemes and garbage", () => {
    expect(isHttpUrl("https://x.com/p")).toBe(true);
    expect(isHttpUrl("http://x.com")).toBe(true);
    expect(isHttpUrl("ftp://x.com")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
  });
});
