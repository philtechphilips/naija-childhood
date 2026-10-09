"use client";

import type { GameResult } from "@/games/types";
import { getGame } from "@/games/registry";
import { photoSrc } from "@/lib/photos";
import { fonts } from "@/games/core/canvas";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Renders a 1080×1350 score card (Instagram/WhatsApp-status friendly). */
export async function renderShareCard(result: GameResult, playerName: string): Promise<Blob> {
  const game = getGame(result.game);
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx || !game) throw new Error("Cannot render share card");
  const f = fonts();
  await document.fonts?.ready;

  ctx.fillStyle = "#0d1310";
  ctx.fillRect(0, 0, W, H);
  try {
    const img = await loadImage(photoSrc(game.photo, 1600));
    const scale = Math.max(W / img.width, (H * 0.68) / img.height);
    const iw = img.width * scale;
    const ih = img.height * scale;
    ctx.drawImage(img, (W - iw) / 2, 0, iw, ih);
  } catch {
    /* card still works without the photo */
  }
  const fade = ctx.createLinearGradient(0, H * 0.25, 0, H * 0.72);
  fade.addColorStop(0, "rgba(13,19,16,0)");
  fade.addColorStop(1, "rgba(13,19,16,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);

  const pad = 80;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = game.accent;
  ctx.font = `800 40px ${f.display}`;
  ctx.fillText(game.name.toUpperCase(), pad, H * 0.6);

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 220px ${f.display}`;
  ctx.fillText(result.score.toLocaleString(), pad - 8, H * 0.6 + 210);

  ctx.font = `600 46px ${f.body}`;
  ctx.fillStyle = "#f4f1ea";
  ctx.fillText(result.headline, pad, H * 0.6 + 300, W - pad * 2);
  ctx.font = `500 34px ${f.body}`;
  ctx.fillStyle = "rgba(244,241,234,0.7)";
  ctx.fillText(`— ${playerName}`, pad, H * 0.6 + 360);

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(pad, H - 150, W - pad * 2, 2);
  ctx.font = `800 38px ${f.display}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText("NAIJA CHILDHOOD", pad, H - 82);
  ctx.font = `500 30px ${f.body}`;
  ctx.fillStyle = "rgba(244,241,234,0.7)";
  ctx.textAlign = "right";
  ctx.fillText("Beat my score →", W - pad, H - 82);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

export async function shareResult(result: GameResult, playerName: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const game = getGame(result.game);
  const url = `${location.origin}/games/${result.game}`;
  const text = `I scored ${result.score.toLocaleString()} in ${game?.name ?? "Naija Childhood"}. ${result.headline} Can you beat me?`;
  const blob = await renderShareCard(result, playerName);
  const file = new File([blob], `naija-childhood-${result.game}.png`, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, url });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "downloaded";
}
