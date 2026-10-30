import { handle, requireSessionToken, roomCodeFrom } from "@/lib/server/http";
import { roomBus } from "@/lib/server/realtime-local";
import { authenticate } from "@/lib/server/rooms";

const KEEPALIVE_MS = 15_000;

/**
 * Server-Sent Events transport for local / single-node deployments. Each event
 * is just `{ v, k }` — "the room is now at version v" — and the client fetches
 * its own snapshot. Supabase deployments use Realtime Broadcast instead.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[code]/stream">) {
  return handle(async () => {
    const code = await roomCodeFrom(ctx.params);
    const token = await requireSessionToken(code);
    const { roomId, version } = await authenticate(code, token);

    const bus = roomBus();
    await bus.ensureListening();

    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        };
        write(`retry: 2000\ndata: ${JSON.stringify({ v: version, k: "hello" })}\n\n`);
        const unsubscribe = bus.subscribe(roomId, (ping) => write(`data: ${JSON.stringify(ping)}\n\n`));
        const keepalive = setInterval(() => write(`: keepalive\n\n`), KEEPALIVE_MS);
        cleanup = () => {
          clearInterval(keepalive);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // already closed
          }
        };
        request.signal.addEventListener("abort", () => cleanup(), { once: true });
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  });
}
