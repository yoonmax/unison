import { assertSameOrigin, handle, json, requireSessionToken, roomCodeFrom } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { endMatch, getSnapshot } from "@/lib/server/rooms";

/** End the current match without a result and return everyone to the lobby. Host only. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/end">) {
  return handle(async () => {
    assertSameOrigin(request);
    const code = await roomCodeFrom(ctx.params);
    const token = await requireSessionToken(code);
    await enforceRateLimit("action", token);
    await endMatch(code, token);
    return json(await getSnapshot(code, token));
  });
}
