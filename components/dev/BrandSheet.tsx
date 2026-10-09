"use client";

import { useEffect, useState } from "react";
import { Emblem, GameLogo } from "@/components/brand/Brand";

/** Development tool: ?asset=icon|maskable|favicon|logo renders one asset at exact size for screenshotting. */
export function BrandSheet() {
  const [asset, setAsset] = useState<string | null>(null);
  useEffect(() => setAsset(new URLSearchParams(location.search).get("asset")), []);
  const wrap = (child: React.ReactNode, bg = "transparent") => (
    <div id="asset" style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", background: bg }}>
      {child}
    </div>
  );
  if (asset === "icon") return wrap(<Emblem size={512} />);
  if (asset === "maskable") return wrap(<div style={{ width: 512, height: 512, background: "#0b6a3b", display: "grid", placeItems: "center" }}><Emblem size={400} rounded={false} /></div>);
  if (asset === "square") return wrap(<Emblem size={512} rounded={false} />);
  if (asset === "logo") return wrap(<GameLogo width={1040} />);
  return wrap(
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
      <GameLogo width={520} />
      <div style={{ display: "flex", gap: 24, alignItems: "end" }}>
        <Emblem size={256} />
        <Emblem size={96} />
        <Emblem size={48} />
        <Emblem size={32} />
        <Emblem size={16} />
      </div>
    </div>,
    "#0c1a12",
  );
}
