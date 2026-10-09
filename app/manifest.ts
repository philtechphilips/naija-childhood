import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Naija Childhood",
    short_name: "Naija Childhood",
    description: "The childhood games you grew up playing — now on your phone.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0c1a12",
    theme_color: "#0c1a12",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Play Ten-Ten", url: "/games/ten-ten", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Daily challenge", url: "/challenges", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
