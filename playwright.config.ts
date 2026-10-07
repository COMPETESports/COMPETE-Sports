import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load .env.local, then .env, into the test process.
 *
 * Next.js loads these itself for the app, but Playwright is a separate
 * process and does not — so a test reading process.env.ADMIN_PASSWORD got
 * `undefined` and failed with "value: expected string, got undefined",
 * which looks nothing like the missing-configuration problem it actually
 * is. The suite used to pass only because the shell that started it
 * happened to have exported the variable, which made the result depend on
 * how it was invoked rather than on the code.
 *
 * Hand-rolled rather than pulling in dotenv: this is a dozen lines, and a
 * test harness is a bad place to add a dependency.
 *
 * .env.local wins over .env, matching Next's own precedence. Neither file
 * existing is fine — a real environment may supply these directly.
 */
function loadEnvFile(name: string) {
  let text: string;
  try {
    text = readFileSync(resolve(process.cwd(), name), 'utf8');
  } catch {
    return; // absent is not an error
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq < 1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    // Strip one matching pair of surrounding quotes, if present.
    if (value.length > 1 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }

    // Never clobber a variable the environment already set deliberately.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

/**
 * Fail loudly and early on missing configuration rather than letting it
 * surface four tests later as a confusing locator error.
 */
for (const key of ['ADMIN_PASSWORD', 'DATABASE_URL']) {
  if (!process.env[key]) {
    throw new Error(
      `${key} is not set. Playwright reads it from .env.local or .env in the ` +
        `project root, or from the environment. Copy .env.example and fill it in.`,
    );
  }
}

export default defineConfig({
  testDir: './tests',
  // Only .spec.ts. Playwright's default pattern also matches *.test.ts, which
  // swept up tests/parse-listing.test.ts — a node:test file — and ran it as a
  // single opaque Playwright "test" that printed its own TAP output into the
  // middle of the report. The two suites run separately on purpose:
  //   npx playwright test            — browser
  //   npx tsx --test tests/*.test.ts — units
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'off',
  },
});
