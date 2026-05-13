import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { ADMIN_COOKIE_NAME, verifySession } from "@/lib/admin-session";

const intlMiddleware = createMiddleware({
  locales: ["nl", "en"],
  defaultLocale: "nl",
  localePrefix: "always",
});

function localeFromPath(pathname: string): "nl" | "en" {
  const m = pathname.match(/^\/(nl|en)(?:\/|$)/);
  return (m?.[1] as "nl" | "en") || "nl";
}

function proxyPrefixFromRequest(req: NextRequest): string {
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    "";
  if (host.includes("playground.lieuwejongsma.nl")) return "/groningen-1926";
  return "";
}

function isAdminRoute(pathname: string): boolean {
  if (pathname.startsWith("/api/admin/login")) return false;
  if (pathname.startsWith("/api/admin/logout")) return false;
  if (pathname.match(/^\/(nl|en)\/login(?:\/|$)/)) return false;
  return Boolean(
    pathname.match(/^\/(nl|en)\/admin/) ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api/admin"),
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
      const prefix = proxyPrefixFromRequest(req);
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = `${prefix}/${locale}/login`;
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
