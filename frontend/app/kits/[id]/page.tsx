import { AuthGate } from "@/components/AuthGate";
import { KitBuilder } from "@/components/kit/KitBuilder";

export default async function KitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AuthGate>
      <KitBuilder kitId={id} />
    </AuthGate>
  );
}
