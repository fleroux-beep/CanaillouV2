import { describe, it, expect, vi } from "vitest";
import { rateLimit } from "../rate-limit";

function mockReq(ip = "127.0.0.1") {
  return { ip, connection: { remoteAddress: ip } };
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  return res;
}

describe("rateLimit", () => {
  it("allows requests under the limit", () => {
    const middleware = rateLimit(3, 60_000, "test-allow");
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      middleware(mockReq("10.0.0.1"), mockRes(), next);
    }
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("blocks requests over the limit with 429", () => {
    const middleware = rateLimit(2, 60_000, "test-block");
    const next = vi.fn();
    const req = mockReq("10.0.0.2");

    middleware(req, mockRes(), next); // 1
    middleware(req, mockRes(), next); // 2

    const res3 = mockRes();
    middleware(req, res3, next); // 3 — should be blocked

    expect(next).toHaveBeenCalledTimes(2);
    expect(res3.status).toHaveBeenCalledWith(429);
    expect(res3.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining("Trop de tentatives"),
    }));
  });

  it("isolates by prefix", () => {
    const mw1 = rateLimit(1, 60_000, "route-a");
    const mw2 = rateLimit(1, 60_000, "route-b");
    const next = vi.fn();
    const req = mockReq("10.0.0.3");

    mw1(req, mockRes(), next);
    // mw1 exhausted, but mw2 should still work
    mw2(req, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("sets Retry-After header on 429", () => {
    const middleware = rateLimit(1, 60_000, "test-retry");
    const next = vi.fn();
    const req = mockReq("10.0.0.4");

    middleware(req, mockRes(), next); // allowed
    const res = mockRes();
    middleware(req, res, next); // blocked

    expect(res.set).toHaveBeenCalledWith("Retry-After", expect.any(String));
  });
});
