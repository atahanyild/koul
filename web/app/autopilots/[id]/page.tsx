"use client";

import { use } from "react";
import { PageHeader } from "@/components/koul/primitives";
import { useAutopilot } from "@/hooks/use-autopilots";

export default function AutopilotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { autopilot } = useAutopilot(id);
  return <PageHeader eyebrow="Autopilot" title={autopilot?.name ?? "Autopilot"} />;
}
