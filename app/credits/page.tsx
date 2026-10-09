import type { Metadata } from "next";
import { ASSET_CREDITS } from "@/lib/photos";
import page from "@/components/hub/page.module.css";

export const metadata: Metadata = { title: "Credits" };

export default function CreditsPage() {
  return (
    <div className={page.page}>
      <header>
        <h1 className={page.title}>Credits</h1>
        <p className={page.lede}>
          The street, the people and every image in the app are rendered in real time by the game. Characters were adapted to Nigerian skin tones and
          school uniforms; the street, signboards, danfos and kekes are built for Naija Childhood. Thank you to these open libraries.
        </p>
      </header>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {ASSET_CREDITS.map((c) => (
          <li key={c.url} className={page.card}>
            <p className="eyebrow">{c.what}</p>
            <p style={{ fontWeight: 700, marginTop: 4 }}>
              <a href={c.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
                {c.source}
              </a>
            </p>
            <p style={{ color: "var(--muted)", fontSize: 14 }}>
              by {c.author} ·{" "}
              <a href={c.licenseUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
                {c.license}
              </a>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
