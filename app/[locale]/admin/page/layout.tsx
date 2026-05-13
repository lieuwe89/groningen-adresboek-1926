import AppShell from "@/components/AppShell";
import { AdminScope } from "@/lib/AdminContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminScope>
      <AppShell>{children}</AppShell>
    </AdminScope>
  );
}
