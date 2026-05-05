import { notFound } from "next/navigation";
import { listStems, loadPage, neighborStems } from "@/lib/data";
import Viewer from "./Viewer";

export default async function PageRoute(props: PageProps<"/page/[stem]">) {
  const { stem } = await props.params;
  const { entry } = await props.searchParams;
  const [data, allStems] = await Promise.all([loadPage(stem), listStems()]);
  if (!data) notFound();
  const { prev, next } = neighborStems(stem, allStems);

  let initialIdx = 0;
  if (entry && typeof entry === "string") {
    const sep = entry.lastIndexOf(":");
    const s = sep > 0 ? entry.slice(0, sep) : "";
    const i = sep > 0 ? Number.parseInt(entry.slice(sep + 1), 10) : -1;
    if (s === stem && Number.isFinite(i) && i >= 0 && i < data.entries.length) {
      initialIdx = i;
    }
  }

  return (
    <Viewer
      stem={stem}
      data={data}
      prev={prev}
      next={next}
      initialIdx={initialIdx}
    />
  );
}
