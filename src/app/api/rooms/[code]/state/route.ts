import { handle, json, requireSessionToken, roomCodeFrom } from "@/lib/server/http";
import { getSnapshot } from "@/lib/server/rooms";

/** The authoritative snapshot for this player (also used to reconnect). */
export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[code]/state">) {
  return handle(async () => {
    const code = await roomCodeFrom(ctx.params);
    const token = await requireSessionToken(code);
    return json(await getSnapshot(code, token));
  });
}
