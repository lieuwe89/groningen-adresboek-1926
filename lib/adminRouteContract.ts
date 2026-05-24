/**
 * Admin route protection contract.
 *
 * Single source of truth for which paths require an admin cookie session.
 * Runtime enforcement lives in `middleware.ts`; session mechanics live in
 * `lib/admin-session.ts`. Importing this module from anywhere that touches
 * the protected boundary keeps the contract grep-able and surfaces it in
 * static-analysis tools (codebase graphs, dependency reports).
 *
 * Consumers:
 * - `middleware.ts`                          — enforces protection.
 * - `app/api/admin/login/route.ts`           — issues the session cookie.
 * - `app/api/admin/logout/route.ts`          — clears the session cookie.
 * - `app/[locale]/login/page.tsx`            — POSTs credentials to the API.
 *
 * @see lib/admin-session.ts for cookie name, HMAC token format, verifier.
 */

/** Public API path that issues an admin session cookie on valid creds. */
export const ADMIN_LOGIN_API_PATH = "/api/admin/login";

/** Public API path that clears the admin session cookie. */
export const ADMIN_LOGOUT_API_PATH = "/api/admin/logout";

/**
 * Locale-prefixed login page pattern. Excluded from protection (otherwise
 * users could never reach the login form).
 */
export const ADMIN_LOCALE_LOGIN_PATTERN = /^\/(nl|en)\/login(?:\/|$)/;

/**
 * Patterns covering every protected route. Mix of `RegExp` (locale-aware UI
 * routes) and string prefixes (direct paths). `middleware.ts#isAdminRoute`
 * iterates this list.
 */
export const ADMIN_PROTECTED_PATTERNS: ReadonlyArray<RegExp | string> = [
  /^\/(nl|en)\/admin/,
  "/admin",
  "/api/admin",
];

/**
 * Paths under `/api/admin/*` that bypass protection so the login/logout
 * endpoints themselves stay reachable.
 */
export const ADMIN_BYPASS_PREFIXES: ReadonlyArray<string> = [
  ADMIN_LOGIN_API_PATH,
  ADMIN_LOGOUT_API_PATH,
];
