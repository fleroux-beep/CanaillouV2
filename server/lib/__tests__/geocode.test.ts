import { describe, it, expect } from "vitest";
import { needsGeocoding } from "../geocode";

describe("needsGeocoding", () => {
  describe("creation (no existing)", () => {
    it("returns true when address provided without coords", () => {
      expect(needsGeocoding({ adresse: "1 rue test", ville: "Paris" })).toBe(true);
    });

    it("returns false when coords already set", () => {
      expect(needsGeocoding({ adresse: "1 rue test", lat: 48.8, lng: 2.3 })).toBe(false);
    });

    it("returns falsy when no address at all", () => {
      expect(needsGeocoding({ nom: "Test" })).toBeFalsy();
    });

    it("returns true with only ville", () => {
      expect(needsGeocoding({ ville: "Lyon" })).toBe(true);
    });

    it("returns true with only codePostal", () => {
      expect(needsGeocoding({ codePostal: "75001" })).toBe(true);
    });
  });

  describe("update (with existing)", () => {
    const existing = { adresse: "1 rue vieille", ville: "Paris", codePostal: "75001", lat: 48.8, lng: 2.3 };

    it("returns true when adresse changes", () => {
      expect(needsGeocoding({ adresse: "2 rue nouvelle" }, existing)).toBe(true);
    });

    it("returns true when ville changes", () => {
      expect(needsGeocoding({ ville: "Lyon" }, existing)).toBe(true);
    });

    it("returns false when address unchanged", () => {
      expect(needsGeocoding({ nom: "Renamed" }, existing)).toBe(false);
    });

    it("returns false when lat/lng explicitly set in body", () => {
      expect(needsGeocoding({ adresse: "new", lat: 45.0, lng: 3.0 }, existing)).toBe(false);
    });

    it("returns true when existing has no coords", () => {
      const noCoords = { adresse: "1 rue test", ville: "Paris", lat: null, lng: null };
      expect(needsGeocoding({ nom: "Test" }, noCoords)).toBe(true);
    });
  });
});
