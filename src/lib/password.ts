import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

// promisify() picks the three-argument overload and loses the options one,
// so the wrapper is written out rather than inferred.
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
}

/**
 * Password hashing with scrypt.
 *
 * scrypt ships in Node's standard library, is memory-hard, and is an
 * accepted choice for password storage — which matters more here than
 * picking the fashionable algorithm, because a dependency that needs
 * native compilation is a dependency that breaks a deploy at the worst
 * moment.
 *
 * Stored format:  scrypt$N$r$p$saltHex$hashHex
 * The parameters travel with the hash, so they can be raised later without
 * invalidating anybody's existing password.
 */

const N = 16384; // CPU/memory cost
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

// The length rule lives in password-rules.ts so the forms can import it
// without dragging node:crypto into the browser bundle.
export { MIN_PASSWORD_LENGTH, passwordProblem } from './password-rules';

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(plain.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: 64 * 1024 * 1024,
  });

  return ['scrypt', N, R, P, salt.toString('hex'), key.toString('hex')].join('$');
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');

  let key: Buffer;
  try {
    key = await scrypt(plain.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
  } catch {
    return false;
  }

  return key.length === expected.length && timingSafeEqual(key, expected);
}
