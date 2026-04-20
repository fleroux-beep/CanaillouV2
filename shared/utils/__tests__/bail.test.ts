import { describe, it, expect } from "vitest";
import { getBailLoyer, isResilie } from "../bail";

describe("getBailLoyer", () => {
  it("returns 0 for null/undefined", () => {
    expect(getBailLoyer(null)).toBe(0);
    expect(getBailLoyer(undefined)).toBe(0);
  });

  it("returns loyerBaseHT as fallback", () => {
    expect(getBailLoyer({ loyerBaseHT: "12000" })).toBe(12000);
    expect(getBailLoyer({ loyerBaseHT: 12000 })).toBe(12000);
  });

  it("prefers loyerHTActu over loyerBaseHT", () => {
    expect(getBailLoyer({ loyerBaseHT: "10000", loyerHTActu: "12000" })).toBe(12000);
  });

  it("falls back to loyerBaseHT when loyerHTActu is 0 or empty", () => {
    expect(getBailLoyer({ loyerBaseHT: "10000", loyerHTActu: "0" })).toBe(10000);
    expect(getBailLoyer({ loyerBaseHT: "10000", loyerHTActu: "" })).toBe(10000);
    expect(getBailLoyer({ loyerBaseHT: "10000", loyerHTActu: null })).toBe(10000);
  });

  it("uses loyerManuelOverride when forceManual is true", () => {
    expect(
      getBailLoyer({
        loyerBaseHT: "10000",
        loyerHTActu: "12000",
        forceManual: true,
        loyerManuelOverride: "15000",
      }),
    ).toBe(15000);
  });

  it("ignores loyerManuelOverride when forceManual is false", () => {
    expect(
      getBailLoyer({
        loyerBaseHT: "10000",
        loyerHTActu: "12000",
        forceManual: false,
        loyerManuelOverride: "15000",
      }),
    ).toBe(12000);
  });

  it("falls through when forceManual is true but override is 0", () => {
    expect(
      getBailLoyer({
        loyerBaseHT: "10000",
        loyerHTActu: "12000",
        forceManual: true,
        loyerManuelOverride: "0",
      }),
    ).toBe(12000);
  });

  it("handles non-finite values gracefully", () => {
    expect(getBailLoyer({ loyerBaseHT: "abc" })).toBe(0);
    expect(getBailLoyer({ loyerBaseHT: "Infinity" })).toBe(0);
  });
});

describe("isResilie", () => {
  it("returns false for null/undefined/empty", () => {
    expect(isResilie(null)).toBe(false);
    expect(isResilie(undefined)).toBe(false);
    expect(isResilie("")).toBe(false);
  });

  it("matches accented résilié", () => {
    expect(isResilie("résilié")).toBe(true);
  });

  it("matches unaccented resilie", () => {
    expect(isResilie("resilie")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isResilie("Résilié")).toBe(true);
    expect(isResilie("RESILIE")).toBe(true);
    expect(isResilie("RÉSILIÉ")).toBe(true);
  });

  it("does not match other statuses", () => {
    expect(isResilie("actif")).toBe(false);
    expect(isResilie("expiré")).toBe(false);
    expect(isResilie("résiliation")).toBe(false);
  });
});
