"use client";

import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AmbientBackground } from "../ambient-background";
import { GameView } from "../game/game-view";
import { VictoryView } from "../game/victory-view";
import { useSound } from "../providers";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { AnnouncerProvider, ReconnectBanner, Toast, useAnnounce } from "../ui/feedback";
import { LobbyView } from "./lobby-view";
import { TopBar } from "./top-bar";
import { api, ApiError } from "@/lib/client/api";
import { useRoomSync, type SessionLoss } from "@/lib/client/use-room-sync";
import { agreementLine } from "@/lib/game/clusters";
import { NOTICE_TTL_MS } from "@/lib/game/constants";
import { lastRevealedRound } from "@/lib/game/phase";
import type { Phase, PublicPlayer, RoomNotice, RoomSnapshot } from "@/lib/types";

function noticeMessage(notice: RoomNotice, meId: string): string | null {
  switch (notice.kind) {
    case "player_joined":
      return notice.playerId === meId ? null : `${notice.name} joined.`;
    case "player_left":
      return `${notice.name} left the room.`;
    case "player_removed":
      return `${notice.name} was removed from the room.`;
    case "player_faded":
      return notice.names?.length === 1 ? `${notice.names[0]}'s signal faded.` : "Someone's signal faded.";
    case "player_returned":
      return notice.playerId === meId ? null : `${notice.name} is back.`;
    case "match_abandoned":
      return `${notice.name} left, so this game ended. Regroup and go again.`;
    case "match_ended":
      return `${notice.name ?? "The host"} ended the game.`;
    default:
      return null;
  }
}

export function RoomExperience(props: {
  code: string;
  initial: RoomSnapshot;
  onSessionLost: (reason: SessionLoss) => void;
  onLeft: () => void;
}) {
  return (
    <AnnouncerProvider>
      <RoomInner {...props} />
    </AnnouncerProvider>
  );
}

function RoomInner({
  code,
  initial,
  onSessionLost,
  onLeft,
}: {
  code: string;
  initial: RoomSnapshot;
  onSessionLost: (reason: SessionLoss) => void;
  onLeft: () => void;
}) {
  const sync = useRoomSync(code, initial);
  const { snapshot, phase, serverNow } = sync;
  const { play } = useSound();
  const announce = useAnnounce();

  const me = snapshot.me;
  const match = snapshot.match;
  const isHost = snapshot.room.hostPlayerId === me.id;
  const host = snapshot.players.find((p) => p.isHost) ?? null;

  const [lobbyAfterWin, setLobbyAfterWin] = useState<string | null>(null);
  const view: Phase = phase === "won" && match && lobbyAfterWin === match.id ? "lobby" : phase;

  const [confirm, setConfirm] = useState<null | "leave" | "end" | { remove: PublicPlayer }>(null);
  const [busy, setBusy] = useState<null | "start" | "end" | "leave" | "remove">(null);
  const [errorToast, setErrorToast] = useState<{ id: number; message: string } | null>(null);

  // ---- Notices → toasts (derived; dismissed by timer) ------------------------
  const [dismissedNotice, setDismissedNotice] = useState(() => {
    const n = initial.notice;
    return n && Date.parse(initial.serverNow) - Date.parse(n.at) > NOTICE_TTL_MS ? n.id : 0;
  });
  const notice = snapshot.notice && snapshot.notice.id > dismissedNotice ? snapshot.notice : null;
  const noticeText = notice ? noticeMessage(notice, me.id) : null;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setDismissedNotice(notice.id), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!errorToast) return;
    const timer = setTimeout(() => setErrorToast(null), 4000);
    return () => clearTimeout(timer);
  }, [errorToast]);

  useEffect(() => {
    if (sync.sessionLost) onSessionLost(sync.sessionLost);
  }, [sync.sessionLost, onSessionLost]);

  // ---- Sounds + screen reader narration on authoritative changes -------------
  const prev = useRef({
    phase,
    players: snapshot.players.length,
    round: match?.currentRound.number ?? 0,
    submitted: new Set(match?.currentRound.submittedPlayerIds ?? []),
  });
  useEffect(() => {
    const before = prev.current;
    const round = match?.currentRound;
    const submitted = new Set(round?.submittedPlayerIds ?? []);

    if (snapshot.players.length > before.players && phase === "lobby") {
      play("join");
      const newest = snapshot.players[snapshot.players.length - 1];
      if (newest && newest.id !== me.id) announce(`${newest.nickname} joined the room.`);
    }
    if (round && round.number === before.round && phase === "collecting") {
      for (const id of submitted) {
        if (before.submitted.has(id) || id === me.id) continue;
        const who = match?.participants.find((p) => p.playerId === id);
        play("ready");
        if (who) announce(`${who.nickname} is ready.`);
      }
    }
    if (phase !== before.phase) {
      const last = lastRevealedRound(snapshot);
      if (phase === "starting" && match) announce("New game. Everyone, think of any word.");
      if (phase === "revealing" && last) {
        play("reveal", last.answers.length);
        const words = last.answers
          .map((a) => `${match?.participants.find((p) => p.playerId === a.playerId)?.nickname ?? "Someone"}: ${a.word}`)
          .join(", ");
        announce(`Round ${last.number} revealed. ${words}. ${agreementLine(last.answers, last.number)}`);
      }
      if (phase === "collecting" && round) {
        announce(
          round.number === 1 ? "Round 1. Type any word." : `Round ${round.number}. Where do your thoughts meet?`,
        );
      }
      if (phase === "won" && match) {
        play("reveal", match.participants.length);
        announce(`Unison! Everyone said ${match.finalWord}, in ${match.rounds.length} rounds.`);
      }
    }
    prev.current = { phase, players: snapshot.players.length, round: round?.number ?? 0, submitted };
  }, [snapshot, phase, match, me.id, play, announce]);

  // ---- Actions ---------------------------------------------------------------
  const run = useCallback(
    async (kind: NonNullable<typeof busy>, action: () => Promise<RoomSnapshot>) => {
      setBusy(kind);
      try {
        const sent = Date.now();
        const next = await action();
        sync.apply(next, { sent, received: Date.now() });
        return true;
      } catch (error) {
        setErrorToast({
          id: Date.now(),
          message: error instanceof ApiError ? error.message : "That didn't go through.",
        });
        void sync.refresh();
        return false;
      } finally {
        setBusy(null);
      }
    },
    [sync],
  );

  const start = () => run("start", () => api.start(code));

  const submit = async (round: number, word: string) => {
    const sent = Date.now();
    try {
      const response = await api.submit(code, round, word);
      sync.apply(response.snapshot, { sent, received: Date.now() });
    } catch (error) {
      // The round may have moved on under us; resync, then surface the message inline.
      void sync.refresh();
      throw error;
    }
  };

  async function confirmAction() {
    if (confirm === "end") {
      if (await run("end", () => api.end(code))) setConfirm(null);
    } else if (confirm === "leave") {
      setBusy("leave");
      try {
        await api.leave(code);
      } catch {
        // Even if the request failed, the player wants out.
      }
      onLeft();
    } else if (confirm && "remove" in confirm) {
      const target = confirm.remove;
      if (await run("remove", () => api.kick(code, target.id))) setConfirm(null);
    }
  }

  const inMatch = view === "starting" || view === "collecting" || view === "revealing";
  const toastMessage = errorToast?.message ?? noticeText;

  return (
    <main className="safe-x safe-top safe-bottom relative flex min-h-dvh flex-col items-center">
      <AmbientBackground intensity="quiet" />
      <ReconnectBanner online={sync.online} />
      <div className="relative z-10 flex w-full max-w-[40rem] flex-1 flex-col items-center">
        <TopBar
          code={snapshot.room.code}
          round={
            !match
              ? null
              : view === "revealing" || view === "won"
                ? match.rounds.length
                : inMatch
                  ? match.currentRound.number
                  : null
          }
          startedAt={inMatch || view === "won" ? (match?.startedAt ?? null) : null}
          completedAt={match?.completedAt ?? null}
          serverNow={serverNow}
          canEnd={isHost && inMatch}
          onEnd={() => setConfirm("end")}
          onLeave={() => setConfirm("leave")}
        />

        <AnimatePresence mode="wait">
          {view === "lobby" && (
            <LobbyView
              key="lobby"
              snapshot={snapshot}
              isHost={isHost}
              starting={busy === "start"}
              onStart={start}
              onRemove={(player) => setConfirm({ remove: player })}
              onLeave={() => setConfirm("leave")}
              lastMatch={match?.status === "won" ? match : null}
            />
          )}
          {inMatch && match && (
            <GameView
              key={`game-${match.id}`}
              snapshot={snapshot}
              phase={view as "starting" | "collecting" | "revealing"}
              serverNow={serverNow}
              isHost={isHost}
              onSubmit={submit}
              onEndRequest={() => setConfirm("end")}
            />
          )}
          {view === "won" && match && (
            <VictoryView
              key={`won-${match.id}`}
              match={match}
              serverNow={serverNow}
              isHost={isHost}
              hostName={host?.nickname ?? null}
              starting={busy === "start"}
              onPlayAgain={start}
              onBackToLobby={() => setLobbyAfterWin(match.id)}
            />
          )}
        </AnimatePresence>
      </div>

      <Toast message={toastMessage} toastKey={errorToast?.id ?? notice?.id ?? null} />

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm === "end"
            ? "End this game for everyone?"
            : confirm === "leave"
              ? inMatch
                ? "Leave mid-game?"
                : "Leave this room?"
              : confirm
                ? `Remove ${confirm.remove.nickname}?`
                : ""
        }
        body={
          confirm === "end"
            ? "No one wins this one — you'll all head back to the lobby and can start fresh."
            : confirm === "leave"
              ? inMatch
                ? "The game will end for everyone, since Unison needs every mind."
                : "You can rejoin with the link while there's space."
              : confirm
                ? "They can rejoin with the link if there's space."
                : null
        }
        confirmLabel={confirm === "end" ? "End game" : confirm === "leave" ? "Leave" : "Remove"}
        destructive
        busy={busy === "end" || busy === "leave" || busy === "remove"}
        onConfirm={confirmAction}
        onClose={() => setConfirm(null)}
      />

      {sync.superseded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-paper/85 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="superseded-title"
        >
          <div className="max-w-[22rem] text-center">
            <h2 id="superseded-title" className="font-display text-[24px] font-[540] tracking-[-0.02em]">
              Unison is open in another tab.
            </h2>
            <p className="mt-2 text-[15px] text-ink-soft">You can only play from one place at a time.</p>
            <Button size="lg" className="mt-6 w-full" onClick={sync.claimTab} autoFocus>
              Play here instead
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
