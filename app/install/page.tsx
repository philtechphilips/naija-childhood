import type { Metadata } from "next";
import { InstallGuide } from "@/components/hub/InstallGuide";

export const metadata: Metadata = {
  title: "Add to Home Screen",
  description: "Put Naija Childhood on your phone's home screen: full screen, its own icon, and it works offline.",
};

export default function InstallPage() {
  return <InstallGuide />;
}
