import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { ADMIN_COOKIE_NAME, verifySession } from "@/lib/admin-session";
import {
  ADMIN_BYPASS_PREFIXES,
  ADMIN_LOCALE_LOGIN_PATTERN,
  ADMIN_PROTECTED_PATTERNS,
} from "@/lib/adminRouteContract";

const intlMiddleware = createMiddleware({
  locales: ["nl", "en"],
  defaultLocale: "nl",
  localePrefix: "always",
});

function localeFromPath(pathname: string): "nl" | "en" {
  const m = pathname.match(/^\/(nl|en)(?:\/|$)/);
  return (m?.[1] as "nl" | "en") || "nl";
}

function isAdminRoute(pathname: string): boolean {
  if (ADMIN_BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) return false;
  if (ADMIN_LOCALE_LOGIN_PATTERN.test(pathname)) return false;
  return ADMIN_PROTECTED_PATTERNS.some((p) =>
    typeof p === "string" ? pathname.startsWith(p) : p.test(pathname),
  );
}

export default async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isAdminRoute(pathname)) {
    const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    const ok = await verifySession(token);
    if (!ok) {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      const locale = localeFromPath(pathname);
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = `/${locale}/login`;
      loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.next();
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: [
    "/",
    "/(nl|en)/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
