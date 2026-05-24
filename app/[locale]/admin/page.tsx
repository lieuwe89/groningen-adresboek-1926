/**
 * Admin home (redirect-only). Gated by `middleware.ts` via the
 * `/^\/(nl|en)\/admin/` pattern in `lib/adminRouteContract.ts`.
 */
import { redirect } from "next/navigation";

export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/admin/page/1769_19525-1926_0150`);
}
