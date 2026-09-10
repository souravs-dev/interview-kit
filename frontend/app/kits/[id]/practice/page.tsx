import { AuthGate } from "@/components/AuthGate";
import { PracticeSession } from "@/components/kit/PracticeSession";

export default async function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AuthGate>
      <PracticeSession kitId={id} />
    </AuthGate>
  );
}
