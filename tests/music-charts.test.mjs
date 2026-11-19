import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/mu.js';

async function chart(key) {
  const res = {
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await handler({method:'GET',query:{mode:'chart',chart:key}},res);
  return res;
}

test('trending preserves download rank and skips incomplete songs', async t => {
  t.mock.method(globalThis,'fetch',async url => {
    assert.match(url,/itunes\.apple\.com/);
    return Response.json({feed:{entry:[
      {'im:name':{label:'First'},'im:artist':{label:'A'}},{},
      {'im:name':{label:'Third'},'im:artist':{label:'B'}}
    ]}});
  });
  const result = await chart('trending');
  assert.equal(result.code,200);
  assert.deepEqual(result.body.tracks,[{rank:1,title:'First',channel:'A'},{rank:3,title:'Third',channel:'B'}]);
});

test('popular preserves streaming order and the existing artists field', async t => {
  t.mock.method(globalThis,'fetch',async url => {
    assert.match(url,/most-played/);
    return Response.json({feed:{results:[{name:'One',artistName:'A'},{name:'Two',artistName:'A'}]}});
  });
  const result = await chart(undefined);
  assert.deepEqual(result.body.artists,['A']);
  assert.deepEqual(result.body.tracks.map(track => track.title),['One','Two']);
});

test('unknown chart and unavailable feed return distinct errors', async t => {
  t.mock.method(globalThis,'fetch',async () => Response.json({feed:{entry:[]}}));
  assert.equal((await chart('unknown')).code,400);
  assert.equal((await chart('trending')).code,503);
});
