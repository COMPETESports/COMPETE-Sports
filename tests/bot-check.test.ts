import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botReason, looksLikeBotName, HONEYPOT_FIELD, STARTED_FIELD } from '../src/lib/bot-check';

test('bot names: the random strings from 19 Nov, but not real names', () => {
  for (const n of ['KgwnusLAHGotzlHFdKBr', 'lBIEwqeVYLQHlemNJfQX', 'pErtmciMGHZzZKAr', 'nyxqfuSdSGUKXNAeOvkZlt'])
    assert.equal(looksLikeBotName(n), true, n);
  for (const n of ['Tom Heimrich', 'Tommy H.', 'McDonald', 'Jean-Luc', 'MacKenzie', 'DeShawn Williams', 'Christopher'])
    assert.equal(looksLikeBotName(n), false, n);
});

const form = (fields: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.set(k, v);
  return d;
};

test('bot reasons: honeypot, too fast, missing start, random name; a person passes', () => {
  const now = 1_000_000_000;
  const ok = { [STARTED_FIELD]: String(now - 20_000), display_name: 'Tom Heimrich' };
  assert.equal(botReason(form(ok), now), null);
  assert.equal(botReason(form({ ...ok, [HONEYPOT_FIELD]: 'x.com' }), now), 'honeypot');
  assert.equal(botReason(form({ ...ok, [STARTED_FIELD]: String(now - 500) }), now), 'too-fast');
  assert.equal(botReason(form({ display_name: 'Tom' }), now), 'no-start-time');
  assert.equal(botReason(form({ ...ok, display_name: 'KgwnusLAHGotzlHFdKBr' }), now), 'random-name');
});
