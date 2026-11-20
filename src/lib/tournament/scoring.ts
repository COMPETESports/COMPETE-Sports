/**
 * Scoring rules and match results. Pure logic, no database.
 *
 * Tom, 19 Nov 2026: outdoor plays to 21, indoor to 25. Pool play is usually
 * one game, or two games to 17–21; it is rarely a full match. Leagues may
 * play best of three with all three played regardless (21, 21, 15).
 * Every rule here is the director's to change, at any time, for matches
 * not yet played.
 */

export interface GameRule {
  /** Points to win, e.g. 21. */
  target: number;
  /** 2 = win by two; 1 = first to the target wins. */
  winBy: 1 | 2;
  /** Hard ceiling, e.g. 25: first to it wins even by one. null = no cap. */
  cap: number | null;
}

export interface ScoringRule {
  /**
   * 'set_play'  every listed game is played and each counts on its own; a
   *             2-game match can be split 1–1, with no match winner.
   * 'best_of'   a match: the majority of games wins it.
   */
  mode: 'set_play' | 'best_of';
  /** One rule per game, in order. Best of 3 at 21, 21, 15 is three entries. */
  games: GameRule[];
  /** best_of only: keep playing after the match is decided (Tom's leagues). */
  playAll: boolean;
}

export const RULE_PRESETS = {
  /** Beach pool: one game to 21, win by 2, no cap. */
  oneGameTo21: { mode: 'set_play', games: [{ target: 21, winBy: 2, cap: null }], playAll: false },
  /** Indoor pool: one game to 25. */
  oneGameTo25: { mode: 'set_play', games: [{ target: 25, winBy: 2, cap: null }], playAll: false },
  /** Two games to 21, both count. */
  twoGamesTo21: {
    mode: 'set_play',
    games: [
      { target: 21, winBy: 2, cap: null },
      { target: 21, winBy: 2, cap: null },
    ],
    playAll: true,
  },
  /** Bracket: best of 3 — 21, 21, 15 — capped 25, 25, 17. */
  bestOf3: {
    mode: 'best_of',
    games: [
      { target: 21, winBy: 2, cap: 25 },
      { target: 21, winBy: 2, cap: 25 },
      { target: 15, winBy: 2, cap: 17 },
    ],
    playAll: false,
  },
} satisfies Record<string, ScoringRule>;

export type Side = 'a' | 'b';

export type GameCheck =
  | { ok: true; winner: Side }
  | { ok: false; error: string };

/** Is a rule itself sensible? */
export function ruleProblem(rule: GameRule): string | null {
  if (!Number.isInteger(rule.target) || rule.target < 1) return 'The target must be a whole number above zero.';
  if (rule.cap !== null && rule.cap < rule.target) return 'A cap cannot be below the target.';
  if (rule.cap !== null && rule.winBy === 1 && rule.cap !== rule.target)
    return 'Without win-by-two the game ends at the target, so a higher cap never applies.';
  return null;
}

/**
 * Could a game under this rule really have ended at this score?
 *
 * 21–19 ends a win-by-2 game to 21; 22–19 cannot (it ended at 21–19); 23–21
 * can; 24–21 cannot (it ended at 23–21). With a cap of 25, 25–24 is legal.
 */
export function checkGame(rule: GameRule, a: number, b: number): GameCheck {
  const problem = ruleProblem(rule);
  if (problem) return { ok: false, error: problem };
  if (![a, b].every((n) => Number.isInteger(n) && n >= 0))
    return { ok: false, error: 'Scores are whole numbers, zero or more.' };
  if (a === b) return { ok: false, error: 'A game cannot end tied.' };

  const winner: Side = a > b ? 'a' : 'b';
  const w = Math.max(a, b);
  const l = Math.min(a, b);

  if (rule.cap !== null && w > rule.cap) return { ok: false, error: `The cap is ${rule.cap}.` };
  if (rule.cap !== null && w === rule.cap && l === rule.cap - 1 && rule.cap > rule.target)
    return { ok: true, winner }; // reached the cap
  if (w < rule.target) return { ok: false, error: `Nobody has reached ${rule.target} yet.` };

  if (rule.winBy === 1) {
    return w === rule.target
      ? { ok: true, winner }
      : { ok: false, error: `First to ${rule.target} wins, so the game ended at ${rule.target}.` };
  }
  if (w - l < 2) return { ok: false, error: 'This game is win by two.' };
  if (w > rule.target && w - l !== 2)
    return { ok: false, error: `The game was over at ${l + 2}–${l}.` };
  return { ok: true, winner };
}

export interface GameScore {
  a: number;
  b: number;
}

export interface MatchResult {
  gamesA: number;
  gamesB: number;
  pointsA: number;
  pointsB: number;
  /** null when a set-play match is split, e.g. 1–1. */
  winner: Side | null;
  /** True when the rule's games are all played (or a best-of is decided). */
  complete: boolean;
}

export type MatchCheck = { ok: true; result: MatchResult } | { ok: false; error: string; game?: number };

/**
 * Check every game and total the match.
 *
 * `override` is the director's: a game ended early for time or weather is
 * recorded as played, without the score having to be a legal finish.
 */
export function checkMatch(rule: ScoringRule, games: GameScore[], override = false): MatchCheck {
  if (games.length > rule.games.length)
    return { ok: false, error: `This match has at most ${rule.games.length} games.` };

  let gamesA = 0, gamesB = 0, pointsA = 0, pointsB = 0;
  const needed = Math.floor(rule.games.length / 2) + 1;

  for (let i = 0; i < games.length; i++) {
    const { a, b } = games[i];
    if (rule.mode === 'best_of' && !rule.playAll && (gamesA === needed || gamesB === needed))
      return { ok: false, error: 'The match was already decided before this game.', game: i };

    let winner: Side | null;
    if (override) {
      winner = a === b ? null : a > b ? 'a' : 'b';
    } else {
      const g = checkGame(rule.games[i], a, b);
      if (!g.ok) return { ok: false, error: `Game ${i + 1}: ${g.error}`, game: i };
      winner = g.winner;
    }
    if (winner === 'a') gamesA++;
    if (winner === 'b') gamesB++;
    pointsA += a;
    pointsB += b;
  }

  let winner: Side | null = null;
  let complete: boolean;
  if (rule.mode === 'best_of') {
    if (gamesA >= needed) winner = 'a';
    if (gamesB >= needed) winner = 'b';
    complete = rule.playAll ? games.length === rule.games.length : winner !== null;
  } else {
    complete = games.length === rule.games.length;
    if (gamesA !== gamesB) winner = gamesA > gamesB ? 'a' : 'b';
  }
  return { ok: true, result: { gamesA, gamesB, pointsA, pointsB, winner, complete } };
}
