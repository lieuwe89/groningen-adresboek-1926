/**
 * Edge-compatible HMAC session token for admin auth.
 *
 * Token format: ``<expiryMs>.<base64url(hmac-sha256(secret, expiryMs))>``
 *
 * Used by:
 * - `middleware.ts`                — calls `verifySession` per request.
 * - `app/api/admin/login/route.ts` — calls `signSession` to mint the cookie.
 * - `app/api/admin/logout/route.ts`— clears the cookie.
 *
 * The set of paths this protects is declared in `lib/adminRouteContract.ts`
 * (re-exported below for convenience).
 */

import { ADMIN_LOGIN_API_PATH } from "@/lib/adminRouteContract";

export { ADMIN_LOGIN_API_PATH };

export const ADMIN_COOKIE_NAME = "admin_session";
export const ADMIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("ADMIN_SECRET env var must be set (>=16 chars)");
  }
  return secret;
}

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const s = atob(input.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(expiryMs: number): Promise<string> {
  const key = await importKey(getSecret());
  const payload = new TextEncoder().encode(String(expiryMs));
  const sig = await crypto.subtle.sign("HMAC", key, payload);
  return `${expiryMs}.${b64urlEncode(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expiryStr = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  const expiryMs = Number(expiryStr);
  if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) return false;
  let sigBytes: Uint8Array;
  try {
    sigBytes = b64urlDecode(sigPart);
  } catch {
    return false;
  }
  const key = await importKey(getSecret());
  const payload = new TextEncoder().encode(expiryStr);
  try {
    return await crypto.subtle.verify("HMAC", key, sigBytes as BufferSource, payload);
  } catch {
    return false;
  }
}

export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export async function createSessionCookieValue(): Promise<string> {
  const expiry = Date.now() + ADMIN_COOKIE_MAX_AGE_SECONDS * 1000;
  return signSession(expiry);
}
