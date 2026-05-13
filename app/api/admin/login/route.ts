import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE_MAX_AGE_SECONDS,
  ADMIN_COOKIE_NAME,
  constantTimeEqual,
  createSessionCookieValue,
} from "@/lib/admin-session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const user = typeof (body as { user?: unknown })?.user === "string" ? (body as { user: string }).user : "";
  const pw = typeof (body as { pw?: unknown })?.pw === "string" ? (body as { pw: string }).pw : "";

  const expectedUser = process.env.ADMIN_USER || "";
  const expectedPw = process.env.ADMIN_PASSWORD || "";
  if (!expectedUser || !expectedPw) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const userOk = constantTimeEqual(user, expectedUser);
  const pwOk = constantTimeEqual(pw, expectedPw);
  if (!userOk || !pwOk) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = await createSessionCookieValue();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
  });
  return res;
}
