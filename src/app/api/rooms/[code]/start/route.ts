import { assertSameOrigin, handle, json, requireSessionToken, roomCodeFrom } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getSnapshot, startMatch } from "@/lib/server/rooms";

/** Start a match (or the next one, after a win). Host only. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/start">) {
  return handle(async () => {
    assertSameOrigin(request);
    const code = await roomCodeFrom(ctx.params);
    const token = await requireSessionToken(code);
    await enforceRateLimit("action", token);
    await startMatch(code, token);
    return json(await getSnapshot(code, token));
  });
}
