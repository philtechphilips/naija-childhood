import { notFound } from "next/navigation";

// Checked per request so production returns a real 404.
export const dynamic = "force-dynamic";
import { KeyArt } from "@/components/dev/KeyArt";

/** Development-only: renders the app's key art from the 3D game scenes. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KeyArt />;
}
