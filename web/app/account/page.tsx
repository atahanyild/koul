import type { Metadata } from "next";
import { Tile, TileLabel } from "@/components/signal";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <Tile>
      <TileLabel>Account</TileLabel>
    </Tile>
  );
}
