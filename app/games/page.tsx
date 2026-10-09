import type { Metadata } from "next";
import { GamesView } from "@/components/hub/GamesView";

export const metadata: Metadata = { title: "Games" };

export default function GamesPage() {
  return <GamesView />;
}
