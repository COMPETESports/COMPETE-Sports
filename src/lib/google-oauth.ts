/**
 * Google sign-in.
 *
 * Deliberately hand-rolled rather than pulling in an auth framework. The
 * whole of OAuth for this purpose is two HTTP calls and a state cookie, and
 * a framework would want to own the session model that `accounts.ts`
 * already owns.
 *
 * Everything here is inert until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
 * are set, so the site runs, deploys and tests fine with email + password
 * alone. `isGoogleConfigured()` is what the sign-in page asks before
 * offering the button, so there is never a button that leads to an error.
 */

export const GOOGLE_STATE_COOKIE = 'compete_oauth_state';

/**
 * A path on this site, not a protocol-relative or backslash-escaped URL.
 *
 * `startsWith('/')` is not a same-site test: `//evil.com` and `/\evil.com`
 * both pass it and both resolve to another origin, which would let a crafted
 * sign-in link drop a freshly authenticated player on a lookalike page.
 */
export function isSamePath(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\');
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

export function redirectUri(): string {
  return `${siteUrl().replace(/\/$/, '')}/api/auth/google/callback`;
}

export function authorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
  emailVerified: boolean;
}

export async function exchangeCode(code: string): Promise<GoogleIdentity | null> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });

  if (!response.ok) return null;
  const body = (await response.json()) as { id_token?: string };
  if (!body.id_token) return null;

  // The ID token came straight back from Google's token endpoint over TLS,
  // on a request carrying our client secret. OpenID Connect explicitly
  // allows skipping signature verification in this case (Core §3.1.3.7):
  // the channel is the proof. A token arriving any other way would have to
  // be verified against Google's JWKS.
  const payload = decodeJwtPayload(body.id_token);
  if (!payload) return null;

  const sub = typeof payload.sub === 'string' ? payload.sub : null;
  const email = typeof payload.email === 'string' ? payload.email : null;
  if (!sub || !email) return null;

  // Belt and braces: confirm the token was minted for this client.
  if (payload.aud !== process.env.GOOGLE_CLIENT_ID) return null;

  return {
    sub,
    email,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
