import {createHash, createHmac, pbkdf2, randomBytes, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive = promisify(pbkdf2);
const pathname = 'st/jaiden-picks.json';
const cookieName = 'st_jaiden';
const credentialPath = 'st/jaiden-credentials.json';
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers:{'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers}
});
const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b);

function movie(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id ?? '');
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  if (!/^[1-9]\d{0,9}$/.test(id) || !title || title.length > 200 ||
      !reason || reason.length > 600 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(title + reason)) return null;
  return {
    id, title, reason,
    date:typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : '',
    poster:typeof value.poster === 'string' && /^\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(value.poster) ? value.poster : null
  };
}

export function createMoviePicksHandler(storage, env = process.env, now = Date.now) {
  const sign = (body, revision = '') => createHmac('sha256', env.ST_SESSION_SECRET)
    .update(revision ? body + '.' + revision : body).digest('base64url');
  async function credentials() {
    const result = await storage.get(credentialPath, {access:'private', useCache:false});
    if (!result) return {hash:env.ST_JAIDEN_PASSWORD_HASH, revision:'', etag:null};
    if (result.statusCode !== 200 || !result.blob?.etag) throw Error('Credential read failed');
    const data = await new Response(result.stream).json();
    if (!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(data.hash || '') ||
        !/^[a-f0-9]{32}$/.test(data.revision || '')) throw Error('Invalid credentials');
    return {...data, etag:result.blob.etag};
  }
  function sessionHeaders(revision) {
    const body = `${now() + 28800000}.${randomBytes(18).toString('base64url')}`;
    return {'Set-Cookie':`${cookieName}=${body}.${sign(body, revision)}; Path=/api/st-admin; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`};
  }
  async function matchesPassword(password, hash) {
    const [salt, expected] = (hash || '').split(':');
    if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(expected || '')) throw Error('Invalid password configuration');
    const actual = await derive(password, salt, 310000, 32, 'sha256');
    return equal(Buffer.from(expected, 'hex'), actual);
  }
  async function throttle(request, scope = 'login') {
    const ip = (request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
    const marker = `st/${scope}/${createHash('sha256').update(ip).digest('hex')}/${Math.floor(now() / 30000)}.json`;
    try { await storage.put(marker, '{}', {access:'private', addRandomSuffix:false, allowOverwrite:false}); }
    catch (error) {
      if (await storage.get(marker, {access:'private', useCache:false})) return false;
      throw error;
    }
    return true;
  }
  function authorized(request, revision) {
    if (!env.ST_SESSION_SECRET) return false;
    const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)st_jaiden=([^;]+)/)?.[1];
    if (!cookie) return false;
    const parts = cookie.split('.');
    if (parts.length !== 3) return false;
    const [expiry, nonce, signature] = parts;
    if (!/^\d+$/.test(expiry) || !Number.isSafeInteger(Number(expiry)) || Number(expiry) <= now() ||
        !/^[A-Za-z0-9_-]{24}$/.test(nonce)) return false;
    return equal(Buffer.from(signature), Buffer.from(sign(`${expiry}.${nonce}`, revision)));
  }
  return async function handle(request) {
    if (!['GET', 'POST'].includes(request.method)) return json({error:'Method not allowed.'}, 405, {Allow:'GET, POST'});
    try {
      if (request.method === 'GET') {
        if (new URL(request.url).searchParams.get('session') === '1') {
          const current = await credentials();
          return json({authenticated:authorized(request, current.revision), account:'jaiden'});
        }
        const result = await storage.get(pathname, {access:'private', useCache:false});
        if (!result) return json({picks:[]});
        if (result.statusCode !== 200) throw Error('Storage read failed');
        const data = await new Response(result.stream).json();
        return json({picks:Array.isArray(data.picks) ? data.picks.slice(0, 50).map(movie).filter(Boolean) : []});
      }
      if (request.headers.get('origin') !== 'https://aidan.im') return json({error:'Please use the admin page on aidan.im.'}, 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'JSON required.'}, 415);
      if (Number(request.headers.get('content-length') || 0) > 64000) return json({error:'Request too large.'}, 413);
      const reader = request.body?.getReader();
      if (!reader) return json({error:'Invalid request.'}, 400);
      const chunks = []; let size = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64000) { await reader.cancel(); return json({error:'Request too large.'}, 413); }
        chunks.push(value);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return json({error:'Invalid request.'}, 400); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return json({error:'Invalid request.'}, 400);
      if (data.action === 'logout') return json({ok:true}, 200, {
        'Set-Cookie':`${cookieName}=; Path=/api/st-admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
      });
      if (!env.ST_SESSION_SECRET) return json({error:'Movie admin is not configured.'}, 503);
      const current = await credentials();
      if (!current.hash) return json({error:'Movie admin is not configured.'}, 503);
      if (data.action === 'login') {
        if (typeof data.password !== 'string' || data.password.length > 256) return json({error:'Invalid password.'}, 401);
        if (!await throttle(request)) return json({error:'Please wait 30 seconds before trying again.'}, 429, {'Retry-After':'30'});
        if (!await matchesPassword(data.password, current.hash)) return json({error:'Invalid password.'}, 401);
        return json({ok:true, account:'jaiden'}, 200, sessionHeaders(current.revision));
      }
      if (!authorized(request, current.revision)) return json({error:'Sign in as Jaiden first.'}, 401);
      if (data.action === 'change-password') {
        if (typeof data.currentPassword !== 'string' || data.currentPassword.length > 256 ||
            typeof data.newPassword !== 'string' || data.newPassword.length < 8 || data.newPassword.length > 256) {
          return json({error:'Use a new password between 8 and 256 characters.'}, 400);
        }
        if (!await throttle(request, 'password')) return json({error:'Please wait 30 seconds before trying again.'}, 429, {'Retry-After':'30'});
        if (!await matchesPassword(data.currentPassword, current.hash)) return json({error:'Current password is incorrect.'}, 400);
        const salt = randomBytes(16).toString('hex');
        const hash = (await derive(data.newPassword, salt, 310000, 32, 'sha256')).toString('hex');
        const revision = randomBytes(16).toString('hex');
        try {
          await storage.put(credentialPath, JSON.stringify({hash:salt + ':' + hash, revision}), {
            access:'private', addRandomSuffix:false, allowOverwrite:Boolean(current.etag),
            ...(current.etag ? {ifMatch:current.etag} : {}), contentType:'application/json'
          });
        } catch (error) {
          if (error?.name === 'BlobPreconditionFailedError' || error?.name === 'BlobAlreadyExistsError') {
            return json({error:'Your password changed in another session. Sign in again.'}, 409);
          }
          throw error;
        }
        return json({ok:true}, 200, sessionHeaders(revision));
      }
      if (data.action !== 'save' || !Array.isArray(data.picks) || data.picks.length > 50) return json({error:'Select up to 50 movies.'}, 400);
      const picks = data.picks.map(movie);
      if (picks.some(pick => !pick) || new Set(picks.map(pick => pick.id)).size !== picks.length) {
        return json({error:'Each movie needs a valid title and a reason of 1 to 600 characters. Remove duplicate movies.'}, 400);
      }
      await storage.put(pathname, JSON.stringify({picks}), {
        access:'private', addRandomSuffix:false, allowOverwrite:true, contentType:'application/json'
      });
      return json({ok:true, picks});
    } catch (error) {
      console.error('Movie picks storage failed:', error?.name || 'Error');
      return json({error:'Movie picks are unavailable right now. Try again.'}, 503);
    }
  };
}
