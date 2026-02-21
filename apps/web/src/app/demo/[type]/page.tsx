import { DemoSession } from "../components/DemoSession";

interface PageProps {
  params: Promise<{ type: string }>;
}

function formatType(type: string): string {
  return type
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function DemoTypePage({ params }: PageProps) {
  const { type } = await params;

  return (
    <DemoSession
      generatorType={type}
      title={formatType(type)}
      backHref="/demo"
      backLabel="← All types"
    />
  );
}
