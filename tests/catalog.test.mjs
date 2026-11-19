import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../api/st.js';

async function call(query) {
  const res = {
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(body) { return {code:this.code, body}; }
  };
  return catalog({query}, res);
}

test('existing movie requests and numbered TV episodes use the custom player', async () => {
  for (const [query, path] of [
    [{id:'597'}, 'movie/597'],
    [{id:'1399', type:'tv', season:'1', episode:'2'}, 'tv/1399/1/2'],
    [{id:'1399', type:'tv', season:'0', episode:'1'}, 'tv/1399/0/1']
  ]) {
    assert.deepEqual(await call({mode:'player', ...query}), {
      code:200, body:{url:'https://math.aidan.im/embed/' + path}
    });
  }
  assert.equal((await call({mode:'player', type:'tv', id:'1399', season:'1'})).code, 400);
});

test('TV search, seasons and episodes retain TMDB names and numbering', async t => {
  const savedKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'test';
  t.after(() => {
    if (savedKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = savedKey;
  });
  const paths = [];
  t.mock.method(globalThis, 'fetch', async url => {
    paths.push(url.pathname);
    return Response.json({
      results:[{id:1, name:'Example show', first_air_date:'2025-04-02'}],
      seasons:[{name:'Season 3', season_number:3, episode_count:1}],
      episodes:[{name:'Finale', episode_number:9}]
    });
  });
  const search = await call({mode:'search', type:'tv', q:'Example'});
  assert.equal(search.body.results[0].title, 'Example show');
  assert.equal(search.body.results[0].date, '2025-04-02');
  assert.deepEqual((await call({mode:'seasons', id:'1'})).body.seasons, [{number:3, name:'Season 3'}]);
  assert.deepEqual((await call({mode:'episodes', id:'1', season:'3'})).body.episodes, [{number:9, name:'Finale'}]);
  assert.deepEqual(paths, ['/3/search/tv', '/3/tv/1', '/3/tv/1/season/3']);
});

test('genre and release filters use the correct movie and TV dates and catalog pages', async t => {
  const key = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'test';
  t.after(() => { if (key === undefined) delete process.env.TMDB_API_KEY; else process.env.TMDB_API_KEY = key; });
  let request;
  t.mock.method(globalThis, 'fetch', async url => { request = url; return Response.json({total_pages:3, results:[{id:1,title:'Example',vote_average:8.5}]}); });
  const page = await call({collection:'genre',genre:18,page:2});
  assert.equal(request.pathname,'/3/discover/movie');
  assert.equal(request.searchParams.get('with_genres'),'18');
  assert.equal(request.searchParams.get('page'),'2');
  assert.equal(page.body.results[0].rating,8.5);
  assert.equal(page.body.pages,3);
  for (const [type,date] of [['tv','first_air_date'],['movie','primary_release_date']]) {
    await call({type,collection:'new'});
    assert.ok(request.searchParams.get(date+'.gte') < request.searchParams.get(date+'.lte'));
    await call({type,collection:'rated'});
    assert.equal(request.pathname,'/3/'+type+'/top_rated');
  }
  assert.equal((await call({collection:'genre',genre:'invalid'})).code,400);
});
