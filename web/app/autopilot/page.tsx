import type { Metadata } from "next";
import { Tile, TileLabel } from "@/components/signal";

export const metadata: Metadata = { title: "Autopilot" };

export default function AutopilotPage() {
  return (
    <Tile>
      <TileLabel>Autopilot</TileLabel>
    </Tile>
  );
}
