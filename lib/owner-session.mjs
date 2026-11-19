import { createHmac, timingSafeEqual } from 'node:crypto';

export function ownerSignedIn(request, secret = process.env.MU_SESSION_SECRET, now = Date.now()) {
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)mu_admin=([^;]+)/)?.[1];
  if (!secret || !cookie) return false;
  const parts = cookie.split('.');
  if (parts.length !== 3) return false;
  const [expires, nonce, signature] = parts;
  if (!/^\d{13}$/.test(expires) || Number(expires) <= now || !nonce) return false;
  const expected = createHmac('sha256', secret).update(expires + '.' + nonce).digest('base64url');
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(Buffer.from(expected), actual);
}
