import { KickBody } from "@/lib/api-schemas";
import { assertSameOrigin, handle, json, readBody, requireSessionToken, roomCodeFrom } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getSnapshot, removePlayer } from "@/lib/server/rooms";

/** Remove a player from the lobby (not during a match). Host only. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/kick">) {
  return handle(async () => {
    assertSameOrigin(request);
    const code = await roomCodeFrom(ctx.params);
    const token = await requireSessionToken(code);
    const { playerId } = await readBody(request, KickBody);
    await enforceRateLimit("action", token);
    await removePlayer(code, token, playerId);
    return json(await getSnapshot(code, token));
  });
}
