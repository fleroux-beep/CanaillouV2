import { describe, it, expect, vi } from "vitest";

// Mock db module to avoid DATABASE_URL requirement
vi.mock("../../db", () => ({
  db: {},
  pool: {},
}));

import { paramId } from "../crud-factory";

describe("paramId", () => {
  const validUUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  function mockReq(id: string | string[]) {
    return { params: { id } };
  }

  function mockRes() {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  }

  it("returns a valid UUID unchanged", () => {
    expect(paramId(mockReq(validUUID))).toBe(validUUID);
  });

  it("returns empty string for invalid UUID without res", () => {
    expect(paramId(mockReq("not-a-uuid"))).toBe("");
  });

  it("returns empty string for SQL injection attempt", () => {
    expect(paramId(mockReq("'; DROP TABLE actifs;--"))).toBe("");
  });

  it("sends 400 when res is provided and UUID is invalid", () => {
    const res = mockRes();
    const result = paramId(mockReq("bad-id"), res);
    expect(result).toBe("");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "ID invalide" });
  });

  it("does not send 400 when res is provided and UUID is valid", () => {
    const res = mockRes();
    const result = paramId(mockReq(validUUID), res);
    expect(result).toBe(validUUID);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("handles array params (Express quirk)", () => {
    expect(paramId(mockReq([validUUID, "other"]))).toBe(validUUID);
  });

  it("rejects UUIDs with wrong length", () => {
    expect(paramId(mockReq("a1b2c3d4-e5f6-7890-abcd-ef123456789"))).toBe(""); // too short
    expect(paramId(mockReq("a1b2c3d4-e5f6-7890-abcd-ef12345678900"))).toBe(""); // too long
  });

  it("accepts uppercase UUIDs", () => {
    expect(paramId(mockReq(validUUID.toUpperCase()))).toBe(validUUID.toUpperCase());
  });
});
