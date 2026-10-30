import { GameError } from "@/lib/server/errors";
import { clientIdentity, handle, json, readSessionToken, roomCodeFrom } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { authenticate, previewRoom } from "@/lib/server/rooms";

/** Minimal public info for the join screen, plus whether this browser is already in. */
export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  return handle(async () => {
    const code = await roomCodeFrom(ctx.params);
    await enforceRateLimit("lookupRoom", clientIdentity(request));
    const preview = await previewRoom(code);
    const token = await readSessionToken(code);
    let member = false;
    let removed = false;
    if (token) {
      try {
        await authenticate(code, token);
        member = true;
      } catch (error) {
        removed = error instanceof GameError && error.code === "REMOVED";
      }
    }
    return json({ preview, member, removed });
  });
}
