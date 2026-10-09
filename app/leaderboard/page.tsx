import type { Metadata } from "next";
import { LeaderboardView } from "@/components/hub/LeaderboardView";

export const metadata: Metadata = { title: "Leaderboards" };

export default function LeaderboardPage() {
  return <LeaderboardView />;
}
