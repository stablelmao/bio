const { Readable } = require('node:stream');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://aidan.im');
  const mode = String(req.query.mode || 'search');
  const type = req.query.type || 'movie';
  const id = String(req.query.id || '');
  const season = String(req.query.season ?? '');
  const episode = String(req.query.episode ?? '');
  if (!['movie', 'tv'].includes(type)) return res.status(400).json({error:'Invalid media type.'});
  if (['player', 'seasons', 'episodes'].includes(mode) && !/^[1-9]\d{0,9}$/.test(id)) {
    return res.status(400).json({error:'Invalid title ID.'});
  }
  if (mode === 'episodes' || (mode === 'player' && type === 'tv')) {
    if (!/^\d{1,4}$/.test(season)) return res.status(400).json({error:'Invalid season.'});
  }
  if (mode === 'player') {
    if (type === 'tv' && !/^[1-9]\d{0,4}$/.test(episode)) return res.status(400).json({error:'Invalid episode.'});
    const path = type === 'tv' ? `tv/${id}/${season}/${episode}` : `movie/${id}`;
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({url:'https://stream.aidan.im/embed/' + path});
  }
  if (mode === 'image') {
    const path = String(req.query.path || '');
    if (!/^\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(path)) return res.status(400).end();
    try {
      const upstream = await fetch('https://image.tmdb.org/t/p/w342'+path,{signal:AbortSignal.timeout(12000)});
      if (!upstream.ok || !(upstream.headers.get('content-type')||'').startsWith('image/')) return res.status(502).end();
      res.setHeader('Content-Type',upstream.headers.get('content-type')); res.setHeader('Cache-Control','public, max-age=86400');
      return Readable.fromWeb(upstream.body).on('error',()=>res.destroy()).pipe(res);
    } catch {return res.status(502).end();}
  }
  if (!['search','seasons','episodes'].includes(mode)) return res.status(400).json({error:'Unknown request.'});
  const key = process.env.TMDB_API_KEY;
  if (!key) return res.status(503).json({error:'TMDB is not configured.'});
  const q = String(req.query.q || '').trim().slice(0,100);
  let path = q ? `search/${type}` : `${type}/popular`;
  if (mode === 'seasons') path = `tv/${id}`;
  if (mode === 'episodes') path = `tv/${id}/season/${season}`;
  const u = new URL('https://api.themoviedb.org/3/' + path);
  if (mode === 'search' && q) {
    u.searchParams.set('query',q);
    u.searchParams.set('include_adult','false');
  }
  const headers = {accept:'application/json'};
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; else u.searchParams.set('api_key',key);
  try {
    const upstream = await fetch(u,{headers,signal:AbortSignal.timeout(12000)});
    if (!upstream.ok) return res.status(502).json({error:`TMDB returned HTTP ${upstream.status}.`});
    const data = await upstream.json();
    if (mode === 'seasons') {
      const seasons = (data.seasons || []).filter(s => s.episode_count > 0)
        .map(s => ({number:s.season_number, name:s.name}));
      return res.status(200).json({seasons});
    }
    if (mode === 'episodes') {
      const episodes = (data.episodes || []).map(e => ({number:e.episode_number, name:e.name}));
      return res.status(200).json({episodes});
    }
    return res.status(200).json({results:(data.results||[]).slice(0,20).map(m=>({id:m.id,title:m.title || m.name,overview:m.overview,date:m.release_date || m.first_air_date,poster:m.poster_path,rating:m.vote_average}))});
  } catch {return res.status(502).json({error:'Could not reach TMDB.'});}
};
