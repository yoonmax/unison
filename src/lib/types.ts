// Shared, typed representation of what a player is allowed to see. The server
// builds one of these per viewer; it never contains another player's word for
// a round that has not been revealed.

export type PlayerColor = "lavender" | "mint" | "peach" | "sky" | "butter";

export type RoomStatus = "lobby" | "playing" | "finished";
export type MatchStatus = "active" | "won" | "abandoned";
export type ConnectionStatus = "connected" | "disconnected";

export interface PublicPlayer {
  id: string;
  nickname: string;
  color: PlayerColor;
  isHost: boolean;
  connection: ConnectionStatus;
  disconnectedAt: string | null;
  joinedAt: string;
}

export interface Participant {
  playerId: string;
  order: number;
  nickname: string;
  color: PlayerColor;
  /** False once the player has left the room (the match is then abandoned). */
  present: boolean;
}

export interface RevealedAnswer {
  playerId: string;
  word: string;
}

export interface RevealedRound {
  number: number;
  revealedAt: string;
  isUnison: boolean;
  /** Ordered by participant order. */
  answers: RevealedAnswer[];
}

export interface CurrentRound {
  number: number;
  status: "collecting" | "revealed" | "closed";
  opensAt: string;
  revealedAt: string | null;
  /** Who has locked in an answer — never what they answered. */
  submittedPlayerIds: string[];
  /** The viewer's own locked answer for this round, if any. */
  mySubmission: string | null;
}

export interface PublicMatch {
  id: string;
  status: MatchStatus;
  startedAt: string;
  completedAt: string | null;
  finalWord: string | null;
  participants: Participant[];
  currentRound: CurrentRound;
  /** Every revealed round so far, oldest first. */
  rounds: RevealedRound[];
}

export type NoticeKind =
  | "player_joined"
  | "player_left"
  | "player_removed"
  | "player_faded"
  | "player_returned"
  | "match_started"
  | "match_abandoned"
  | "match_ended";

export interface RoomNotice {
  id: number;
  at: string;
  kind: NoticeKind;
  playerId?: string;
  name?: string;
  names?: string[];
}

export interface RoomSnapshot {
  version: number;
  serverNow: string;
  room: {
    id: string;
    code: string;
    status: RoomStatus;
    hostPlayerId: string | null;
    /** Realtime topic for this room; only members learn it. */
    channel: string;
  };
  me: { id: string; nickname: string; color: PlayerColor };
  /** Players currently in the room, in joining order. */
  players: PublicPlayer[];
  /** The active match, or the just-won match while the room is "finished". */
  match: PublicMatch | null;
  notice: RoomNotice | null;
}

export interface RoomPreview {
  code: string;
  status: RoomStatus;
  playerCount: number;
  isFull: boolean;
  hostName: string | null;
}

export type Phase = "lobby" | "starting" | "collecting" | "revealing" | "won";

export interface ApiErrorBody {
  error: { code: string; message: string };
}
