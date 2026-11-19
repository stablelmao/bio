import test from 'node:test';
import assert from 'node:assert/strict';
import api from '../api/mu.js';

async function get(query) {
  const response = {setHeader(){}, status(code){this.code = code; return this;},json(body){this.body = body; return this;}};
  await api({method:'GET',query},response);
  return response;
}
test('artist pages use a stable artist ID and preserve release and recording identities',async t => {
  t.mock.method(globalThis,'fetch',async url => {
    assert.equal(url.hostname,'itunes.apple.com');
    assert.equal(url.searchParams.get('id'),'123');
    const identity = {wrapperType:'artist',artistId:123,artistName:'Example'};
    const release = {wrapperType:'collection',artistId:123,collectionId:456,collectionName:'Debut',artistName:'Example'};
    const song = {kind:'song',artistId:123,artistName:'Example',trackName:'First',trackTimeMillis:240000};
    return Response.json({results:[identity,url.searchParams.get('entity') === 'album' ? release : song]});
  });
  const {body,code} = await get({mode:'artist',id:'123'});
  assert.equal(code,200);
  assert.equal(body.albums[0].id,'456');
  assert.equal(body.tracks[0].duration,240);
  assert.equal(body.tracks[0].directoryArtistId,'123');
  assert.equal(body.tracks[0].chartEntry,true);
});
test('invalid artist or album and empty search do not query upstream',async t => {
  const fetch = t.mock.method(globalThis,'fetch',()=>{throw Error()});
  for (const query of [{mode:'artist',id:'bad'},{mode:'album',id:'0?x'},{mode:'artists',q:' '}])
    assert.equal((await get(query)).code,400);
  assert.equal(fetch.mock.callCount(),0);
});

test('artist profile returns a portrait, five unique top songs, and grouped releases',async t => {
  t.mock.method(globalThis,'fetch',async url => {
    if (url.hostname === 'api.deezer.com') return Response.json({data:[{name:'Example',picture_medium:'https://cdn-images.dzcdn.net/images/artist/abcdef/250.jpg'}]});
    const artist = {wrapperType:'artist',artistId:123,artistName:'Example'};
    const titles = ['One','One','Two','Three','Four','Five','Six'];
    const releases = [
      {collectionName:'Debut',trackCount:12},{collectionName:'Later - EP',trackCount:5},
      {collectionName:'New song',trackCount:1}
    ];
    const result = url.searchParams.get('entity') === 'song'
      ? titles.map(trackName => ({...artist,wrapperType:'track',kind:'song',trackName}))
      : releases.map((item,i) => ({...artist,...item,wrapperType:'collection',collectionId:10+i}));
    return Response.json({results:[artist,...result]});
  });
  const {body} = await get({mode:'artist',id:'123'});
  assert.equal(body.artist.picture,'https://cdn-images.dzcdn.net/images/artist/abcdef/250.jpg');
  assert.deepEqual(body.tracks.map(t => t.title),['One','Two','Three','Four','Five']);
  assert.deepEqual(body.albums.map(r => r.name),['Debut']);
  assert.deepEqual(body.singles.map(r => r.name),['Later - EP','New song']);
});
