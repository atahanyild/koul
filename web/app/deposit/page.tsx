import type { Metadata } from "next";
import { Tile, TileLabel } from "@/components/signal";

export const metadata: Metadata = { title: "Deposit" };

export default function DepositPage() {
  return (
    <Tile>
      <TileLabel>Deposit</TileLabel>
    </Tile>
  );
}
