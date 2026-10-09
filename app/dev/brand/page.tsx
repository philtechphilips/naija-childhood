import { notFound } from "next/navigation";
import { BrandSheet } from "@/components/dev/BrandSheet";

// Checked per request so production returns a real 404.
export const dynamic = "force-dynamic";

/** Development-only: renders the logo and app icons for export. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BrandSheet />;
}
