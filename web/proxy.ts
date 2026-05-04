import { NextResponse, type NextRequest } from "next/server";

// Single-user basic auth for /admin/* and /api/admin/* per NEXT_STEPS Decision 2.
// Set ADMIN_USER and ADMIN_PASSWORD in .env.local; defaults are dev-only.
function expectedHeader(): string {
  const user = process.env.ADMIN_USER || "admin";
  const pw = process.env.ADMIN_PASSWORD || "changeme";
  return "Basic " + Buffer.from(`${user}:${pw}`).toString("base64");
}

export function proxy(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth === expectedHeader()) {
    return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Adresboek 1926 Admin"' },
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
