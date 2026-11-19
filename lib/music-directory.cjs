const modes = new Set(['artists','artist','album','matches','portrait']);

async function lookup(path, params) {
  const url = new URL(path, 'https://itunes.apple.com');
  url.search = new URLSearchParams({country:'US', ...params});
  const response = await fetch(url, {signal:AbortSignal.timeout(9000)});
  if (!response.ok) throw Error('Catalog unavailable.');
  const {results} = await response.json();
  if (!Array.isArray(results)) throw Error('Invalid catalog.');
  return results;
}

const artist = item => ({id:String(item.artistId), name:item.artistName, genre:item.primaryGenreName || ''});
const artwork = item => {
  const url = item.artworkUrl100 || '';
  return /^https:\/\/[^/]+\.mzstatic\.com\//i.test(url) ? url.replace(/100x100bb(?=\.)/, '300x300bb') : '';
};
const album = item => ({id:String(item.collectionId), name:item.collectionName, artist:item.artistName,
  artistId:String(item.artistId), artwork:artwork(item), year:(item.releaseDate || '').slice(0,4), count:item.trackCount});
const songs = items => items.filter(item => item.kind === 'song' && item.trackName).map(item => ({
  title:item.trackName, channel:item.artistName, album:item.collectionName, duration:Math.round((item.trackTimeMillis || 0)/1000),
  directoryArtistId:String(item.artistId), artwork:artwork(item), chartEntry:true
}));
function nameKey(name) {
  return (name || '').normalize('NFKC').toLowerCase().trim();
}
async function portraits(term) {
  try {
    const url = new URL('https://api.deezer.com/search/artist');
    url.search = new URLSearchParams({q:term,limit:'16'});
    const response = await fetch(url,{signal:AbortSignal.timeout(3000)});
    if (!response.ok) return new Map();
    const {data} = await response.json();
    const images = new Map();
    for (const entry of data || []) {
      const image = entry.picture_medium || '';
      if (entry.name && !images.has(nameKey(entry.name)) && /^https:\/\/[^/]+\.dzcdn\.net\/images\/artist\/[a-f0-9]+\//i.test(image) && !image.includes('/00000000000000000000000000000000/'))
        images.set(nameKey(entry.name),image);
    }
    return images;
  } catch { return new Map(); }
}
function isSingle(item) {
  return /(?:^|\s[-–—]\s)(?:single|ep)$/i.test(item.name) || (item.count >= 1 && item.count <= 3);
}
async function directory(req,res) {
  const {mode,id} = req.query;
  const term = String(req.query.q || '').trim().slice(0,100);
  if (['artists','matches'].includes(mode) ? !term : !/^\d{1,15}$/.test(id || '')) return res.status(400).json({error:'Invalid lookup.'});
  try {
    let data;
    if (mode === 'portrait') {
      const page = await fetch('https://music.apple.com/us/artist/' + id,{signal:AbortSignal.timeout(4500)});
      if (!page.ok) return res.status(404).end();
      const tags = (await page.text()).match(/<meta\b[^>]*>/gi) || [];
      const tag = tags.find(tag => /property=["']og:image["']/i.test(tag));
      const image = tag?.match(/content=["'](https:\/\/[^"'<>]+)["']/i)?.[1];
      if (!image || !/^https:\/\/[^/]+\.mzstatic\.com\//i.test(image)) return res.status(404).end();
      res.setHeader('Cache-Control','public, max-age=86400, s-maxage=604800');
      return res.redirect(302,image);
    }
    if (mode === 'matches') {
      data = {tracks:songs(await lookup('/search',{term,entity:'song',limit:'35'}))};
    } else if (mode === 'artists') {
      const [results,images] = await Promise.all([lookup('/search',{term,entity:'musicArtist',limit:'16'}),portraits(term)]);
      data = {artists:results.filter(item => item.artistId && item.artistName).map(item => ({...artist(item),picture:images.get(nameKey(item.artistName)) || ''}))};
    } else if (mode === 'artist') {
      const [releases,tracks] = await Promise.all([lookup('/lookup',{id,entity:'album',limit:'200'}),lookup('/lookup',{id,entity:'song',sort:'popular',limit:'30'})]);
      const identity = [...releases,...tracks].find(item => item.wrapperType === 'artist' && String(item.artistId) === id);
      if (!identity) return res.status(404).json({error:'Artist unavailable.'});
      const images = await portraits(identity.artistName);
      const discography = releases.filter(item => item.wrapperType === 'collection' && String(item.artistId) === id)
        .sort((a,b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || ''))).map(album);
      const seen = new Set();
      const top = songs(tracks.filter(item => String(item.artistId) === id)).filter(track => {
        const key = nameKey(track.title);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0,5);
      data = {artist:{...artist(identity),picture:images.get(nameKey(identity.artistName)) || ''},
        albums:discography.filter(item => !isSingle(item)),singles:discography.filter(isSingle),tracks:top};
    } else {
      const result = await lookup('/lookup',{id,entity:'song',limit:'200'});
      const release = result.find(item => item.wrapperType === 'collection' && String(item.collectionId) === id);
      if (!release) return res.status(404).json({error:'Album unavailable.'});
      data = {album:album(release),tracks:songs(result)};
    }
    res.setHeader('Cache-Control','public, max-age=600, s-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json(data);
  } catch { return res.status(503).json({error:'Music directory is temporarily unavailable.'}); }
}
module.exports = {directory,modes};
