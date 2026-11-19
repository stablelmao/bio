(function () {
  function normalize(value) {
    return String(value || '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu,'')
      .replace(/&/g,' and ').replace(/['’]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  }
  function matches(query, text) {
    if (!query || !text) return 0;
    if (text === query) return 4;
    if (text.startsWith(query + ' ')) return 3;
    if ((' ' + text + ' ').includes(' ' + query + ' ')) return 2;
    const words = text.split(' ');
    if (query.split(' ').every(token => words.some(word => word.startsWith(token)))) return 1;
    return 0;
  }
  function rankArtists(term, artists) {
    const query = normalize(term);
    return artists.map(artist => ({artist,score:matches(query,normalize(artist.name))}))
      .filter(item => item.score).sort((a,b) => b.score - a.score)
      .map(item => item.artist);
  }
  function rankSongs(term, catalog, suggested, artists = []) {
    const query = normalize(term);
    const artistQuery = artists.some(item => normalize(item.name) === query);
    const rows = new Map();
    // Keep the provider's relevance order while preferring a directly playable recording.
    for (const track of [...suggested,...catalog]) {
      const title = normalize(track.title), artist = normalize(track.channel);
      if (!title || !artist) continue;
      const key = title + '\n' + artist;
      if (rows.has(key)) {
        if (track.id && !rows.get(key).track.id) rows.get(key).track = track;
        continue;
      }
      const pair = matches(query,artist + ' ' + title);
      const reverse = matches(query,title + ' ' + artist);
      const titleMatch = matches(query,title), artistMatch = matches(query,artist);
      let score = Math.max(titleMatch * 20, artistMatch * 19, pair * 12, reverse * 12);
      if (artistQuery && artistMatch === 4) score = 90;
      if (pair === 4 || reverse === 4) score = 100;
      if (score === 0) continue;
      if (!/\b(karaoke|tribute|cover|instrumental|remix|sped up|slowed|live)\b/.test(query) &&
          /\b(karaoke|tribute|cover version|instrumental|remix|sped up|slowed|live version)\b/.test(title + ' ' + artist + ' ' + normalize(track.album))) score -= 10;
      rows.set(key,{track,score});
    }
    if (!rows.size) return suggested.slice(0,8);
    return [...rows.values()].sort((a,b) => b.score - a.score).map(row => row.track);
  }
  const ranking = {rankSongs,rankArtists};
  if (typeof module !== 'undefined' && module.exports) module.exports = ranking;
  else window.musicRanking = ranking;
})();
