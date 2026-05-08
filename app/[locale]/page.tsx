import { redirect } from "next/navigation";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  
  // First page of the Naamregister, localized.
  redirect(`/${locale}/page/1769_19525-1926_0121`);
}
