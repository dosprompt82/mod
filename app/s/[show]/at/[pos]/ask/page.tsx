import { Ask } from "../../../../../../components/Ask";
export default async function AskPage({ params }: { params: Promise<{ show: string; pos: string }> }) {
  const { show, pos } = await params;
  return <Ask show={show} pos={pos} />;
}
