import { Tile, TileLabel } from "@/components/signal";

export default function HomePage() {
  return (
    <Tile tone="lime">
      <TileLabel className="text-on-lime">Balance</TileLabel>
    </Tile>
  );
}
