import { Metadata } from "next";
import MemberGrid from "@/components/MemberGrid";
import { listMembers } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Rajya Sabha Members | Cabinet News",
  description:
    "Browse all current Rajya Sabha Members of Parliament with verified news and profiles.",
};

export default async function RajyaSabhaPage() {
  const { members, total } = await listMembers({
    house: "rajya_sabha",
    page: 1,
    pageSize: 24,
  });

  const initialMembers = members.map((m) => ({
    ...m,
    party: Array.isArray(m.party) ? m.party[0] ?? null : m.party,
    state: Array.isArray(m.state) ? m.state[0] ?? null : m.state,
    constituency: Array.isArray(m.constituency)
      ? m.constituency[0] ?? null
      : m.constituency,
  }));

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Rajya Sabha</h1>
        <p className="mt-2 text-muted-foreground">
          Current Members of Parliament from the Council of States
        </p>
      </div>

      <MemberGrid
        house="rajya_sabha"
        initialMembers={initialMembers}
        initialTotal={total}
      />
    </main>
  );
}