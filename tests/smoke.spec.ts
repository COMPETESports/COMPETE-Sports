import { test, expect } from '@playwright/test';

/**
 * End-to-end checks over the real application and a real database.
 * These cover the Phase 1 acceptance criteria that can be automated.
 */

test('a visitor can browse events without signing in', async ({ page }) => {
  await page.goto('/events');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('event');
  await expect(page.locator('a[href^="/events/"]').first()).toBeVisible();
});

test('the homepage leads with featured, local and the map', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Featured events' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Events near you' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Browse the country' })).toBeVisible();

  // Every card in the rail is labelled, and only a real staff pick may carry
  // the "Featured" label — filler says what it is. Asserted as a contract
  // over whichever the database happens to hold, because a test that only
  // passes while somebody has hand-featured an event is a test that breaks
  // on a fresh install rather than on a bug.
  // innerText comes back as rendered, and the chips are styled uppercase.
  const labels = page.getByTestId('rail-label');
  await expect(labels.first()).toBeVisible();
  for (const text of await labels.allInnerTexts()) {
    expect(['FEATURED', 'WORTH A LOOK']).toContain(text.trim().toUpperCase());
  }
  const picks = page.locator('[data-testid="rail-label"].chip-featured');
  for (const pick of await picks.allInnerTexts()) {
    expect(pick.trim().toUpperCase()).toBe('FEATURED');
  }

  // The map is on the homepage now, not two clicks in.
  await expect(page.locator('svg path')).toHaveCount(51);
});

test('a ZIP typed on the homepage fills Local and is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Tell us where you play')).toBeVisible();

  await page.getByLabel('Your ZIP code or city').fill('60614');
  await page.getByRole('button', { name: /Show my area/ }).click();

  await expect(page.getByText(/Within 100 miles of/)).toBeVisible();
  const local = page.locator('section', { hasText: 'Events near you' }).locator('.card');
  expect(await local.count()).toBeGreaterThan(0);

  // Still there on a fresh visit.
  await page.goto('/');
  await expect(page.getByText(/Within 100 miles of/)).toBeVisible();
});

test('location search narrows results and reports the place it matched', async ({ page }) => {
  await page.goto('/events?near=60614');
  await expect(page.getByText(/Within \d+ miles of/)).toBeVisible();
  await expect(page.getByText(/Chicago/).first()).toBeVisible();
});

test('an unrecognised location is reported rather than silently ignored', async ({ page }) => {
  await page.goto('/events?near=zzzznotaplace');
  await expect(page.getByText(/couldn.t find/i)).toBeVisible();
});

test('ticking a filter updates results and shows a removable pill', async ({ page }) => {
  await page.goto('/events');
  const before = await page.getByRole('heading', { name: /\d+ events?/ }).textContent();

  // Clicking the label is what a person does; the input itself is visually
  // hidden and driven by the label, as a native checkbox should be.
  await page.locator('label.facet', { hasText: 'Beach' }).first().click();
  await page.waitForURL(/surface=beach/);

  const after = await page.getByRole('heading', { name: /\d+ events?/ }).textContent();
  expect(after).not.toEqual(before);
  await expect(page.locator('.pill').first()).toContainText('beach');
});

test('an event detail page shows the core details, a map link and a calendar link', async ({
  page,
}) => {
  await page.goto('/events');
  await page.locator('a[href^="/events/"]').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Who can play')).toBeVisible();
  await expect(page.getByRole('link', { name: /Add to calendar/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open in maps/ })).toBeVisible();
  await expect(page.getByText('Adult recreational event', { exact: true })).toBeVisible();
});

test('admin pages are closed to the public', async ({ page }) => {
  await page.goto('/admin/events');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a wrong staff password is rejected', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Staff password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('form [role="alert"]')).toContainText(/not right/i);
});

test('staff can create an event and it appears in public discovery', async ({ page }) => {
  const stamp = Date.now();
  const name = `Playwright Test Classic ${stamp}`;

  await page.goto('/admin');
  await page.getByLabel('Staff password').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/events/);

  await page.getByRole('link', { name: '+ New event' }).click();
  await page.getByLabel('Event name').fill(name);

  const future = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel('Start date').fill(future);
  await page.getByLabel('Entry fee').fill('65');
  await page.getByLabel('Venue name').fill('Forest Park Sand Courts');
  await page.getByLabel('Street address').fill('5595 Grand Dr');
  await page.getByLabel('City').fill('St. Louis');
  await page.getByLabel('State').fill('MO');
  await page.getByLabel('ZIP code').fill('63112');
  await page.getByLabel('Organizer name').fill('COMPETE Test Org');

  await page.locator('label.toggle-chip', { hasText: /^Beach$/ }).click();
  await page.locator('label.toggle-chip', { hasText: /^Men's Doubles$/ }).click();
  await page.locator('label.toggle-chip', { hasText: /^BB$/ }).click();
  await page.getByLabel('Status').selectOption('approved');

  await page.getByRole('button', { name: /Create event/ }).click();
  await expect(page.locator('form [role="status"]')).toContainText('Event created');

  // It must now be findable by a player searching near that venue.
  await page.goto('/events?near=63112&radius=25');
  await expect(page.getByText(name)).toBeVisible();
});

test('required fields are enforced when creating an event', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Staff password').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/events/);
  await page.goto('/admin/events/new');

  await page.getByLabel('Event name').fill('Missing Everything Else');
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel('Start date').fill(future);
  await page.getByLabel('Venue name').fill('Nowhere Park');
  await page.getByLabel('City').fill('Springfield');
  await page.getByLabel('State').fill('IL');

  await page.getByRole('button', { name: /Create event/ }).click();
  await expect(page.locator('form [role="status"]')).toContainText('need fixing');
});

test('paste-and-parse fills the form from a pasted post, and it saves', async ({ page }) => {
  const stamp = Date.now();
  const name = `Paste Parse Classic ${stamp}`;

  await page.goto('/admin');
  await page.getByLabel('Staff password').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/events/);
  await page.goto('/admin/events/new');

  const future = new Date(Date.now() + 60 * 86400000);
  const y = future.getUTCFullYear();
  const m = String(future.getUTCMonth() + 1).padStart(2, '0');
  const d = String(future.getUTCDate()).padStart(2, '0');

  await page.getByLabel('Event announcement text').fill(
    `${name}\n` +
      `${m}/${d}/${String(y).slice(2)}\n` +
      `Forest Park Sand Courts, St. Louis, MO 63112\n` +
      `Beach\n` +
      `Men's Doubles & Women's Doubles\n` +
      `Divisions: AA / A / BB\n` +
      `Entry: $45 per player\n` +
      `Check-in 8:00am`,
  );
  await page.getByRole('button', { name: /Read it and fill the form/ }).click();

  // The form should now carry the parsed values.
  await expect(page.getByLabel('Event name')).toHaveValue(name);
  await expect(page.getByLabel('Start date')).toHaveValue(`${y}-${m}-${d}`);
  await expect(page.getByLabel('Entry fee')).toHaveValue('45');
  await expect(page.getByLabel('City')).toHaveValue('St. Louis');
  await expect(page.getByLabel('State')).toHaveValue('MO');
  await expect(page.getByLabel('ZIP code')).toHaveValue('63112');
  await expect(page.getByLabel('Venue name')).toHaveValue('Forest Park Sand Courts');

  // Auto-filled fields are marked so they get checked.
  await expect(page.getByText('from paste').first()).toBeVisible();

  // And the parsed selections are ticked.
  await expect(page.locator('label.toggle-chip', { hasText: /^Beach$/ }).locator('input')).toBeChecked();
  await expect(page.locator('label.toggle-chip', { hasText: /^Men's Doubles$/ }).locator('input')).toBeChecked();
  await expect(page.locator('label.toggle-chip', { hasText: /^AA$/ }).locator('input')).toBeChecked();

  await page.getByLabel('Status').selectOption('approved');
  await page.getByRole('button', { name: /Create event/ }).click();
  await expect(page.locator('form [role="status"]')).toContainText('Event created');

  await page.goto('/events?near=63112&radius=25');
  await expect(page.getByText(name)).toBeVisible();
});

test('parsing nothing useful leaves the form empty rather than guessing', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Staff password').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/events/);
  await page.goto('/admin/events/new');

  await page
    .getByLabel('Event announcement text')
    .fill('Tournament coming soon. Stay tuned for details!!');
  await page.getByRole('button', { name: /Read it and fill the form/ }).click();

  await expect(page.getByLabel('Event name')).toHaveValue('');
  await expect(page.getByLabel('Start date')).toHaveValue('');
  await expect(page.getByLabel('City')).toHaveValue('');
  await expect(page.getByRole('status')).toContainText('Still needs you');
});

test('Communities lists the sports and links to the live one', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Communities' }).first().click();
  await expect(page).toHaveURL(/\/communities$/);

  await expect(page.getByRole('heading', { name: /Pick your sport/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Volleyball' })).toBeVisible();

  // A sport with no listings is shown but is not a link into an empty map.
  await expect(page.getByRole('heading', { name: 'Pickleball' })).toBeVisible();
  await expect(page.locator('a[href="/communities/pickleball"]')).toHaveCount(0);

  await page.locator('a[href="/communities/volleyball"]').click();
  await expect(page).toHaveURL(/\/communities\/volleyball$/);
});

test('the map shows every state and links only the ones with events', async ({ page }) => {
  await page.goto('/communities/volleyball');

  // All 50 states plus DC are drawn.
  await expect(page.locator('svg path')).toHaveCount(51);

  // States with data are links; empty ones are not.
  const ohio = page.locator('a[aria-label^="Ohio"]').first();
  await expect(ohio).toHaveAttribute('href', '/communities/volleyball/oh');
  await expect(page.locator('a[aria-label^="Montana"]')).toHaveCount(0);

  // A dormant state is still reachable, and says so.
  await expect(page.locator('a[aria-label^="Florida"]').first()).toHaveAttribute(
    'aria-label',
    /no events scheduled right now/,
  );

  // The legend explains the shading.
  await expect(page.getByText('Community here, nothing scheduled').first()).toBeVisible();
});

test('choosing a state on the map filters discovery to that state', async ({ page }) => {
  await page.goto('/communities/volleyball');
  await page.locator('a[aria-label^="Illinois"]').first().click();

  // The map zooms into the state first, then hands off to the list.
  await expect(page).toHaveURL(/\/communities\/volleyball\/il$/);
  await page.getByRole('link', { name: /See all Illinois events as a list/ }).click();

  await expect(page).toHaveURL(/\/events\?.*state=IL/);
  await expect(page.getByText('In Illinois')).toBeVisible();

  // It appears as a removable pill, like every other filter.
  const pill = page.locator('.pill', { hasText: 'Illinois' });
  await expect(pill).toBeVisible();

  // Every result really is in Illinois.
  const cards = page.locator('a[href^="/events/"]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await expect(cards.nth(i)).toContainText(', IL');
  }

  // And removing the pill widens the search again.
  await pill.click();
  await expect(page).not.toHaveURL(/state=IL/);
});

test('a state filter survives ticking another filter', async ({ page }) => {
  await page.goto('/events?state=OH');
  await expect(page.getByText('In Ohio')).toBeVisible();

  const firstFacet = page.locator('label.facet').first();
  await firstFacet.click();

  await expect(page).toHaveURL(/state=OH/);
  await expect(page.getByText('In Ohio')).toBeVisible();
});

test('an unknown sport community is a 404, not an empty page', async ({ page }) => {
  const res = await page.goto('/communities/curling');
  expect(res?.status()).toBe(404);
});

test('the state view zooms in and places events geographically', async ({ page }) => {
  await page.goto('/communities/volleyball/il');

  await expect(page.getByRole('heading', { name: /Volleyball in Illinois/ })).toBeVisible();

  // The frame is the state's own bounding box, not the whole country.
  const viewBox = await page.locator('svg').first().getAttribute('viewBox');
  const [, , w, h] = (viewBox ?? '').split(' ').map(Number);
  expect(w).toBeLessThan(975);
  expect(h).toBeLessThan(610);

  // Pins carry a spoken label and sit inside the frame.
  const pin = page.locator('svg a[aria-label]').first();
  await expect(pin).toHaveAttribute('aria-label', /event/);

  const circle = pin.locator('circle').first();
  const cx = Number(await circle.getAttribute('cx'));
  const cy = Number(await circle.getAttribute('cy'));
  const [vx, vy] = (viewBox ?? '').split(' ').map(Number);
  expect(cx).toBeGreaterThanOrEqual(vx);
  expect(cx).toBeLessThanOrEqual(vx + w);
  expect(cy).toBeGreaterThanOrEqual(vy);
  expect(cy).toBeLessThanOrEqual(vy + h);

  // Every pin on the map is reachable from the list beside it.
  //
  // Derived from the page, never hard-coded. An earlier version named two
  // real Chicago venues and passed for a year, then failed the morning
  // their last event went into the past — a green suite turning red
  // because the calendar moved, not because anything broke.
  const labels = await page.locator('svg a[aria-label]').evaluateAll((pins) =>
    pins.map((p) => (p.getAttribute('aria-label') ?? '').split(' — ')[0]),
  );
  expect(labels.length).toBeGreaterThan(0);

  const list = page.locator('ol, ul').filter({ hasText: labels[0] }).last();
  for (const label of labels) {
    await expect(list.getByText(label, { exact: true }).first()).toBeVisible();
  }

  // And the venues inside a pin, read off the hover card rather than named
  // here, so this keeps testing "every venue is reachable from the list"
  // whichever venues happen to be live.
  await page.locator('svg a[aria-label]').first().hover();
  const card = page.getByRole('status');
  await expect(card).toBeVisible();
  // Third line of the card: name, counts, then venues. A fourth ("Position
  // approximate") appears only sometimes, so index from the top, not the end.
  const venues = (await card.locator('p').nth(2).innerText()).split(' · ');
  expect(venues.length).toBeGreaterThan(0);
  for (const venue of venues) {
    await expect(list.getByText(venue.trim(), { exact: true }).first()).toBeVisible();
  }
});

test('venues too close to separate are grouped into one pin', async ({ page }) => {
  await page.goto('/communities/volleyball/il');

  // Three Chicago venues within a few miles become one clickable pin,
  // rather than three overlapping ones where two cannot be reached.
  // The counts move as events pass, so the assertion is on the shape:
  // one pin, and a label that says how much it is standing for.
  await expect(page.locator('svg a[aria-label]')).toHaveCount(1);
  await expect(page.locator('svg a[aria-label]').first()).toHaveAttribute(
    'aria-label',
    /Chicago — \d+ events? at \d+ venues?/,
  );
});

test('a state with nothing scheduled says so instead of showing an empty map', async ({ page }) => {
  await page.goto('/communities/volleyball/fl');
  await expect(page.getByText('Nothing scheduled here')).toBeVisible();
  await expect(page.getByRole('link', { name: /Back to the map/ })).toBeVisible();
});
