import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 2 — accounts, profiles and the three event lists.
 *
 * Each test registers its own account with a unique email rather than
 * sharing a fixture, so one failing test cannot leave state that makes the
 * next one fail for the wrong reason.
 */

const PASSWORD = 'correct-horse-battery';

function freshEmail(tag: string): string {
  return `e2e.${tag}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@example.test`;
}

async function join(
  page: Page,
  opts: { tag: string; bracket?: string; name?: string },
): Promise<string> {
  const email = freshEmail(opts.tag);
  await page.goto('/join');
  await page.getByLabel('Your name').fill(opts.name ?? 'E2E Player');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByText(opts.bracket ?? '35–44', { exact: true }).click();
  await page.locator('input[name="age_13_plus"]').check();
  await page.locator('input[name="accept_terms"]').check();
  await page.getByRole('button', { name: /Create my account/ }).click();
  await expect(page.getByText('You are in.')).toBeVisible();
  return email;
}

test('a player can create an account and is dropped on their profile', async ({ page }) => {
  const email = await join(page, { tag: 'signup' });

  await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E Player');
  await expect(page.getByText(email).first()).toBeVisible();

  // The header swaps from "Join free" to the account link.
  await expect(page.getByRole('link', { name: 'My COMPETE' })).toBeVisible();
});

test('an under-18 account is offered no phone field at all', async ({ page }) => {
  await join(page, { tag: 'minor', bracket: 'Under 18' });

  await expect(
    page.getByText('COMPETE does not send text messages to anyone under 18'),
  ).toBeVisible();
  await expect(page.getByLabel('Mobile number')).toHaveCount(0);
});

test('an adult account is offered a phone field with the consent wording', async ({ page }) => {
  await join(page, { tag: 'adult' });

  const phone = page.getByLabel('Mobile number');
  await expect(phone).toBeVisible();

  // The disclosure appears only once there is a number to consent about,
  // and it is the full wording rather than a summary.
  await expect(page.getByText(/Consent is not required to use COMPETE/)).toHaveCount(0);
  await phone.fill('(314) 867-5309');
  await expect(page.getByText(/Reply STOP at any time/)).toBeVisible();
  await expect(page.getByText(/Consent is not required to use COMPETE/)).toBeVisible();

  // Both boxes start unticked. A pre-ticked box is not consent.
  const boxes = page.locator('input[name="sms_marketing"], input[name="sms_transactional"]');
  await expect(boxes).toHaveCount(2);
  for (let i = 0; i < 2; i += 1) {
    await expect(boxes.nth(i)).not.toBeChecked();
  }
});

test('a home ZIP saved on the profile fills the homepage Local rail', async ({ page }) => {
  await join(page, { tag: 'zip' });

  await page.getByLabel('Home ZIP').fill('60614');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Events near you' })).toBeVisible();
  await expect(page.getByText(/Within \d+ miles/)).toBeVisible();
});

test('saving an event, then registering, moves it between the right lists', async ({ page }) => {
  await join(page, { tag: 'save' });

  await page.goto('/events');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  // Wait for the server action to land before navigating, otherwise the next
  // request can beat the write.
  await expect(page.getByRole('button', { name: 'Unsave' }).first()).toBeVisible();

  await page.goto('/account/events');
  await expect(page.getByRole('heading', { name: /^Saved/ })).toBeVisible();
  // One card under Saved, nothing under Coming up.
  await expect(page.getByText('Nothing you have marked yourself registered for.')).toBeVisible();

  await page.getByRole('button', { name: "I'm registered" }).first().click();
  await expect(page.getByText('You are in')).toBeVisible();
  await expect(page.getByText('Nothing saved. The Save button is on every event.')).toBeVisible();
});

test('a signed-out visitor who clicks Save is sent to sign in and back', async ({ page }) => {
  await page.goto('/events');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page).toHaveURL(/\/signin\?next=/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');
});

test('an account can take the organizer hat without a second login', async ({ page }) => {
  await join(page, { tag: 'host' });

  await page.getByRole('link', { name: 'Run events?' }).click();
  await expect(page.getByRole('heading', { name: 'Run events?' })).toBeVisible();

  await page.getByLabel('Organization name').fill('E2E Beach Series');
  await page.getByRole('button', { name: /Create organizer profile/ }).click();
  await expect(page.getByText(/^Saved/)).toBeVisible();

  // The tab now names what is behind it.
  await expect(page.getByRole('link', { name: 'Organizer profile' })).toBeVisible();
});

test('sign out, then sign back in, and the account is still there', async ({ page }) => {
  const email = await join(page, { tag: 'roundtrip' });

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Join free' })).toBeVisible();

  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(email).first()).toBeVisible();
});

test('a wrong password says so without revealing whether the account exists', async ({ page }) => {
  const email = await join(page, { tag: 'badpass' });
  await page.getByRole('button', { name: 'Sign out' }).click();

  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/do not match an account/i)).toBeVisible();
});

test('the privacy policy and terms are published and linked from the footer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy policy' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'What we collect',
  );
  await expect(page.getByText(/We do not ask for or store your date of birth/)).toBeVisible();

  await page.getByRole('link', { name: 'Terms of use →' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Terms of use');
  await expect(
    page.getByText(/Eligibility to play is the organizer/),
  ).toBeVisible();
});

test('protected pages redirect a stranger to sign in', async ({ page }) => {
  await page.goto('/account/events');
  await expect(page).toHaveURL(/\/signin/);
});

/**
 * Regression tests for defects found in review. Each one reproduces a real
 * hole that existed in this code, so if any of them starts passing trivially,
 * check that the protection it covers is still there.
 */

test('a crafted next= cannot bounce a signed-in player off the site', async ({ page }) => {
  const email = await join(page, { tag: 'redirect' });
  await page.getByRole('button', { name: 'Sign out' }).click();

  // '//evil.com'.startsWith('/') is true, and browsers follow it off-origin.
  await page.goto('/signin?next=%2F%2Fexample.com%2Fphish');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/localhost:3000\/account/);
});

test('switching to the under-18 bracket strips the phone number', async ({ page }) => {
  await join(page, { tag: 'becomesminor' });

  await page.getByLabel('Mobile number').fill('(314) 867-5309');
  await page.locator('input[name="sms_marketing"]').check();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(page.getByText('New-event alerts are on')).toBeVisible();

  // Now say you are under 18. The number and the alerts both have to go.
  await page.getByText('Under 18', { exact: true }).click();
  await page.getByRole('button', { name: 'Save profile' }).click();

  // NOT `expect('Saved.').toBeVisible()` here. "Saved." is already on screen
  // from the first save and never goes away, so that assertion passes
  // instantly and the reload below races the write — which is exactly how
  // this test failed intermittently while the application was behaving
  // correctly (the database had under_18, no phone, alerts off).
  //
  // The alerts banner is rendered on the server from sms_alerts_enabled, and
  // saveProfile calls revalidatePath('/account'), so it disappearing is proof
  // the write actually committed and the page re-rendered from it.
  await expect(page.getByText('New-event alerts are on')).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByText('COMPETE does not send text messages to anyone under 18'),
  ).toBeVisible();
  await expect(page.getByLabel('Mobile number')).toHaveCount(0);
  await expect(page.getByText('New-event alerts are on')).toHaveCount(0);
});

test('typing another organizer’s public email does not claim their events', async ({ page }) => {
  await join(page, { tag: 'claimjack' });

  await page.goto('/account/host');
  await page.getByLabel('Organization name').fill('Definitely Not Them');
  // An address printed on real event pages. Knowing it must prove nothing.
  await page.getByLabel('Contact email').fill('director@ssova.com');
  await page.getByRole('button', { name: /Create organizer profile/ }).click();
  await expect(page.getByText(/^Saved/)).toBeVisible();

  await expect(page.getByRole('heading', { name: /Listed under you/ })).toHaveCount(0);
});

test('password guessing is cut off after a handful of tries', async ({ page }) => {
  const email = await join(page, { tag: 'ratelimit' });
  await page.getByRole('button', { name: 'Sign out' }).click();

  await page.goto('/signin');
  const limited = page.getByText(/Too many attempts/);

  for (let attempt = 0; attempt < 15; attempt += 1) {
    if (await limited.count()) break;
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(`wrong-${attempt}`);
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Wait for this attempt's answer before firing the next one, otherwise the
    // loop outruns the server and the count never reaches the limit.
    await expect(
      page.getByText(/do not match an account|Too many attempts/),
    ).toBeVisible();
    await page.waitForTimeout(150);
  }

  await expect(limited).toBeVisible();
});

/**
 * The age gate is self-reported, so the obligation is to make every
 * movement through it visible and provable. These two tests check the
 * evidence, not just the enforcement: the enforcement is covered above by
 * "switching to the under-18 bracket strips the phone number".
 */
test('an age-bracket switch is written to the append-only audit log', async ({ page }) => {
  const email = await join(page, { tag: 'agelog' });

  // 35-44 -> under 18. The protective direction.
  await page.getByText('Under 18', { exact: true }).click();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(
    page.getByText('COMPETE does not send text messages to anyone under 18'),
  ).toBeVisible();

  // Back out again. This is the direction that removes protections, and the
  // one an operator actually needs to see.
  await page.getByText('25–34', { exact: true }).click();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByLabel('Mobile number')).toBeVisible();

  // Both entries should be on the staff record, attributed to this account.
  await page.goto('/admin');
  await page.getByLabel('Staff password').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait for the sign-in to land. Without this the goto below races it and
  // /admin/compliance bounces back to the sign-in form, which then fails as
  // a confusing "element not found" rather than "you are not signed in".
  await expect(page).toHaveURL(/\/admin\/events/);
  await page.goto('/admin/compliance');

  const becameMinor = page.locator('section', { hasText: 'Became under-18' });
  const leftMinor = page.locator('section', { hasText: 'Left under-18' });

  await expect(becameMinor.getByText(email)).toBeVisible();
  await expect(leftMinor.getByText(email)).toBeVisible();

  // And the entry records what the switch stripped, which is the part worth
  // being able to prove later. (No number was ever set on this account, so
  // the line reads "no number was on file" — the point is that the control
  // reported its outcome rather than staying silent.)
  await expect(becameMinor.locator('li', { hasText: email })).toContainText(
    /phone removed:.*consents revoked:/s,
  );
});

test('no under-18 profile can hold a phone number or alerts', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Staff password').fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait for the sign-in to land. Without this the goto below races it and
  // /admin/compliance bounces back to the sign-in form, which then fails as
  // a confusing "element not found" rather than "you are not signed in".
  await expect(page).toHaveURL(/\/admin\/events/);
  await page.goto('/admin/compliance');

  // Asserted against the live table, not inferred from the constraints
  // existing. A failure here is the most urgent thing on the site.
  await expect(
    page.getByText('No under-18 profile holds a phone number or has alerts enabled'),
  ).toBeVisible();
});
