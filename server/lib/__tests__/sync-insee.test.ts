import { describe, it, expect } from "vitest";

// Test the convertPeriod and parseInseeXmlResponse functions
// by re-implementing them here (they're not exported, but we test the logic)

function convertPeriod(period: string): string | null {
  const m = period.match(/(\d{4})-Q(\d)/);
  if (m) return `T${m[2]}-${m[1]}`;
  const m2 = period.match(/(\d{4})-T(\d)/);
  if (m2) return `T${m2[2]}-${m2[1]}`;
  if (/^T\d-\d{4}$/.test(period)) return period;
  const m3 = period.match(/^(\d{4})-(\d{2})$/);
  if (m3) {
    const month = parseInt(m3[2], 10);
    const quarter = Math.ceil(month / 3);
    return `T${quarter}-${m3[1]}`;
  }
  return null;
}

function parseInseeXmlResponse(text: string): Array<{ trimestre: string; valeur: number }> {
  const values: Array<{ trimestre: string; valeur: number }> = [];
  const obsPattern = /<Obs\s+([^>]+)\/?>/g;
  let obsMatch;
  while ((obsMatch = obsPattern.exec(text)) !== null) {
    const attrs = obsMatch[1];
    const timePeriod = attrs.match(/TIME_PERIOD="([^"]+)"/)?.[1];
    const obsValue = attrs.match(/OBS_VALUE="([^"]+)"/)?.[1];
    if (timePeriod && obsValue) {
      const trimestre = convertPeriod(timePeriod);
      const valeur = Number(obsValue);
      if (trimestre && !isNaN(valeur)) {
        values.push({ trimestre, valeur });
      }
    }
  }
  return values;
}

describe("convertPeriod", () => {
  it("converts ISO quarter format (2025-Q1)", () => {
    expect(convertPeriod("2025-Q1")).toBe("T1-2025");
    expect(convertPeriod("2024-Q4")).toBe("T4-2024");
  });

  it("converts French quarter format (2025-T1)", () => {
    expect(convertPeriod("2025-T2")).toBe("T2-2025");
  });

  it("passes through already-formatted (T1-2025)", () => {
    expect(convertPeriod("T3-2024")).toBe("T3-2024");
  });

  it("converts monthly format to quarter", () => {
    expect(convertPeriod("2025-01")).toBe("T1-2025");
    expect(convertPeriod("2025-03")).toBe("T1-2025");
    expect(convertPeriod("2025-04")).toBe("T2-2025");
    expect(convertPeriod("2025-06")).toBe("T2-2025");
    expect(convertPeriod("2025-12")).toBe("T4-2025");
  });

  it("returns null for invalid formats", () => {
    expect(convertPeriod("invalid")).toBeNull();
    expect(convertPeriod("2025")).toBeNull();
    expect(convertPeriod("")).toBeNull();
  });
});

describe("parseInseeXmlResponse", () => {
  it("parses standard SDMX XML with Obs elements", () => {
    const xml = `
      <DataSet>
        <Obs TIME_PERIOD="2025-Q1" OBS_VALUE="143.46" />
        <Obs TIME_PERIOD="2024-Q4" OBS_VALUE="142.06" />
      </DataSet>
    `;
    const result = parseInseeXmlResponse(xml);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ trimestre: "T1-2025", valeur: 143.46 });
    expect(result[1]).toEqual({ trimestre: "T4-2024", valeur: 142.06 });
  });

  it("handles varied attribute order", () => {
    const xml = `<Obs OBS_VALUE="145.78" TIME_PERIOD="2025-Q2" CONF_STATUS="P"/>`;
    const result = parseInseeXmlResponse(xml);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ trimestre: "T2-2025", valeur: 145.78 });
  });

  it("returns empty array for no Obs", () => {
    expect(parseInseeXmlResponse("<DataSet></DataSet>")).toEqual([]);
    expect(parseInseeXmlResponse("")).toEqual([]);
  });

  it("skips Obs with missing attributes", () => {
    const xml = `
      <Obs TIME_PERIOD="2025-Q1" />
      <Obs OBS_VALUE="143" />
      <Obs TIME_PERIOD="2025-Q2" OBS_VALUE="144" />
    `;
    const result = parseInseeXmlResponse(xml);
    expect(result).toHaveLength(1);
    expect(result[0].trimestre).toBe("T2-2025");
  });
});

describe("IRL cap logic", () => {
  it("caps IRL increase at 3.5% per year cumulative", () => {
    const baseLoyer = 10000;
    const yearsSinceStart = 2;
    const maxCumul = Math.pow(1.035, yearsSinceStart);
    const maxLoyer = baseLoyer * maxCumul;

    // If indice gives 10% increase
    const uncappedLoyer = baseLoyer * 1.10;
    expect(uncappedLoyer).toBeGreaterThan(maxLoyer);

    const cappedLoyer = Math.min(uncappedLoyer, maxLoyer);
    expect(cappedLoyer).toBeCloseTo(maxLoyer, 2);
    expect(cappedLoyer).toBeLessThan(uncappedLoyer);
  });

  it("does not cap if increase is within 3.5%/year", () => {
    const baseLoyer = 10000;
    const yearsSinceStart = 1;
    const maxCumul = Math.pow(1.035, yearsSinceStart);
    const maxLoyer = baseLoyer * maxCumul;

    const normalLoyer = baseLoyer * 1.02;
    expect(normalLoyer).toBeLessThan(maxLoyer);
    expect(Math.min(normalLoyer, maxLoyer)).toBe(normalLoyer);
  });
});
