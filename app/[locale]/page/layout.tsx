import AppShell from "@/components/AppShell";

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
