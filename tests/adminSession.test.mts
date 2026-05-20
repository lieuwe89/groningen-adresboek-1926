import test, { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_COOKIE_MAX_AGE_SECONDS,
  signSession,
  verifySession,
  constantTimeEqual,
  createSessionCookieValue,
} from "../lib/admin-session.ts";

describe("admin-session", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.ADMIN_SECRET;
    process.env.ADMIN_SECRET = "super_secret_admin_key_1234567890";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.ADMIN_SECRET;
    } else {
      process.env.ADMIN_SECRET = originalSecret;
    }
  });

  it("throws error if ADMIN_SECRET is not set", async () => {
    delete process.env.ADMIN_SECRET;
    await assert.rejects(async () => {
      await signSession(Date.now() + 1000);
    }, /ADMIN_SECRET env var must be set/);
  });

  it("throws error if ADMIN_SECRET is too short", async () => {
    process.env.ADMIN_SECRET = "short"; // < 16 chars
    await assert.rejects(async () => {
      await signSession(Date.now() + 1000);
    }, /ADMIN_SECRET env var must be set/);
  });

  it("signs and verifies a valid session", async () => {
    const expiry = Date.now() + 10000;
    const token = await signSession(expiry);

    const isValid = await verifySession(token);
    assert.equal(isValid, true);
  });

  it("fails verification for expired session", async () => {
    const expiry = Date.now() - 1000; // expired 1s ago
    const token = await signSession(expiry);

    const isValid = await verifySession(token);
    assert.equal(isValid, false);
  });

  it("fails verification for invalid token formats", async () => {
    assert.equal(await verifySession(""), false);
    assert.equal(await verifySession(null as any), false);
    assert.equal(await verifySession(undefined), false);
    assert.equal(await verifySession("nodots_here"), false);
    assert.equal(await verifySession("123456."), false);
    assert.equal(await verifySession(".signature"), false);
    assert.equal(await verifySession("invalid_expiry.signature"), false);
  });

  it("fails verification if secret changes (signature mismatch)", async () => {
    const expiry = Date.now() + 10000;
    const token = await signSession(expiry);

    // Change secret
    process.env.ADMIN_SECRET = "another_secret_key_1234567890123";
    const isValid = await verifySession(token);
    assert.equal(isValid, false);
  });

  it("fails verification if signature is tampered", async () => {
    const expiry = Date.now() + 10000;
    const token = await signSession(expiry);

    const parts = token.split(".");
    const tampered = parts[0] + "." + parts[1] + "tamper";
    const isValid = await verifySession(tampered);
    assert.equal(isValid, false);
  });

  it("fails verification if signature is invalid base64", async () => {
    const expiry = Date.now() + 10000;
    const token = `${expiry}.!@#$%^&*()`;
    const isValid = await verifySession(token);
    assert.equal(isValid, false);
  });

  describe("constantTimeEqual", () => {
    it("returns true for identical strings", () => {
      assert.equal(constantTimeEqual("hello", "hello"), true);
      assert.equal(constantTimeEqual("", ""), true);
    });

    it("returns false for different strings of same length", () => {
      assert.equal(constantTimeEqual("hello", "world"), false);
      assert.equal(constantTimeEqual("hello", "hellp"), false);
    });

    it("returns false for strings of different lengths", () => {
      assert.equal(constantTimeEqual("hello", "hello world"), false);
      assert.equal(constantTimeEqual("a", ""), false);
      assert.equal(constantTimeEqual("", "a"), false);
    });
  });

  describe("createSessionCookieValue", () => {
    it("creates a valid token with correct max age", async () => {
      const now = Date.now();
      const token = await createSessionCookieValue();

      const isValid = await verifySession(token);
      assert.equal(isValid, true);

      // Check expiry is roughly correct (+- 2 seconds to avoid flakiness)
      const expiry = Number(token.split(".")[0]);
      const expectedExpiry = now + ADMIN_COOKIE_MAX_AGE_SECONDS * 1000;
      assert.ok(
        Math.abs(expiry - expectedExpiry) < 2000,
        `expiry ${expiry} should be close to ${expectedExpiry}`
      );
    });
  });
});
