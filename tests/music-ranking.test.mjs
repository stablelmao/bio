import test from 'node:test';
import assert from 'node:assert/strict';
import ranking from '../mu-ranking.js';
const song = (title,channel,id) => ({title,channel,id});
test('search favors exact recordings and preserves playable IDs when merging catalogs',() => {
  const hit = song('Blinding Lights','The Weeknd','42');
  const cover = song('Blinding Lights','Karaoke Crew','51');
  const remix = song('Blinding Lights (Remix)','The Weeknd','33');
  const hits = ranking.rankSongs('Blinding Lights',[cover,remix,hit],[song(hit.title,hit.channel),song('Something Else','Unrelated')]);
  assert.deepEqual(hits.map(t => t.id),['42','51','33']);
  for (const q of ['The Weeknd Blinding Lights','Blinding Lights The Weeknd']) {
    assert.equal(ranking.rankSongs(q,[cover,remix,hit],[])[0].id,'42');
  }
  assert.equal(ranking.rankSongs('blinding lights remix',[cover,hit,remix],[])[0].id,'33');
});
test('artist search prioritizes the exact name and excludes incidental results',() => {
  const artists = ['Daft Punk Experience','blink-182','Daft Punk'].map(name => ({name}));
  assert.deepEqual(ranking.rankArtists('daft punk',artists).map(a => a.name),['Daft Punk','Daft Punk Experience']);
  assert.equal(ranking.rankArtists('beyonce',[{name:'Beyoncé'}]).length,1);
});
test('a confirmed artist query prioritizes their recordings',() => {
  const original = song('One More Time','Daft Punk','11');
  const nameDrop = song('Daft Punk','Someone Else','12');
  assert.equal(ranking.rankSongs('Daft Punk',[nameDrop,original],[],[{name:'Daft Punk'}])[0].id,'11');
});
