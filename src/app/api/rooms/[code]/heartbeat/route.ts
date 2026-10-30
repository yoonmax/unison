import { HeartbeatBody } from "@/lib/api-schemas";
import { assertSameOrigin, handle, json, readBody, requireSessionToken, roomCodeFrom } from "@/lib/server/http";
import { heartbeat } from "@/lib/server/rooms";

/**
 * Liveness ping. `claim` makes this tab the player's active one (a newer tab
 * replaces older ones). The returned version lets clients notice missed
 * realtime messages and resync.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/heartbeat">) {
  return handle(async () => {
    assertSameOrigin(request);
    const code = await roomCodeFrom(ctx.params);
    const token = await requireSessionToken(code);
    const { connectionId, claim } = await readBody(request, HeartbeatBody);
    return json(await heartbeat(code, token, connectionId, claim));
  });
}
