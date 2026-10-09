import type { Metadata } from "next";
import { ChallengesView } from "@/components/hub/ChallengesView";

export const metadata: Metadata = { title: "Daily challenge" };

export default function ChallengesPage() {
  return <ChallengesView />;
}
