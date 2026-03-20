import { describe, it, expect } from "vitest";
import { formatCurrency, formatPercent, formatNumber } from "../utils";

describe("formatCurrency", () => {
  it("formats positive numbers", () => {
    const result = formatCurrency(1234.56);
    // French locale uses narrow no-break space as thousands separator
    expect(result).toMatch(/1[\s\u202f\u00a0]234,56/);
    expect(result).toMatch(/EUR|€/);
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toMatch(/0,00/);
  });

  it("handles null gracefully", () => {
    expect(formatCurrency(null)).toMatch(/0,00/);
  });

  it("handles undefined gracefully", () => {
    expect(formatCurrency(undefined)).toMatch(/0,00/);
  });

  it("handles string input", () => {
    const result = formatCurrency("5000");
    expect(result).toMatch(/5[\s\u202f\u00a0]000,00/);
  });

  it("handles NaN string", () => {
    expect(formatCurrency("abc")).toMatch(/0,00/);
  });
});

describe("formatPercent", () => {
  it("uses French locale (comma decimal separator)", () => {
    const result = formatPercent(5.5);
    expect(result).toContain(",");
    expect(result).toContain("%");
    // Should be "5,5 %" with French locale
    expect(result).toMatch(/5,5\s*%/);
  });

  it("handles zero", () => {
    expect(formatPercent(0)).toMatch(/0,0\s*%/);
  });

  it("handles null", () => {
    expect(formatPercent(null)).toMatch(/0,0\s*%/);
  });

  it("respects decimals parameter", () => {
    const result = formatPercent(3.456, 2);
    expect(result).toMatch(/3,46\s*%/);
  });
});

describe("formatNumber", () => {
  it("formats with French locale", () => {
    const result = formatNumber(1234567);
    expect(result).toMatch(/1[\s\u202f\u00a0]234[\s\u202f\u00a0]567/);
  });

  it("handles null gracefully", () => {
    expect(formatNumber(null)).toBe("0");
  });

  it("respects decimals", () => {
    const result = formatNumber(1234.567, 2);
    expect(result).toMatch(/1[\s\u202f\u00a0]234,57/);
  });
});
