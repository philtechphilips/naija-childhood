import { notFound } from "next/navigation";

// Checked per request so production returns a real 404.
export const dynamic = "force-dynamic";
import { StreetPreview } from "@/components/dev/StreetPreview";

/** Development-only preview of the 3D street. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StreetPreview />;
}
