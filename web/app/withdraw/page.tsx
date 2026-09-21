import type { Metadata } from "next";
import { Tile, TileLabel } from "@/components/signal";

export const metadata: Metadata = { title: "Withdraw" };

export default function WithdrawPage() {
  return (
    <Tile>
      <TileLabel>Withdraw</TileLabel>
    </Tile>
  );
}
