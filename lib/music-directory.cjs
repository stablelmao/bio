const modes = new Set(['artists','artist','album']);

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
async function directory(req,res) {
  const {mode,id} = req.query;
  const term = String(req.query.q || '').trim().slice(0,100);
  if (mode === 'artists' ? !term : !/^\d{1,15}$/.test(id || '')) return res.status(400).json({error:'Invalid lookup.'});
  try {
    let data;
    if (mode === 'artists') {
      const results = await lookup('/search',{term,entity:'musicArtist',limit:'12'});
      data = {artists:results.filter(item => item.artistId && item.artistName).map(artist)};
    } else if (mode === 'artist') {
      const [releases,tracks] = await Promise.all([lookup('/lookup',{id,entity:'album',limit:'200'}),lookup('/lookup',{id,entity:'song',limit:'25'})]);
      const identity = [...releases,...tracks].find(item => item.wrapperType === 'artist' && String(item.artistId) === id);
      if (!identity) return res.status(404).json({error:'Artist unavailable.'});
      data = {artist:artist(identity), albums:releases.filter(item => item.wrapperType === 'collection').map(album), tracks:songs(tracks)};
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
