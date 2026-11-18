const { Readable } = require('node:stream');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://aidan.im');
  const mode = String(req.query.mode || 'search');
  if (mode === 'player') {
    const id = String(req.query.id || '');
    if (!/^\d{1,10}$/.test(id)) return res.status(400).json({error:'Invalid movie ID.'});
    const u = new URL(`https://vidsrc.sh/embed/movie/${id}`);
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({url:u.toString()});
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
  if (mode !== 'search') return res.status(400).json({error:'Unknown request.'});
  const key = process.env.TMDB_API_KEY;
  if (!key) return res.status(503).json({error:'TMDB is not configured.'});
  const q = String(req.query.q || '').trim().slice(0,100);
  const u = new URL(q ? 'https://api.themoviedb.org/3/search/movie' : 'https://api.themoviedb.org/3/movie/popular');
  if(q) u.searchParams.set('query',q);
  u.searchParams.set('include_adult','false');
  const headers = {accept:'application/json'};
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; else u.searchParams.set('api_key',key);
  try {
    const upstream = await fetch(u,{headers,signal:AbortSignal.timeout(12000)});
    if (!upstream.ok) return res.status(502).json({error:`TMDB returned HTTP ${upstream.status}.`});
    const data = await upstream.json();
    return res.status(200).json({results:(data.results||[]).slice(0,20).map(m=>({id:m.id,title:m.title,overview:m.overview,date:m.release_date,poster:m.poster_path,rating:m.vote_average}))});
  } catch {return res.status(502).json({error:'Could not reach TMDB.'});}
};
