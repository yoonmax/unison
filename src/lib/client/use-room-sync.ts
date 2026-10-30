"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HEARTBEAT_INTERVAL_MS } from "../game/constants";
import { derivePhase, nextPhaseBoundary } from "../game/phase";
import type { Phase, RoomSnapshot } from "../types";
import { api, ApiError } from "./api";
import { subscribeToRoom, type TransportStatus } from "./realtime";

export type SessionLoss = "removed" | "invalid" | "gone";

export interface RoomSync {
  snapshot: RoomSnapshot;
  phase: Phase;
  /** Current server time in ms (local clock corrected by measured offset). */
  serverNow: () => number;
  /** False while realtime or HTTP is failing and we are retrying. */
  online: boolean;
  superseded: boolean;
  sessionLost: SessionLoss | null;
  apply: (snapshot: RoomSnapshot, timing?: { sent: number; received: number }) => void;
  refresh: () => Promise<void>;
  claimTab: () => void;
}

function newConnectionId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Keeps one player's view in sync with the server.
 *
 *  - Snapshots are applied only if their version is not older than what we
 *    have, so out-of-order responses and notifications can't roll state back.
 *  - Realtime pings carry only a version; a newer one triggers a refetch.
 *  - Heartbeats report liveness, claim this tab, and double as a safety net:
 *    if the server's version is ahead (a missed ping), we refetch.
 *  - Failures retry with exponential backoff; returning to the tab resyncs.
 */
export function useRoomSync(code: string, initial: RoomSnapshot): RoomSync {
  const [snapshot, setSnapshot] = useState(initial);
  const versionRef = useRef(initial.version);
  const offsetRef = useRef(0);
  const [clock, setClock] = useState(() => Date.parse(initial.serverNow));
  const [transport, setTransport] = useState<TransportStatus>("connecting");
  const [httpHealthy, setHttpHealthy] = useState(true);
  const [superseded, setSuperseded] = useState(false);
  const [sessionLost, setSessionLost] = useState<SessionLoss | null>(null);
  const [claimNonce, setClaimNonce] = useState(0);

  const connectionIdRef = useRef<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttempt = useRef(0);
  const hadTransportDrop = useRef(false);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  const apply = useCallback((next: RoomSnapshot, timing?: { sent: number; received: number }) => {
    if (timing) {
      // Midpoint estimate of the server clock relative to ours.
      offsetRef.current = Date.parse(next.serverNow) - (timing.sent + timing.received) / 2;
    }
    if (next.version < versionRef.current) return;
    versionRef.current = next.version;
    setSnapshot(next);
    setClock(Date.now() + offsetRef.current);
  }, []);

  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const handleFailure = useCallback((error: unknown) => {
    if (error instanceof ApiError) {
      if (error.code === "REMOVED") return setSessionLost("removed");
      if (error.code === "SESSION_INVALID") return setSessionLost("invalid");
      if (error.code === "ROOM_NOT_FOUND") return setSessionLost("gone");
    }
    setHttpHealthy(false);
    if (retryTimer.current) return;
    const delay = Math.min(15_000, 1_000 * 2 ** retryAttempt.current);
    retryAttempt.current += 1;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      void refreshRef.current();
    }, delay);
  }, []);

  const refresh = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    const run = async () => {
      do {
        again.current = false;
        const sent = Date.now();
        try {
          const next = await api.state(code);
          apply(next, { sent, received: Date.now() });
          setHttpHealthy(true);
          retryAttempt.current = 0;
        } catch (error) {
          handleFailure(error);
          return;
        }
      } while (again.current);
    };
    inflight.current = run().finally(() => {
      inflight.current = null;
    });
    return inflight.current;
  }, [apply, code, handleFailure]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Measure the clock offset once on mount with a real round trip.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Realtime doorbell.
  const channel = snapshot.room.channel;
  useEffect(() => {
    if (sessionLost) return;
    return subscribeToRoom(
      code,
      channel,
      (ping) => {
        if (ping.v > versionRef.current) void refreshRef.current();
      },
      (status) => {
        setTransport(status);
        if (status === "reconnecting") hadTransportDrop.current = true;
        if (status === "live" && hadTransportDrop.current) {
          hadTransportDrop.current = false;
          // Catch up on anything we missed while disconnected.
          void refreshRef.current();
        }
      },
    );
  }, [code, channel, sessionLost]);

  // Heartbeats + resync on return.
  useEffect(() => {
    if (superseded || sessionLost) return;
    connectionIdRef.current ??= newConnectionId();
    const connectionId = connectionIdRef.current;
    let claim = true;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const beat = async () => {
      clearTimeout(timer);
      try {
        const result = await api.heartbeat(code, connectionId, claim);
        claim = false;
        setHttpHealthy(true);
        if (result.superseded) {
          setSuperseded(true);
          return;
        }
        if (result.version > versionRef.current) void refreshRef.current();
      } catch (error) {
        handleFailure(error);
      }
      if (!stopped) timer = setTimeout(beat, HEARTBEAT_INTERVAL_MS);
    };
    void beat();

    const resync = () => {
      if (document.visibilityState !== "visible") return;
      void beat();
      void refreshRef.current();
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", resync);
    window.addEventListener("pageshow", resync);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", resync);
      window.removeEventListener("pageshow", resync);
    };
  }, [code, superseded, sessionLost, claimNonce, handleFailure]);

  // Re-render exactly when the presentation phase changes on its own
  // (intro → collecting, reveal → next round). No polling.
  useEffect(() => {
    const boundary = nextPhaseBoundary(snapshot, clock);
    if (boundary === null) return;
    const timer = setTimeout(() => setClock(Date.now() + offsetRef.current), Math.max(0, boundary - clock) + 20);
    return () => clearTimeout(timer);
  }, [snapshot, clock]);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  const claimTab = useCallback(() => {
    setSuperseded(false);
    setClaimNonce((n) => n + 1);
    void refreshRef.current();
  }, []);

  return {
    snapshot,
    phase: derivePhase(snapshot, clock),
    serverNow,
    online: httpHealthy && transport !== "reconnecting",
    superseded,
    sessionLost,
    apply,
    refresh,
    claimTab,
  };
}
