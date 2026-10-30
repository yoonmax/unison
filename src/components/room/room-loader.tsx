"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";
import { BreathingOrb, StatusScreen } from "../ui/status-screen";
import { JoinGate } from "./join-gate";
import { RoomExperience } from "./room-experience";
import { api, ApiError } from "@/lib/client/api";
import type { SessionLoss } from "@/lib/client/use-room-sync";
import { parseRoomCode } from "@/lib/game/room-code";
import type { RoomPreview, RoomSnapshot } from "@/lib/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "gate"; preview: RoomPreview }
  | { kind: "member"; snapshot: RoomSnapshot }
  | { kind: "blocked"; reason: "not_found" | "full" | "in_progress" | "removed" | "network" | "session_ended" };

export function RoomLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <BreathingOrb />
      <span className="sr-only">Finding your room…</span>
    </main>
  );
}

/**
 * Decides what this browser sees for /r/CODE: the room (existing session), the
 * nickname gate (invited), or a friendly dead end.
 */
export function RoomLoader() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = parseRoomCode(params.code ?? "");
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!code) return setState({ kind: "blocked", reason: "not_found" });
    try {
      const snapshot = await api.state(code);
      setState({ kind: "member", snapshot });
      return;
    } catch (error) {
      if (!(error instanceof ApiError)) return setState({ kind: "blocked", reason: "network" });
      if (error.code === "REMOVED") return setState({ kind: "blocked", reason: "removed" });
      if (error.code === "ROOM_NOT_FOUND" || error.code === "INVALID_CODE") {
        return setState({ kind: "blocked", reason: "not_found" });
      }
      if (error.code !== "SESSION_INVALID") return setState({ kind: "blocked", reason: "network" });
    }
    try {
      const { preview, removed } = await api.preview(code);
      if (removed) setState({ kind: "blocked", reason: "removed" });
      else if (preview.status === "playing") setState({ kind: "blocked", reason: "in_progress" });
      else if (preview.isFull) setState({ kind: "blocked", reason: "full" });
      else setState({ kind: "gate", preview });
    } catch (error) {
      setState({
        kind: "blocked",
        reason: error instanceof ApiError && error.code === "ROOM_NOT_FOUND" ? "not_found" : "network",
      });
    }
  }, [code]);

  useEffect(() => {
    if (code && params.code !== code) router.replace(`/r/${code}`);
    // Initial load is an async fetch; the state updates happen after it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [code, params.code, router, load]);

  const onSessionLost = useCallback((reason: SessionLoss) => {
    if (reason === "removed") setState({ kind: "blocked", reason: "removed" });
    else if (reason === "gone") setState({ kind: "blocked", reason: "not_found" });
    else setState({ kind: "blocked", reason: "session_ended" });
  }, []);

  const home = (
    <Button size="lg" onClick={() => router.push("/")}>
      Back home
    </Button>
  );

  switch (state.kind) {
    case "loading":
      return <RoomLoading />;
    case "gate":
      return (
        <JoinGate
          code={code!}
          preview={state.preview}
          onJoined={(snapshot) => setState({ kind: "member", snapshot })}
          onBlocked={(reason) => setState({ kind: "blocked", reason })}
        />
      );
    case "member":
      return (
        <RoomExperience
          key={state.snapshot.me.id}
          code={code!}
          initial={state.snapshot}
          onSessionLost={onSessionLost}
          onLeft={() => router.push("/")}
        />
      );
    case "blocked":
      switch (state.reason) {
        case "not_found":
          return (
            <StatusScreen
              orb="sky"
              title="This room has faded away."
              message="The code might be mistyped, or everyone already went home."
              actions={home}
            />
          );
        case "full":
          return (
            <StatusScreen
              orb="peach"
              title="This room is full."
              message="Unison is best with up to four minds."
              actions={home}
            />
          );
        case "in_progress":
          return (
            <StatusScreen
              orb="mint"
              title="These minds are already syncing."
              message="Join their next game — try again when this one ends."
              actions={
                <>
                  <Button size="lg" onClick={() => void load()}>
                    Check again
                  </Button>
                  <Button size="lg" variant="ghost" onClick={() => router.push("/")}>
                    Back home
                  </Button>
                </>
              }
            />
          );
        case "removed":
          return (
            <StatusScreen
              orb="peach"
              title="You were removed from this room."
              message="The host made some space. You can always start a room of your own."
              actions={home}
            />
          );
        case "session_ended":
          return (
            <StatusScreen
              title="Your seat in this room ended."
              message="You can rejoin if there's still space."
              actions={
                <>
                  <Button size="lg" onClick={() => void load()}>
                    Rejoin
                  </Button>
                  <Button size="lg" variant="ghost" onClick={() => router.push("/")}>
                    Back home
                  </Button>
                </>
              }
            />
          );
        case "network":
          return (
            <StatusScreen
              orb="sky"
              title="Someone's signal faded."
              message="We couldn't reach Unison. Check your connection and try again."
              actions={
                <Button size="lg" onClick={() => void load()}>
                  Try again
                </Button>
              }
            />
          );
      }
  }
}
