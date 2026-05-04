import { notFound } from "next/navigation";
import { listStems, loadPage, neighborStems } from "@/lib/data";
import Viewer from "./Viewer";

export default async function PageRoute(props: PageProps<"/page/[stem]">) {
  const { stem } = await props.params;
  const [data, allStems] = await Promise.all([loadPage(stem), listStems()]);
  if (!data) notFound();
  const { prev, next } = neighborStems(stem, allStems);
  return <Viewer stem={stem} data={data} prev={prev} next={next} />;
}
