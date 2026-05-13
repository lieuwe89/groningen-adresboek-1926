import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from 'next-intl/middleware';

// 1. Initialize next-intl middleware
const intlMiddleware = createMiddleware({
  locales: ['nl', 'en'],
  defaultLocale: 'nl',
  // Change to 'always' to ensure /nl is kept in the URL and avoids loops
  localePrefix: 'always'
});

// 2. Define Admin auth logic
function expectedHeader(): string {
  const user = process.env.ADMIN_USER || "admin";
  const pw = process.env.ADMIN_PASSWORD || "changeme";
  const header = "Basic " + Buffer.from(`${user}:${pw}`).toString("base64");
  console.log("Auth check — user:", user, "pw length:", pw.length, "header:", header.slice(0, 30) + "...");
  return header;
}

// 3. Combined proxy/middleware
export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Check if it's an admin route
  // The locale prefix might be present: /(nl|en)/admin/...
  const isAdminRoute = pathname.match(/^\/(nl|en)\/admin/) || pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  if (isAdminRoute) {
    const auth = req.headers.get("authorization");
    const expected = expectedHeader();
    const allHeaders: Record<string, string> = {};
    req.headers.forEach((v, k) => { allHeaders[k] = k === "authorization" ? v.slice(0, 30) + "..." : v.slice(0, 50); });
    console.log("Path:", pathname);
    console.log("All headers:", JSON.stringify(allHeaders));
    console.log("Incoming auth:", auth ? auth.slice(0, 30) + "..." : "NONE");
    console.log("Expected auth:", expected.slice(0, 30) + "...");
    console.log("Match:", auth === expected);
    if (auth !== expected) {
      return new NextResponse("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Adresboek 1926 Admin", charset="UTF-8"' },
      });
    }
  }

  // 4. Admin API routes: return early to avoid next-intl redirection
  if (pathname.startsWith('/api/admin')) {
    return NextResponse.next();
  }

  // 5. Fall through to intl middleware for localized routes
  return intlMiddleware(req);
}

export const config = {
  // Combine matchers: admin auth and i18n
  matcher: [
    '/', 
    '/(nl|en)/:path*', 
    '/admin/:path*', 
    '/api/admin/:path*'
  ]
};
