// Realtime "doorbell": tells the client a room moved to a new version. The
// payload never contains game data — the client then fetches its own
// authorized snapshot. Supabase Realtime Broadcast when configured, otherwise
// Server-Sent Events from this app's own server.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RoomPing {
  v: number;
  k: string;
}

export type TransportStatus = "connecting" | "live" | "reconnecting";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabasePromise: Promise<SupabaseClient> | null = null;

function supabase(): Promise<SupabaseClient> {
  // Loaded lazily so local/SSE deployments never download the Supabase client.
  supabasePromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  );
  return supabasePromise;
}

export function realtimeMode(): "supabase" | "sse" {
  return SUPABASE_URL && SUPABASE_KEY ? "supabase" : "sse";
}

export function subscribeToRoom(
  code: string,
  channelName: string,
  onPing: (ping: RoomPing) => void,
  onStatus: (status: TransportStatus) => void,
): () => void {
  let closed = false;
  onStatus("connecting");

  if (realtimeMode() === "supabase") {
    let teardown = () => {};
    void supabase().then((client) => {
      if (closed) return;
      const channel = client
        .channel(channelName, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "state" }, ({ payload }) => onPing(payload as RoomPing))
        .subscribe((status) => {
          if (closed) return;
          if (status === "SUBSCRIBED") onStatus("live");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
            onStatus("reconnecting");
        });
      teardown = () => void client.removeChannel(channel);
    });
    return () => {
      closed = true;
      teardown();
    };
  }

  // EventSource reconnects on its own (server sends `retry: 2000`).
  const source = new EventSource(`/api/rooms/${code}/stream`);
  source.onopen = () => !closed && onStatus("live");
  source.onerror = () => !closed && onStatus("reconnecting");
  source.onmessage = (event) => {
    try {
      onPing(JSON.parse(event.data) as RoomPing);
    } catch {
      // ignore
    }
  };
  return () => {
    closed = true;
    source.close();
  };
}
