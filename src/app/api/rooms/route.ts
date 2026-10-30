import { NicknameBody } from "@/lib/api-schemas";
import { assertSameOrigin, clientIdentity, handle, json, readBody, setSessionCookie } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createRoom } from "@/lib/server/rooms";

/** Create a room; the creator becomes its host. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { nickname } = await readBody(request, NicknameBody);
    await enforceRateLimit("createRoom", clientIdentity(request));
    const { code, token } = await createRoom(nickname);
    await setSessionCookie(code, token);
    return json({ code }, 201);
  });
}
