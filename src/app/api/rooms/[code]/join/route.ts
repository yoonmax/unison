import { NicknameBody } from "@/lib/api-schemas";
import {
  assertSameOrigin,
  clientIdentity,
  handle,
  json,
  readBody,
  readSessionToken,
  roomCodeFrom,
  setSessionCookie,
} from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getSnapshot, joinRoom } from "@/lib/server/rooms";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/join">) {
  return handle(async () => {
    assertSameOrigin(request);
    const code = await roomCodeFrom(ctx.params);
    const { nickname } = await readBody(request, NicknameBody);

    // Already in this room from this browser (another tab, a double tap): reuse
    // the existing identity instead of creating a duplicate player.
    const existing = await readSessionToken(code);
    if (existing) {
      try {
        return json(await getSnapshot(code, existing));
      } catch {
        // Stale or left session: fall through and join fresh.
      }
    }

    await enforceRateLimit("joinRoom", clientIdentity(request));
    const { token } = await joinRoom(code, nickname);
    await setSessionCookie(code, token);
    return json(await getSnapshot(code, token), 201);
  });
}
