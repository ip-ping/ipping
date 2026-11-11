import type { Metadata } from "next";

import { ApiGuide } from "@/features/developers/api-guide";

export const metadata: Metadata = {
  title: "API",
  description: "Use ipping from your own scripts: start a measurement, read the result, look an address up.",
};

export default function DevelopersPage() {
  return <ApiGuide />;
}
