import { SubmitBody } from "@/lib/api-schemas";
import { assertSameOrigin, handle, json, readBody, requireSessionToken, roomCodeFrom } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getSnapshot, submitAnswer } from "@/lib/server/rooms";

/**
 * Lock in an answer. The response is the submitter's private acknowledgment
 * (it echoes their own word) plus their fresh snapshot.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/submit">) {
  return handle(async () => {
    assertSameOrigin(request);
    const code = await roomCodeFrom(ctx.params);
    const token = await requireSessionToken(code);
    const { round, word } = await readBody(request, SubmitBody);
    await enforceRateLimit("submit", token);
    const result = await submitAnswer(code, token, round, word);
    return json({ result, snapshot: await getSnapshot(code, token) });
  });
}
