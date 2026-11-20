/**
 * Splitting teams into pools. Pure logic, no database.
 *
 * Tom: pools of 4 are the most common, then 5, then 6. The engine proposes;
 * the director moves teams before locking (pool strength, friends, travel).
 */

/** The ways n teams can be split into pools of 3–8, best first. */
export function poolSplits(teamCount: number, opts: { min?: number; max?: number } = {}): number[][] {
  const min = opts.min ?? 3;
  const max = opts.max ?? 8;
  if (teamCount < 2) return [];
  if (teamCount < min) return [[teamCount]];

  const options: number[][] = [];
  for (let pools = 1; pools <= Math.floor(teamCount / min); pools++) {
    const base = Math.floor(teamCount / pools);
    const extra = teamCount % pools;
    const sizes = Array.from({ length: pools }, (_, i) => base + (i < extra ? 1 : 0));
    if (sizes.every((s) => s >= min && s <= max)) options.push(sizes);
  }
  // How far from the pool of 4 Tom prefers; 4 beats 5 beats 6 beats 3.
  const pref = (s: number) => ({ 4: 0, 5: 1, 6: 2, 3: 3 } as Record<number, number>)[s] ?? 4 + Math.abs(s - 4);
  const score = (sizes: number[]) => sizes.reduce((sum, s) => sum + pref(s), 0) / sizes.length;
  return options.sort((x, y) => score(x) - score(y) || x.length - y.length);
}

/**
 * Snake seeding: ranked teams spread evenly. Two pools of four from seeds
 * 1–8: A = 1, 4, 5, 8 and B = 2, 3, 6, 7. `sizes` may be uneven (4 + 5);
 * a full pool is skipped as the snake passes.
 */
export function snake<T>(seeded: T[], sizes: number[]): T[][] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total !== seeded.length) throw new Error(`Pool sizes add to ${total}, but there are ${seeded.length} teams.`);
  const pools: T[][] = sizes.map(() => []);
  let i = 0;
  let forward = true;
  for (const team of seeded) {
    // Find the next pool along the snake with room.
    for (;;) {
      const idx = forward ? i : sizes.length - 1 - i;
      const room = pools[idx].length < sizes[idx];
      i++;
      if (i === sizes.length) {
        i = 0;
        forward = !forward;
      }
      if (room) {
        pools[idx].push(team);
        break;
      }
    }
  }
  return pools;
}

/** A small seeded random generator, so a draw can be repeated exactly. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** A random draw, for adult events with no seeds. Repeatable by seed. */
export function randomDraw<T>(teams: T[], sizes: number[], seed: number): T[][] {
  const rand = seededRandom(seed);
  const shuffled = [...teams];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return snake(shuffled, sizes);
}

/** Move one team into another pool (the director's drag). Returns new pools. */
export function moveTeam<T>(pools: T[][], team: T, toPool: number, position?: number): T[][] {
  if (toPool < 0 || toPool >= pools.length) throw new Error('There is no such pool.');
  const next = pools.map((p) => p.filter((t) => t !== team));
  if (next.flat().length === pools.flat().length) throw new Error('That team is not in any pool.');
  const target = next[toPool];
  target.splice(position ?? target.length, 0, team);
  return next;
}

/** Swap two teams between (or within) pools. */
export function swapTeams<T>(pools: T[][], x: T, y: T): T[][] {
  return pools.map((p) => p.map((t) => (t === x ? y : t === y ? x : t)));
}
