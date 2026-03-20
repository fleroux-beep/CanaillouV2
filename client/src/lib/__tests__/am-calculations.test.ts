import { describe, it, expect } from "vitest";
import {
  getLoyerAnnuelActif,
  getChargesAnnuelles,
  getPrixAcquisition,
  getValeurEstimee,
  getAnnuiteEmprunt,
  getServiceDette,
  getTotalCRD,
  getCapitalRestantDu,
  getRendementBrut,
  getRendementNet,
  getLTV,
  getDSCR,
  computeIRR,
  computeNPV,
  computeDCF,
  computeAmortSchedule,
  computeAssocieNAV,
  computeStressTests,
  computeMultiYearProjection,
  type AMActif,
  type AMBail,
  type AMLot,
  type AMEmprunt,
  type AMAssocie,
  type AMParticipation,
} from "../am-calculations";

// ============================================================
// Helpers
// ============================================================

function makeActif(overrides: Partial<AMActif> = {}): AMActif {
  return {
    id: "a1",
    nom: "Test",
    ...overrides,
  };
}

function makeBail(overrides: Partial<AMBail> = {}): AMBail {
  return {
    id: "b1",
    actifId: "a1",
    statut: "actif",
    ...overrides,
  };
}

function makeEmprunt(overrides: Partial<AMEmprunt> = {}): AMEmprunt {
  return {
    id: "e1",
    sciId: "s1",
    ...overrides,
  };
}

// ============================================================
// 1. Loyers
// ============================================================

describe("getLoyerAnnuelActif", () => {
  it("returns 0 when no baux", () => {
    expect(getLoyerAnnuelActif(makeActif(), [])).toBe(0);
  });

  it("sums loyer annuel from baux linked to actif", () => {
    const baux = [
      makeBail({ loyerAnnuel: "12000" }),
      makeBail({ id: "b2", loyerAnnuel: "8000" }),
    ];
    expect(getLoyerAnnuelActif(makeActif(), baux)).toBe(20000);
  });

  it("falls back to loyerMensuel * 12 when loyerAnnuel missing", () => {
    const baux = [makeBail({ loyerMensuel: "1000" })];
    expect(getLoyerAnnuelActif(makeActif(), baux)).toBe(12000);
  });

  it("excludes baux with statut 'résilié'", () => {
    const baux = [
      makeBail({ loyerAnnuel: "12000", statut: "résilié" }),
    ];
    expect(getLoyerAnnuelActif(makeActif(), baux)).toBe(0);
  });

  it("excludes archived baux", () => {
    const baux = [
      makeBail({ loyerAnnuel: "12000", archived: true }),
    ];
    expect(getLoyerAnnuelActif(makeActif(), baux)).toBe(0);
  });

  it("excludes baux from other actifs", () => {
    const baux = [makeBail({ actifId: "other", loyerAnnuel: "12000" })];
    expect(getLoyerAnnuelActif(makeActif(), baux)).toBe(0);
  });

  it("returns 0 with null actif", () => {
    expect(getLoyerAnnuelActif(null as any, [])).toBe(0);
  });

  it("returns 0 with null baux", () => {
    expect(getLoyerAnnuelActif(makeActif(), null as any)).toBe(0);
  });

  it("falls back to lots when no baux match", () => {
    const lots: AMLot[] = [
      { id: "l1", actifId: "a1", statut: "loué", loyerAnnuel: "6000" },
    ];
    expect(getLoyerAnnuelActif(makeActif(), [], lots)).toBe(6000);
  });
});

// ============================================================
// 2. Charges
// ============================================================

describe("getChargesAnnuelles", () => {
  it("sums copro + taxe fonciere + assurance PNO", () => {
    const actif = makeActif({
      chargesCopropriete: "1200",
      taxeFonciere: "800",
      assurancePno: "300",
    });
    expect(getChargesAnnuelles(actif)).toBe(2300);
  });

  it("falls back to chargesAnnuelles when chargesCopropriete missing", () => {
    const actif = makeActif({ chargesAnnuelles: "1200" });
    expect(getChargesAnnuelles(actif)).toBe(1200);
  });

  it("returns 0 for null actif", () => {
    expect(getChargesAnnuelles(null as any)).toBe(0);
  });

  it("handles all null fields gracefully", () => {
    expect(getChargesAnnuelles(makeActif())).toBe(0);
  });
});

// ============================================================
// 3. Valorisation
// ============================================================

describe("getPrixAcquisition", () => {
  it("sums acquisition + frais + travaux", () => {
    const actif = makeActif({
      prixAcquisition: "200000",
      fraisNotaire: "15000",
      fraisAgence: "5000",
      montantTravaux: "30000",
    });
    expect(getPrixAcquisition(actif)).toBe(250000);
  });

  it("returns 0 for null actif", () => {
    expect(getPrixAcquisition(null as any)).toBe(0);
  });
});

describe("getValeurEstimee", () => {
  it("uses capitalisation method when tauxCapi available", () => {
    const actif = makeActif({
      tauxCapitalisation: "6",
      prixAcquisition: "100000",
    });
    const baux = [makeBail({ loyerAnnuel: "12000" })];
    // NOI = 12000, taux = 6% => 12000 / 0.06 = 200000
    expect(getValeurEstimee(actif, baux)).toBe(200000);
  });

  it("uses comparables method when prixM2Marche available", () => {
    const actif = makeActif({
      surface: "50",
      prixM2Marche: "4000",
      prixAcquisition: "100000",
    });
    // 50 * 4000 = 200000
    expect(getValeurEstimee(actif, [])).toBe(200000);
  });

  it("averages both methods when both available", () => {
    const actif = makeActif({
      tauxCapitalisation: "5",
      surface: "100",
      prixM2Marche: "3000",
    });
    const baux = [makeBail({ loyerAnnuel: "20000" })];
    // Capi: 20000 / 0.05 = 400000, Comp: 100 * 3000 = 300000
    // Average = 350000
    expect(getValeurEstimee(actif, baux)).toBe(350000);
  });

  it("falls back to prix acquisition when no method available", () => {
    const actif = makeActif({ prixAcquisition: "150000", fraisNotaire: "10000" });
    expect(getValeurEstimee(actif, [])).toBe(160000);
  });
});

// ============================================================
// 4. Emprunts — Formule actuarielle mensuelle
// ============================================================

describe("getAnnuiteEmprunt", () => {
  it("uses mensualite * 12 when available", () => {
    const e = makeEmprunt({ mensualite: "1000" });
    expect(getAnnuiteEmprunt(e)).toBe(12000);
  });

  it("returns 0 when no data", () => {
    expect(getAnnuiteEmprunt(makeEmprunt())).toBe(0);
  });

  it("returns linear for 0% rate", () => {
    const e = makeEmprunt({
      montantEmprunte: "120000",
      tauxAnnuel: "0",
      dureeAns: 10,
    });
    expect(getAnnuiteEmprunt(e)).toBe(12000); // 120000 / 10
  });

  it("calculates monthly actuarial formula correctly", () => {
    // 200 000 EUR @ 3% over 20 years
    // Monthly rate = 0.03/12 = 0.0025
    // n = 240 months
    // M = 200000 * 0.0025 * (1.0025^240) / ((1.0025^240) - 1)
    // M ≈ 1109.20 => A ≈ 13310.40
    const e = makeEmprunt({
      montantEmprunte: "200000",
      tauxAnnuel: "3",
      dureeAns: 20,
    });
    const result = getAnnuiteEmprunt(e);
    expect(result).toBeGreaterThan(13300);
    expect(result).toBeLessThan(13320);
  });

  it("handles null emprunt", () => {
    expect(getAnnuiteEmprunt(null as any)).toBe(0);
  });
});

describe("getServiceDette", () => {
  it("sums annuites from multiple emprunts", () => {
    const emprunts = [
      makeEmprunt({ mensualite: "500" }),
      makeEmprunt({ id: "e2", mensualite: "300" }),
    ];
    expect(getServiceDette(emprunts)).toBe(9600); // (500+300)*12
  });

  it("returns 0 for empty array", () => {
    expect(getServiceDette([])).toBe(0);
  });
});

describe("getTotalCRD", () => {
  it("sums capital restant du", () => {
    const emprunts = [
      makeEmprunt({ capitalRestantDu: "100000" }),
      makeEmprunt({ id: "e2", capitalRestantDu: "50000" }),
    ];
    expect(getTotalCRD(emprunts)).toBe(150000);
  });

  it("falls back to montantEmprunte", () => {
    const emprunts = [makeEmprunt({ montantEmprunte: "200000" })];
    expect(getTotalCRD(emprunts)).toBe(200000);
  });
});

// ============================================================
// 5. Rendements & Ratios
// ============================================================

describe("getRendementBrut", () => {
  it("returns correct percentage", () => {
    expect(getRendementBrut(12000, 200000)).toBeCloseTo(6, 2);
  });

  it("returns 0 when valeur <= 0", () => {
    expect(getRendementBrut(12000, 0)).toBe(0);
    expect(getRendementBrut(12000, -1)).toBe(0);
  });
});

describe("getRendementNet", () => {
  it("returns correct percentage", () => {
    expect(getRendementNet(12000, 2000, 200000)).toBeCloseTo(5, 2);
  });
});

describe("getLTV", () => {
  it("returns correct percentage", () => {
    expect(getLTV(150000, 200000)).toBeCloseTo(75, 2);
  });

  it("returns 0 when valeur <= 0", () => {
    expect(getLTV(150000, 0)).toBe(0);
  });
});

describe("getDSCR", () => {
  it("returns correct ratio", () => {
    expect(getDSCR(10000, 8000)).toBeCloseTo(1.25, 2);
  });

  it("returns 0 when serviceDette <= 0", () => {
    expect(getDSCR(10000, 0)).toBe(0);
    expect(getDSCR(10000, -1)).toBe(0);
  });
});

// ============================================================
// 6. IRR / NPV
// ============================================================

describe("computeIRR", () => {
  it("returns null for fewer than 2 cash flows", () => {
    expect(computeIRR([100])).toBeNull();
  });

  it("returns null when initial investment is positive", () => {
    expect(computeIRR([100, 200])).toBeNull();
  });

  it("computes correct IRR for simple case", () => {
    // Invest 100, get 110 after 1 year = 10% IRR
    const irr = computeIRR([-100, 110]);
    expect(irr).not.toBeNull();
    expect(irr!).toBeCloseTo(10, 0);
  });

  it("computes IRR for multi-year case", () => {
    // Invest 1000, get 400/year for 3 years
    const irr = computeIRR([-1000, 400, 400, 400]);
    expect(irr).not.toBeNull();
    expect(irr!).toBeGreaterThan(8);
    expect(irr!).toBeLessThan(12);
  });
});

describe("computeNPV", () => {
  it("computes correct NPV", () => {
    // -1000 + 500/(1.1) + 500/(1.1^2) + 500/(1.1^3) ≈ 243.43
    const npv = computeNPV([-1000, 500, 500, 500], 10);
    expect(npv).toBeGreaterThan(240);
    expect(npv).toBeLessThan(250);
  });
});

// ============================================================
// 7. DCF
// ============================================================

describe("computeDCF", () => {
  it("produces valid DCF result", () => {
    const result = computeDCF(50000, 2, 8, 6, 10, 500000);
    expect(result.projectedCashFlows).toHaveLength(10);
    expect(result.totalPV).toBeGreaterThan(0);
    expect(result.pvCashFlows).toBeGreaterThan(0);
    expect(result.pvTerminal).toBeGreaterThan(0);
    expect(result.terminalValue).toBeGreaterThan(0);
  });

  it("returns terminal value of 0 when exitCapRate <= growth", () => {
    const result = computeDCF(50000, 5, 8, 5, 10, 500000);
    expect(result.terminalValue).toBe(0);
  });
});

// ============================================================
// 8. Amortization schedule — monthly precision
// ============================================================

describe("computeAmortSchedule", () => {
  it("returns empty for invalid emprunt", () => {
    expect(computeAmortSchedule(makeEmprunt())).toEqual([]);
  });

  it("generates correct number of rows", () => {
    const e = makeEmprunt({
      montantEmprunte: "200000",
      tauxAnnuel: "3",
      dureeAns: 20,
    });
    const rows = computeAmortSchedule(e);
    expect(rows.length).toBe(20);
  });

  it("first row capitalDebut equals montant", () => {
    const e = makeEmprunt({
      montantEmprunte: "100000",
      tauxAnnuel: "4",
      dureeAns: 15,
    });
    const rows = computeAmortSchedule(e);
    expect(rows[0].capitalDebut).toBeCloseTo(100000, 0);
  });

  it("last row capitalFin is near zero", () => {
    const e = makeEmprunt({
      montantEmprunte: "200000",
      tauxAnnuel: "3",
      dureeAns: 20,
    });
    const rows = computeAmortSchedule(e);
    expect(rows[rows.length - 1].capitalFin).toBeLessThan(1);
  });

  it("total capital amorti equals montant", () => {
    const e = makeEmprunt({
      montantEmprunte: "150000",
      tauxAnnuel: "2.5",
      dureeAns: 25,
    });
    const rows = computeAmortSchedule(e);
    const totalAmorti = rows.reduce((s, r) => s + r.capitalAmorti, 0);
    expect(totalAmorti).toBeCloseTo(150000, 0);
  });

  it("handles 0% rate (linear amortization)", () => {
    const e = makeEmprunt({
      montantEmprunte: "120000",
      tauxAnnuel: "0",
      dureeAns: 10,
    });
    const rows = computeAmortSchedule(e);
    expect(rows.length).toBe(10);
    // Each year should amortize 12000
    expect(rows[0].capitalAmorti).toBeCloseTo(12000, 0);
    expect(rows[0].interets).toBeCloseTo(0, 5);
  });
});

// ============================================================
// 9. NAV par associé
// ============================================================

describe("computeAssocieNAV", () => {
  it("computes NAV correctly for single associe", () => {
    const associes: AMAssocie[] = [{ id: "as1", nom: "Dupont", prenom: "Jean" }];
    const participations: AMParticipation[] = [
      { id: "p1", associeId: "as1", sciId: "s1", pourcentage: "50", montantApport: "100000" },
    ];
    const result = computeAssocieNAV(400000, 24000, associes, participations);
    expect(result).toHaveLength(1);
    expect(result[0].partPct).toBe(50);
    expect(result[0].navPart).toBe(200000); // 400000 * 50%
    expect(result[0].plusValueLatente).toBe(100000); // 200000 - 100000
    expect(result[0].rendementAnnuelise).toBe(12); // (24000 * 50% / 100000) * 100
  });

  it("handles empty participations", () => {
    const associes: AMAssocie[] = [{ id: "as1", nom: "Dupont" }];
    const result = computeAssocieNAV(400000, 24000, associes, []);
    expect(result[0].partPct).toBe(0);
    expect(result[0].navPart).toBe(0);
    expect(result[0].rendementAnnuelise).toBe(0);
  });
});

// ============================================================
// 10. Stress tests
// ============================================================

describe("computeStressTests", () => {
  it("returns 7 scenarios", () => {
    const result = computeStressTests(100000, 20000, 30000, 500000, 300000);
    expect(result).toHaveLength(7);
  });

  it("base scenario has no adjustments", () => {
    const result = computeStressTests(100000, 20000, 30000, 500000, 300000);
    const base = result[0];
    expect(base.label).toBe("Base");
    expect(base.loyerAjuste).toBe(100000);
    expect(base.chargesAjustees).toBe(20000);
    expect(base.noiAjuste).toBe(80000);
  });

  it("vacance reduces loyer", () => {
    const result = computeStressTests(100000, 20000, 30000, 500000, 300000);
    const vacance10 = result[1];
    expect(vacance10.loyerAjuste).toBe(90000); // -10%
  });

  it("stress test uses monthly formula for rate increase", () => {
    const emprunts = [makeEmprunt({
      montantEmprunte: "300000",
      tauxAnnuel: "3",
      dureeAns: 20,
    })];
    const result = computeStressTests(100000, 20000, 30000, 500000, 300000, emprunts);
    const tauxStress = result.find(s => s.label === "Taux +200bp")!;
    // With emprunts provided, the stressed service dette should differ from base
    // The stressed debt service at 5% is higher, so NOI - stressedDebt < NOI - baseDebt
    // But base scenario doesn't recalculate per emprunt (uses flat serviceDette=30000)
    // whereas stressed recalculates using monthly formula
    expect(tauxStress.noiAjuste).toBe(result[0].noiAjuste); // Same NOI
    // Debt service should be recalculated and higher than 0
    expect(tauxStress.dscr).toBeGreaterThan(0);
  });
});

// ============================================================
// 11. Multi-year projection
// ============================================================

describe("computeMultiYearProjection", () => {
  it("produces correct number of years", () => {
    const result = computeMultiYearProjection(100000, 20000, 30000, 500000, 300000, 2, 2, 1, 15000, 10);
    expect(result).toHaveLength(11); // Year 0 to 10
  });

  it("year 0 is 'Actuel' with base values", () => {
    const result = computeMultiYearProjection(100000, 20000, 30000, 500000, 300000, 2, 2, 1, 15000, 5);
    expect(result[0].label).toBe("Actuel");
    expect(result[0].loyers).toBe(100000);
    expect(result[0].charges).toBe(20000);
  });

  it("loyers grow over time", () => {
    const result = computeMultiYearProjection(100000, 20000, 30000, 500000, 300000, 3, 2, 1, 15000, 5);
    expect(result[1].loyers).toBeGreaterThan(result[0].loyers);
    expect(result[5].loyers).toBeGreaterThan(result[1].loyers);
  });

  it("dette decreases over time", () => {
    const result = computeMultiYearProjection(100000, 20000, 30000, 500000, 300000, 2, 2, 1, 15000, 5);
    // LTV should decrease as dette decreases and valorisation increases
    expect(result[5].ltv).toBeLessThan(result[0].ltv);
  });
});

// ============================================================
// 12. Edge cases — Division by zero protection
// ============================================================

describe("Division by zero protection", () => {
  it("getRendementBrut with valeur=0", () => {
    expect(getRendementBrut(12000, 0)).toBe(0);
  });

  it("getRendementNet with valeur=0", () => {
    expect(getRendementNet(12000, 2000, 0)).toBe(0);
  });

  it("getLTV with valeur=0", () => {
    expect(getLTV(100000, 0)).toBe(0);
  });

  it("getDSCR with serviceDette=0", () => {
    expect(getDSCR(10000, 0)).toBe(0);
  });

  it("getValeurEstimee with tauxCapi=0", () => {
    const actif = makeActif({ tauxCapitalisation: "0", prixAcquisition: "100000" });
    const baux = [makeBail({ loyerAnnuel: "12000" })];
    // Should fall back to prix acquisition since capi method returns 0
    expect(getValeurEstimee(actif, baux)).toBe(100000);
  });
});

// ============================================================
// 13. Edge cases — Null/undefined handling
// ============================================================

describe("Null/undefined handling", () => {
  it("getAnnuiteEmprunt with undefined fields", () => {
    const e = makeEmprunt({
      montantEmprunte: undefined,
      tauxAnnuel: undefined,
      dureeAns: undefined,
    });
    expect(getAnnuiteEmprunt(e)).toBe(0);
  });

  it("getChargesAnnuelles with all null fields", () => {
    const actif = makeActif({
      chargesCopropriete: null,
      chargesAnnuelles: null,
      taxeFonciere: null,
      assurancePno: null,
    });
    expect(getChargesAnnuelles(actif)).toBe(0);
  });

  it("getCapitalRestantDu falls back correctly", () => {
    expect(getCapitalRestantDu(makeEmprunt({ capitalRestantDu: null, montantEmprunte: "200000" }))).toBe(200000);
    expect(getCapitalRestantDu(makeEmprunt({ capitalRestantDu: null, montantEmprunte: null }))).toBe(0);
  });
});
