import { handle, json, requireSessionToken, roomCodeFrom } from "@/lib/server/http";
import { getSnapshot } from "@/lib/server/rooms";

/** Revealed rounds of the current (or just-won) match. Unrevealed rounds never appear. */
export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[code]/history">) {
  return handle(async () => {
    const code = await roomCodeFrom(ctx.params);
    const token = await requireSessionToken(code);
    const snapshot = await getSnapshot(code, token);
    return json({
      participants: snapshot.match?.participants ?? [],
      rounds: snapshot.match?.rounds ?? [],
    });
  });
}
