import {
  assertSameOrigin,
  clearSessionCookie,
  handle,
  json,
  requireSessionToken,
  roomCodeFrom,
} from "@/lib/server/http";
import { leaveRoom } from "@/lib/server/rooms";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/leave">) {
  return handle(async () => {
    assertSameOrigin(request);
    const code = await roomCodeFrom(ctx.params);
    const token = await requireSessionToken(code);
    await leaveRoom(code, token);
    await clearSessionCookie(code);
    return json({ ok: true });
  });
}
