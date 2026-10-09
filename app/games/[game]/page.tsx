import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GAMES, getGame } from "@/games/registry";
import type { GameSlug } from "@/games/types";
import { GameScreen } from "@/components/game/GameScreen";
import { photoSrc } from "@/lib/photos";

export function generateStaticParams() {
  return GAMES.map((g) => ({ game: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const { game: slug } = await params;
  const game = getGame(slug);
  if (!game) return {};
  return {
    title: game.name,
    description: `${game.tagline} ${game.description}`,
    openGraph: { images: [photoSrc(game.photo, 960)] },
  };
}

export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  const { game: slug } = await params;
  if (!getGame(slug)) notFound();
  return (
    <Suspense>
      <GameScreen slug={slug as GameSlug} />
    </Suspense>
  );
}
