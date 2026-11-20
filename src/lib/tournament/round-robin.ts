/**
 * Pool play schedules: everyone plays everyone once, on one court, with an
 * optional work (ref) team for each match. Pure logic, no database.
 *
 * Teams are numbered by their place in the pool, 1 = top seed. The order
 * is built so that no team plays three in a row, the top two seeds meet
 * last (the match that means the most), and work duty is spread evenly.
 *
 * Work teams are ON by default for every surface (Tom, 19 Nov), and the
 * director can switch them off or change any assignment.
 */

export interface PoolMatch {
  /** 1-based seed numbers within the pool. */
  a: number;
  b: number;
  /** Who refs; null when work teams are off. */
  work: number | null;
}

/**
 * The standard four-team order (Sportime and most club schedules):
 * 1v3 (2), 2v4 (1), 1v4 (3), 2v3 (1), 3v4 (2), 1v2 (4).
 */
const FOUR: PoolMatch[] = [
  { a: 1, b: 3, work: 2 },
  { a: 2, b: 4, work: 1 },
  { a: 1, b: 4, work: 3 },
  { a: 2, b: 3, work: 1 },
  { a: 3, b: 4, work: 2 },
  { a: 1, b: 2, work: 4 },
];

const THREE: PoolMatch[] = [
  { a: 1, b: 3, work: 2 },
  { a: 2, b: 3, work: 1 },
  { a: 1, b: 2, work: 3 },
];

export function poolSchedule(size: number, opts: { workTeams?: boolean } = {}): PoolMatch[] {
  const workTeams = opts.workTeams ?? true;
  if (!Number.isInteger(size) || size < 2 || size > 8)
    throw new Error('Pools are 2 to 8 teams.');

  let matches: PoolMatch[];
  if (size === 2) matches = [{ a: 1, b: 2, work: null }];
  else if (size === 3) matches = THREE.map((m) => ({ ...m }));
  else if (size === 4) matches = FOUR.map((m) => ({ ...m }));
  else matches = assignWork(orderMatches(size), size);

  return workTeams ? matches : matches.map((m) => ({ ...m, work: null }));
}

/** Every pairing, ordered so nobody plays three in a row and 1 v 2 is last. */
function orderMatches(size: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 1; i <= size; i++) for (let j = i + 1; j <= size; j++) pairs.push([i, j]);
  const last: [number, number] = [1, 2];
  const pool = pairs.filter(([x, y]) => !(x === 1 && y === 2));
  const order: [number, number][] = [];
  const played = new Map<number, number>();

  const inRow = (team: number) => {
    let n = 0;
    for (let k = order.length - 1; k >= 0 && (order[k][0] === team || order[k][1] === team); k--) n++;
    return n;
  };

  const solve = (left: [number, number][]): boolean => {
    if (!left.length) {
      // 1 v 2 goes last; neither may be on a two-match run.
      return inRow(1) < 2 && inRow(2) < 2;
    }
    // Teams who have played least, and are rested, go first.
    const ranked = [...left].sort((p, q) => {
      const cost = ([x, y]: [number, number]) =>
        (played.get(x) ?? 0) + (played.get(y) ?? 0) + 3 * (inRow(x) + inRow(y));
      return cost(p) - cost(q) || p[0] - q[0] || p[1] - q[1];
    });
    for (const pair of ranked) {
      if (inRow(pair[0]) >= 2 || inRow(pair[1]) >= 2) continue;
      order.push(pair);
      played.set(pair[0], (played.get(pair[0]) ?? 0) + 1);
      played.set(pair[1], (played.get(pair[1]) ?? 0) + 1);
      if (solve(left.filter((p) => p !== pair))) return true;
      order.pop();
      played.set(pair[0], played.get(pair[0])! - 1);
      played.set(pair[1], played.get(pair[1])! - 1);
    }
    return false;
  };

  if (!solve(pool)) throw new Error(`No fair order found for a pool of ${size}.`);
  return [...order, last];
}

/**
 * The work team for each match: someone not playing it, with the fewest
 * duties so far; ideally a team that just played (it is already on the
 * court) and does not play next.
 */
function assignWork(order: [number, number][], size: number): PoolMatch[] {
  const duty = new Map<number, number>();
  return order.map(([a, b], i) => {
    const prev = order[i - 1] ?? [];
    const next = order[i + 1] ?? [];
    let best = -1;
    let bestScore = Infinity;
    for (let t = 1; t <= size; t++) {
      if (t === a || t === b) continue;
      const score =
        (duty.get(t) ?? 0) * 10 +
        (prev.includes(t) ? 0 : 2) +
        (next.includes(t) ? 3 : 0) +
        t / 100; // stable tie-break
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    duty.set(best, (duty.get(best) ?? 0) + 1);
    return { a, b, work: best };
  });
}

export interface ScheduleStats {
  matches: number;
  /** Matches each team plays (index = seed). */
  plays: number[];
  /** Work duties per team. */
  works: number[];
  /** Longest run of back-to-back matches any team plays. */
  longestRun: number;
}

/** The checks a director (or a test) wants on a schedule. */
export function scheduleStats(size: number, matches: PoolMatch[]): ScheduleStats {
  const plays = Array(size + 1).fill(0);
  const works = Array(size + 1).fill(0);
  let longestRun = 0;
  const run = Array(size + 1).fill(0);
  for (const m of matches) {
    plays[m.a]++;
    plays[m.b]++;
    if (m.work !== null) works[m.work]++;
    for (let t = 1; t <= size; t++) {
      run[t] = t === m.a || t === m.b ? run[t] + 1 : 0;
      longestRun = Math.max(longestRun, run[t]);
    }
  }
  return { matches: matches.length, plays: plays.slice(1), works: works.slice(1), longestRun };
}

/** Change one match's work team (e.g. let the travelling team go home). */
export function setWorkTeam(matches: PoolMatch[], index: number, work: number | null): PoolMatch[] {
  const m = matches[index];
  if (!m) throw new Error('There is no such match.');
  if (work !== null && (work === m.a || work === m.b))
    throw new Error('A team cannot ref its own match.');
  return matches.map((x, i) => (i === index ? { ...x, work } : x));
}
