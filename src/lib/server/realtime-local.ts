import "server-only";
import { db } from "./db";

// Local / self-hosted realtime transport. Database functions `pg_notify` on
// commit; this process LISTENs once and fans notifications out to the
// Server-Sent Event streams of the rooms it is serving. In Supabase deployments
// the same commits are delivered by Realtime Broadcast instead.

export interface RoomPing {
  v: number;
  k: string;
}

type Listener = (ping: RoomPing) => void;

class RoomBus {
  private listeners = new Map<string, Set<Listener>>();
  private listening: Promise<unknown> | null = null;

  ensureListening(): Promise<unknown> {
    if (!this.listening) {
      this.listening = db()
        .listen("unison_room", (payload) => {
          try {
            const { roomId, v, k } = JSON.parse(payload) as { roomId: string; v: number; k: string };
            this.listeners.get(roomId)?.forEach((fn) => fn({ v, k }));
          } catch {
            // Ignore malformed payloads; clients also reconcile via heartbeats.
          }
        })
        .catch((error) => {
          this.listening = null;
          throw error;
        });
    }
    return this.listening;
  }

  subscribe(roomId: string, fn: Listener): () => void {
    let set = this.listeners.get(roomId);
    if (!set) {
      set = new Set();
      this.listeners.set(roomId, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.listeners.delete(roomId);
    };
  }
}

const globalForBus = globalThis as unknown as { __unisonBus?: RoomBus };

export function roomBus(): RoomBus {
  globalForBus.__unisonBus ??= new RoomBus();
  return globalForBus.__unisonBus;
}
