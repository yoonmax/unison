import type { Phase, RevealedRound, RoomSnapshot } from "../types";

/**
 * Presentation phase derived from authoritative state plus server time. The
 * server decides *when* things happen (it stores opens_at / revealed_at); this
 * function only answers "what should be on screen at time t".
 *
 *   LOBBY → STARTING → COLLECTING → REVEALING → COLLECTING … → WON
 */
export function derivePhase(snapshot: RoomSnapshot, serverNowMs: number): Phase {
  const { match, room } = snapshot;
  if (!match || room.status === "lobby" || match.status === "abandoned") return "lobby";
  if (match.status === "won") return "won";
  const opensAt = Date.parse(match.currentRound.opensAt);
  if (serverNowMs < opensAt) {
    return match.currentRound.number === 1 ? "starting" : "revealing";
  }
  return "collecting";
}

/** The next moment (server ms) at which `derivePhase` changes on its own. */
export function nextPhaseBoundary(snapshot: RoomSnapshot, serverNowMs: number): number | null {
  const round = snapshot.match?.currentRound;
  if (!round || snapshot.match?.status !== "active") return null;
  const opensAt = Date.parse(round.opensAt);
  return opensAt > serverNowMs ? opensAt : null;
}

export function lastRevealedRound(snapshot: RoomSnapshot): RevealedRound | null {
  const rounds = snapshot.match?.rounds;
  return rounds && rounds.length > 0 ? rounds[rounds.length - 1] : null;
}
