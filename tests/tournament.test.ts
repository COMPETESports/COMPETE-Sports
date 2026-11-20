import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGame, checkMatch, RULE_PRESETS, ruleProblem } from '../src/lib/tournament/scoring';
import { poolSplits, snake, randomDraw, moveTeam, swapTeams } from '../src/lib/tournament/pools';
import { poolSchedule, scheduleStats, setWorkTeam } from '../src/lib/tournament/round-robin';

const to21 = { target: 21, winBy: 2 as const, cap: null };
const to21cap25 = { target: 21, winBy: 2 as const, cap: 25 };

test('scoring: legal and impossible finishes, win by two', () => {
  assert.deepEqual(checkGame(to21, 21, 19), { ok: true, winner: 'a' });
  assert.deepEqual(checkGame(to21, 21, 0), { ok: true, winner: 'a' });
  assert.deepEqual(checkGame(to21, 23, 25), { ok: true, winner: 'b' });
  assert.equal(checkGame(to21, 21, 20).ok, false); // not by two
  assert.equal(checkGame(to21, 22, 19).ok, false); // ended at 21-19
  assert.equal(checkGame(to21, 24, 21).ok, false); // ended at 23-21
  assert.equal(checkGame(to21, 20, 18).ok, false); // nobody at 21
  assert.equal(checkGame(to21, 21, 21).ok, false);
});

test('scoring: a cap ends the game by one', () => {
  assert.deepEqual(checkGame(to21cap25, 25, 24), { ok: true, winner: 'a' });
  assert.deepEqual(checkGame(to21cap25, 25, 23), { ok: true, winner: 'a' });
  assert.equal(checkGame(to21cap25, 26, 24).ok, false);
});

test('scoring: first to the target, no win by two', () => {
  const r = { target: 16, winBy: 1 as const, cap: null };
  assert.deepEqual(checkGame(r, 16, 15), { ok: true, winner: 'a' });
  assert.equal(checkGame(r, 17, 15).ok, false);
  assert.equal(ruleProblem({ target: 21, winBy: 2, cap: 19 }) !== null, true);
});

test('matches: two games split 1-1 has no winner; best of 3 stops when decided', () => {
  const split = checkMatch(RULE_PRESETS.twoGamesTo21, [{ a: 21, b: 15 }, { a: 18, b: 21 }]);
  assert.ok(split.ok);
  assert.equal(split.ok && split.result.winner, null);
  assert.equal(split.ok && split.result.pointsA, 39);

  const bo3 = checkMatch(RULE_PRESETS.bestOf3, [{ a: 21, b: 18 }, { a: 25, b: 24 }]);
  assert.ok(bo3.ok && bo3.result.winner === 'a' && bo3.result.complete);
  assert.equal(checkMatch(RULE_PRESETS.bestOf3, [{ a: 21, b: 18 }, { a: 21, b: 18 }, { a: 15, b: 3 }]).ok, false);

  // Tom's leagues: play all three regardless.
  const all3 = { ...RULE_PRESETS.bestOf3, playAll: true };
  const r = checkMatch(all3, [{ a: 21, b: 18 }, { a: 21, b: 18 }, { a: 13, b: 15 }]);
  assert.ok(r.ok && r.result.winner === 'a' && r.result.gamesB === 1 && r.result.complete);
});

test('matches: director override records a game stopped for time', () => {
  assert.equal(checkMatch(RULE_PRESETS.oneGameTo21, [{ a: 17, b: 14 }]).ok, false);
  const r = checkMatch(RULE_PRESETS.oneGameTo21, [{ a: 17, b: 14 }], true);
  assert.ok(r.ok && r.result.winner === 'a');
});

test('pools: splits prefer fours, then fives', () => {
  assert.deepEqual(poolSplits(8)[0], [4, 4]);
  assert.deepEqual(poolSplits(9)[0], [5, 4]);
  assert.deepEqual(poolSplits(12)[0], [4, 4, 4]);
  assert.deepEqual(poolSplits(10)[0], [5, 5]);
  assert.ok(poolSplits(11).some((s) => s.join() === '4,4,3'));
});

test('pools: snake seeding', () => {
  assert.deepEqual(snake([1, 2, 3, 4, 5, 6, 7, 8], [4, 4]), [[1, 4, 5, 8], [2, 3, 6, 7]]);
  assert.deepEqual(snake([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [4, 4, 4]), [
    [1, 6, 7, 12],
    [2, 5, 8, 11],
    [3, 4, 9, 10],
  ]);
  const uneven = snake([1, 2, 3, 4, 5, 6, 7, 8, 9], [5, 4]);
  assert.deepEqual(uneven.map((p) => p.length), [5, 4]);
  assert.throws(() => snake([1, 2, 3], [4]));
});

test('pools: random draw is repeatable; moves and swaps', () => {
  const teams = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  assert.deepEqual(randomDraw(teams, [4, 4], 7), randomDraw(teams, [4, 4], 7));
  const pools = [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']];
  assert.deepEqual(moveTeam(pools, 'a', 1), [['b', 'c', 'd'], ['e', 'f', 'g', 'h', 'a']]);
  assert.deepEqual(swapTeams(pools, 'a', 'h'), [['h', 'b', 'c', 'd'], ['e', 'f', 'g', 'a']]);
  assert.throws(() => moveTeam(pools, 'z', 0));
});

test('schedules: the standard pool of four', () => {
  const s = poolSchedule(4);
  assert.deepEqual(s.map((m) => `${m.a}v${m.b}(${m.work})`).join(' '), '1v3(2) 2v4(1) 1v4(3) 2v3(1) 3v4(2) 1v2(4)');
  const stats = scheduleStats(4, s);
  assert.deepEqual(stats.plays, [3, 3, 3, 3]);
  assert.ok(stats.longestRun <= 2);
  assert.ok(stats.works.every((w) => w >= 1));
});

for (const size of [3, 5, 6, 7, 8]) {
  test(`schedules: pool of ${size} — everyone once, nobody three in a row, 1v2 last, fair work`, () => {
    const s = poolSchedule(size);
    const stats = scheduleStats(size, s);
    assert.equal(stats.matches, (size * (size - 1)) / 2);
    assert.ok(stats.plays.every((p) => p === size - 1));
    assert.ok(stats.longestRun <= 2, `longest run ${stats.longestRun}`);
    const last = s[s.length - 1];
    assert.deepEqual([last.a, last.b], [1, 2]);
    const pairs = new Set(s.map((m) => `${m.a}-${m.b}`));
    assert.equal(pairs.size, s.length);
    assert.ok(s.every((m) => m.work !== m.a && m.work !== m.b));
    assert.ok(Math.max(...stats.works) - Math.min(...stats.works) <= 1, `work ${stats.works}`);
  });
}

test('schedules: work teams off, and changing one', () => {
  assert.ok(poolSchedule(4, { workTeams: false }).every((m) => m.work === null));
  const s = setWorkTeam(poolSchedule(4), 0, 4);
  assert.equal(s[0].work, 4);
  assert.throws(() => setWorkTeam(s, 0, 1));
});
