/**
 * Admin route chrome. Every child page sits under the protection enforced
 * by `middleware.ts` (see `lib/adminRouteContract.ts` for the path patterns
 * and `lib/admin-session.ts` for the cookie verifier).
 */
import AppShell from "@/components/AppShell";
import { AdminScope } from "@/lib/AdminContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminScope>
      <AppShell>{children}</AppShell>
    </AdminScope>
  );
}
