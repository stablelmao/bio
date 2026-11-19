import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import guard from '../cloudflare/stream-guard.mjs';

test('video iframe blocks popups, top navigation and downloads while allowing playback', async () => {
  const html = await readFile(new URL('../st.html', import.meta.url), 'utf8');
  const iframe = html.match(/<iframe\b[^>]*id="frame"[^>]*>/)[0];
  assert.equal(iframe.match(/sandbox="([^"]*)"/)[1], 'allow-scripts allow-same-origin allow-presentation');
  assert.match(iframe, /allow="autoplay; fullscreen; picture-in-picture"/);
  assert.match(iframe, /allowfullscreen/);
});

test('stream compatibility route only replaces the sandbox blocker script', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await guard.fetch(new Request('https://stream.aidan.im/assets/sbx.js?v=123', {method}));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type'), /application\/javascript/);
    assert.doesNotMatch(await response.text(), /location|window\.open/);
  }
  for (const url of ['https://aidan.im/assets/sbx.js', 'https://stream.aidan.im/embed/movie/597']) {
    assert.equal((await guard.fetch(new Request(url))).status, 404);
  }
  assert.equal((await guard.fetch(new Request('https://stream.aidan.im/assets/sbx.js', {method:'POST'}))).status, 405);
});
