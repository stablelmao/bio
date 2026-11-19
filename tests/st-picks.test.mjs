import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, pbkdf2Sync} from 'node:crypto';
import {createMoviePicksHandler} from '../lib/st-picks.mjs';
const salt = '0123456789abcdef0123456789abcdef';
const password = 'test-password-only';
const hash = pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex');
const favorite = {id:597, title:'Titanic', date:'1997-12-19', poster:'/abc.jpg', reason:'I like the story.'};
function fixture() {
  const objects = new Map(); let clock = 1795064000000;
  const etag = path => createHash('sha256').update(objects.get(path)).digest('hex');
  const storage = {
    async get(path) { return objects.has(path) ? {statusCode:200, blob:{etag:etag(path)}, stream:new Response(objects.get(path)).body} : null; },
    async put(path, body, options) {
      assert.equal(options.access, 'private');
      if (options.ifMatch && (!objects.has(path) || etag(path) !== options.ifMatch)) {
        const error = Error('changed'); error.name = 'BlobPreconditionFailedError'; throw error;
      }
      if (objects.has(path) && !options.allowOverwrite) {
        const error = Error('already exists'); error.name = 'BlobAlreadyExistsError'; throw error;
      }
      objects.set(path, body);
    }
  };
  const handle = createMoviePicksHandler(storage, {ST_JAIDEN_PASSWORD_HASH:`${salt}:${hash}`, ST_SESSION_SECRET:'isolated-test-secret'}, () => clock);
  return {objects, storage, handle, advance:ms => clock += ms};
}
function post(data, cookie = '', origin = 'https://aidan.im') {
  return new Request('https://aidan.im/api/st-admin', {method:'POST', headers:{'Content-Type':'application/json',origin,cookie}, body:JSON.stringify(data)});
}
async function login(f) {
  const response = await f.handle(post({action:'login',password}));
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(cookie, /Path=\/api\/st-admin/);
  return cookie.split(';')[0];
}

test('public picks are empty initially and unauthorized visitors cannot publish', async () => {
  const f = fixture();
  assert.deepEqual(await (await f.handle(new Request('https://aidan.im/api/st-admin'))).json(), {picks:[]});
  assert.equal((await f.handle(post({action:'save', picks:[favorite]}))).status,401);
  assert.equal((await f.handle(post({action:'save', picks:[favorite]},'mu_admin=another-account-session'))).status,401);
  assert.equal(f.objects.size,0);
});
test('Jaiden can publish reasons, edit them, remove movies and read them publicly', async () => {
  const f = fixture(), cookie = await login(f);
  const response = await f.handle(post({action:'save',picks:[{...favorite,extra:'do not expose'}]},cookie));
  assert.equal(response.status,200);
  let body = await (await f.handle(new Request('https://aidan.im/api/st-admin'))).json();
  assert.deepEqual(body.picks,[{...favorite,id:'597'}]);
  assert.equal((await f.handle(post({action:'save',picks:[{...favorite,reason:'Updated reason'}]},cookie))).status,200);
  assert.equal((await f.handle(post({action:'save',picks:[]},cookie))).status,200);
  assert.deepEqual(await (await f.handle(new Request('https://aidan.im/api/st-admin'))).json(),{picks:[]});
});
test('expired, malformed and modified cookies do not authorize movie changes', async () => {
  const f = fixture(), cookie = await login(f);
  const session = new Request('https://aidan.im/api/st-admin?session=1',{headers:{cookie}});
  assert.equal((await (await f.handle(session)).json()).authenticated,true);
  const tampered = cookie.slice(0,-2) + 'xx';
  assert.equal((await f.handle(post({action:'save',picks:[]},tampered))).status,401);
  assert.equal((await f.handle(post({action:'save',picks:[]},'st_jaiden=NaN.fake.fake'))).status,401);
  f.advance(28800001);
  assert.equal((await f.handle(post({action:'save',picks:[]},cookie))).status,401);
  const logout = await f.handle(post({action:'logout'}));
  assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});
test('bad passwords are rejected and repeated login attempts are rate limited', async () => {
  const f = fixture();
  assert.equal((await f.handle(post({action:'login',password:'wrong'}))).status,401);
  assert.equal((await f.handle(post({action:'login',password}))).status,429);
  f.advance(30000);
  await login(f);
});
test('cross-origin writes, oversized bodies, invalid picks and duplicates are rejected', async () => {
  const f = fixture(), cookie = await login(f);
  assert.equal((await f.handle(post({action:'save',picks:[]},cookie,'https://elsewhere.example'))).status,403);
  assert.equal((await f.handle(post({action:'save',picks:[],padding:'x'.repeat(64000)},cookie))).status,413);
  for (const picks of [[{...favorite,reason:''}],[{...favorite,id:'../bad'}],[favorite,favorite],[{...favorite,reason:'x'.repeat(601)}]]) {
    assert.equal((await f.handle(post({action:'save',picks},cookie))).status,400);
  }
  assert.equal(f.objects.has('st/jaiden-picks.json'),false);
});
test('storage failures are reported without claiming success', async () => {
  const f = fixture(), cookie = await login(f);
  f.storage.put = async () => {throw Error('offline');};
  assert.equal((await f.handle(post({action:'save',picks:[favorite]},cookie))).status,503);
  assert.equal(f.objects.has('st/jaiden-picks.json'),false);
});

test('password changes persist across handlers, revoke old sessions and keep the current session', async () => {
  const f = fixture(), cookie = await login(f);
  const newPassword = 'Jaiden chooses a new password 🔑';
  f.advance(30000);
  const response = await f.handle(post({action:'change-password',currentPassword:password,newPassword}, cookie));
  assert.equal(response.status,200);
  const newCookie = response.headers.get('set-cookie').split(';')[0];
  const stored = f.objects.get('st/jaiden-credentials.json');
  assert.ok(stored);
  assert.equal(stored.includes(newPassword),false);
  assert.equal(stored.includes(password),false);
  assert.equal((await f.handle(post({action:'save',picks:[]},cookie))).status,401);
  assert.equal((await f.handle(post({action:'save',picks:[]},newCookie))).status,200);
  const publicData = await (await f.handle(new Request('https://aidan.im/api/st-admin'))).json();
  assert.deepEqual(Object.keys(publicData),['picks']);
  const fresh = createMoviePicksHandler(f.storage, {ST_JAIDEN_PASSWORD_HASH:salt + ':' + hash, ST_SESSION_SECRET:'isolated-test-secret'});
  assert.equal((await fresh(post({action:'login',password}))).status,401);
  // Use another IP so this independent login isn't limited by the preceding attempt.
  const request = post({action:'login',password:newPassword});
  request.headers.set('x-vercel-forwarded-for','192.0.2.10');
  assert.equal((await fresh(request)).status,200);
});

test('password changes require Jaiden session, same origin, current password and valid new password', async () => {
  const f = fixture();
  const data = {action:'change-password',currentPassword:password,newPassword:'new-test-password'};
  assert.equal((await f.handle(post(data))).status,401);
  assert.equal((await f.handle(post(data,'mu_admin=other'))).status,401);
  const cookie = await login(f);
  assert.equal((await f.handle(post(data,cookie,'https://other.example'))).status,403);
  for (const newPassword of ['', 'short', 'x'.repeat(257), null]) {
    assert.equal((await f.handle(post({...data,newPassword},cookie))).status,400);
  }
  f.advance(30000);
  assert.equal((await f.handle(post({...data,currentPassword:'wrong'},cookie))).status,400);
  assert.equal((await f.handle(post(data,cookie))).status,429);
  assert.equal(f.objects.has('st/jaiden-credentials.json'),false);
});

test('password storage failures preserve the old credential and session', async () => {
  const f = fixture(), cookie = await login(f);
  f.advance(30000);
  const put = f.storage.put;
  f.storage.put = async (...args) => {
    if (args[0] === 'st/jaiden-credentials.json') throw Error('offline');
    return put(...args);
  };
  const response = await f.handle(post({action:'change-password',currentPassword:password,newPassword:'another-password'},cookie));
  assert.equal(response.status,503);
  assert.equal(response.headers.get('set-cookie'),null);
  assert.equal(f.objects.has('st/jaiden-credentials.json'),false);
  assert.equal((await f.handle(post({action:'save',picks:[]},cookie))).status,200);
});

test('changing the password again uses conditional writes and invalidates the prior password', async () => {
  const f = fixture(), cookie = await login(f);
  f.advance(30000);
  const first = await f.handle(post({action:'change-password',currentPassword:password,newPassword:'first-new-password'},cookie));
  const newCookie = first.headers.get('set-cookie').split(';')[0];
  f.advance(30000);
  const put = f.storage.put;
  let checked = false;
  f.storage.put = async (...args) => {
    if (args[0] === 'st/jaiden-credentials.json') { assert.ok(args[2].ifMatch); checked = true; }
    return put(...args);
  };
  const second = await f.handle(post({action:'change-password',currentPassword:'first-new-password',newPassword:'second-new-password'},newCookie));
  assert.equal(second.status,200);
  assert.equal(checked,true);
  assert.equal((await f.handle(post({action:'save',picks:[]},newCookie))).status,401);
});

test('simultaneous password changes cannot overwrite one another', async () => {
  const f = fixture(), initial = await login(f);
  f.advance(30000);
  const first = await f.handle(post({action:'change-password',currentPassword:password,newPassword:'first-new-password'},initial));
  const cookie = first.headers.get('set-cookie').split(';')[0];
  f.advance(30000);
  const put = f.storage.put;
  let arrivals = 0, release;
  const barrier = new Promise(resolve => {release = resolve;});
  f.storage.put = async (...args) => {
    if (args[0] === 'st/jaiden-credentials.json') {
      if (++arrivals === 2) release();
      await barrier;
    }
    return put(...args);
  };
  const change = (ip, newPassword) => {
    const request = post({action:'change-password',currentPassword:'first-new-password',newPassword},cookie);
    request.headers.set('x-vercel-forwarded-for',ip);
    return f.handle(request);
  };
  const responses = await Promise.all([change('192.0.2.1','chosen-password-one'),change('192.0.2.2','chosen-password-two')]);
  assert.deepEqual(responses.map(r => r.status).sort(),[200,409]);
});
