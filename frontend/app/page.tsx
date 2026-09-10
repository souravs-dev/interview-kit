import { AuthGate } from "@/components/AuthGate";
import { KitDashboard } from "@/components/KitDashboard";

export default function Home() {
  return (
    <AuthGate>
      <KitDashboard />
    </AuthGate>
  );
}
