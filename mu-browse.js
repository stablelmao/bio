const queryBox = $('query');
const directoryCache = new Map();
let browsingRequest, searchDelay, searchFilter = 'all';
let recent;
try { recent = JSON.parse(localStorage.getItem('mu-recent-searches') || '[]'); } catch {}
if (!Array.isArray(recent)) recent = [];
function rememberSearch(term) {
  if (!term) return;
  recent = [term,...recent.filter(item => typeof item === 'string' && item.toLowerCase() !== term.toLowerCase())].slice(0,8);
  try { localStorage.setItem('mu-recent-searches',JSON.stringify(recent)); } catch {}
}
function beginRequest() {
  clearTimeout(searchDelay);
  browsingRequest?.abort();
  browsingRequest = new AbortController();
  return browsingRequest.signal;
}
async function directory(mode,params,signal) {
  const key = new URLSearchParams({mode,...params}).toString();
  if (directoryCache.has(key)) return directoryCache.get(key);
  const response = await fetch('/api/mu?' + key,{signal});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Could not load the catalog.');
  if (directoryCache.size > 80) directoryCache.clear();
  directoryCache.set(key,data);
  return data;
}
function routeLink(label,hash,cls) {
  const link = element('a',label,cls);
  link.href = hash;
  return link;
}
function artistPortrait(item) {
  const portrait = element('span',item.name.trim().split(/\s+/).slice(0,2).map(word => word[0]).join(''), 'artist-monogram');
  portrait.setAttribute('aria-hidden','true');
  if (item.picture || item.id) {
    const img = new Image();
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => img.remove();
    img.src = item.picture || '/api/mu?mode=portrait&id=' + encodeURIComponent(item.id);
    portrait.append(img);
  }
  return portrait;
}
function cardGridArtist(item) {
  const params = new URLSearchParams({name:item.name});
  if (item.id) params.set('id',item.id);
  const link = routeLink('', '#artist?' + params, 'artist-card');
  const label = element('span',null,'artist-label');
  label.append(element('strong',item.name));
  if (item.genre) label.append(element('small',item.genre));
  link.append(artistPortrait(item),label);
  return link;
}
function titleRows(box,tracks) {
  tracks.forEach((track,i) => {
    const item = row(track,{label:'+',aria:'Add ' + track.title + ' to a playlist',action:() => addToPlaylist(track)});
    item.querySelector('.track-main').onclick = () => {
      if (!$('searchPage').hidden) rememberSearch(queryBox.value.trim());
      playTracks(tracks,i);
    };
    box.append(item);
  });
}
function searchHash(term,filter) {
  const params = new URLSearchParams();
  if (term) params.set('q',term);
  if (filter !== 'all') params.set('filter',filter);
  return '#search' + (params.size ? '?' + params : '');
}
function updateFilters(term) {
  $('searchArtists').hidden = !term || searchFilter === 'songs';
  $('searchSongs').hidden = !term || searchFilter === 'artists';
  for (const button of $('resultFilters').querySelectorAll('button'))
    button.setAttribute('aria-pressed',String(button.dataset.filter === searchFilter));
}
function showRecent() {
  const box = $('recents');
  box.replaceChildren();
  if (!recent.length) return;
  box.append(element('h2','Recent searches'));
  const items = element('div',null,'search-recents');
  for (const term of recent) items.append(routeLink(term,searchHash(term,'all')));
  box.append(items);
}
let redrawSearch;
function search(term, immediate) {
  redrawSearch = null;
  $('allArtists').hidden = $('allSongs').hidden = true;
  const signal = beginRequest();
  $('artistResults').replaceChildren();
  $('songResults').replaceChildren();
  $('recents').hidden = Boolean(term);
  updateFilters(term);
  if (!term) { showRecent(); return; }
  $('artistsStatus').textContent = $('songsStatus').textContent = 'Searching…';
  const render = () => {
    let artists = [], catalog = [], suggested = [], pendingSongs = 2, songSources = 0;
    let artistsDone = false, artistError = false;
    const draw = () => {
      if (signal.aborted) return;
      const byName = new Set(artists.map(item => normalizeName(item.name)));
      const candidates = [...artists];
      for (const track of catalog) {
        const key = normalizeName(track.channel || '');
        if (key && !byName.has(key)) {
          candidates.push({name:track.channel});
          byName.add(key);
        }
      }
      const people = musicRanking.rankArtists(term,candidates);
      const songs = musicRanking.rankSongs(term,catalog,suggested,artists);
      $('artistResults').replaceChildren(...people.slice(0,searchFilter === 'all' ? 3 : 16).map(cardGridArtist));
      $('artistsStatus').textContent = people.length ? '' : !artistsDone ? 'Searching…' : artistError ? 'Artist search is unavailable.' : 'No matching artists.';
      $('songResults').replaceChildren();
      const visible = searchFilter === 'all' ? songs.slice(0,6) : songs;
      titleRows($('songResults'),visible);
      $('songsStatus').textContent = songs.length ? '' : pendingSongs ? 'Searching…' : songSources ? 'No matching songs.' : 'Song search is unavailable. Try again.';
      $('allSongs').hidden = searchFilter !== 'all' || songs.length <= visible.length;
      $('allArtists').hidden = searchFilter !== 'all' || people.length <= 3;
    };
    redrawSearch = draw;
    directory('artists',{q:term},signal).then(data => { artists = data.artists; })
      .catch(() => { artistError = true; }).finally(() => { artistsDone = true; draw(); });
    const loadSongs = async (request,setRows) => {
      try { setRows(await request); songSources++; }
      catch { /* The other catalog can still supply results. */ }
      finally { pendingSongs--; draw(); }
    };
    loadSongs(catalogSearch(term,signal),rows => { catalog = rows; });
    loadSongs(directory('matches',{q:term},signal),data => { suggested = data.tracks; });
  };
  if (immediate) render(); else searchDelay = setTimeout(render,300);
}
function writeSearch(immediate) {
  const term = queryBox.value.trim();
  history.replaceState(history.state,'',searchHash(term,searchFilter));
  if (immediate) rememberSearch(term);
  search(term,immediate);
}
queryBox.oninput = () => writeSearch(false);
$('search').onsubmit = event => { event.preventDefault(); writeSearch(true); };
for (const button of $('resultFilters').querySelectorAll('button')) button.onclick = () => {
  searchFilter = button.dataset.filter;
  const term = queryBox.value.trim();
  history.replaceState(history.state,'',searchHash(term,searchFilter));
  updateFilters(term);
  redrawSearch?.();
};
$('allSongs').onclick = () => document.querySelector('[data-filter="songs"]').click();
$('allArtists').onclick = () => document.querySelector('[data-filter="artists"]').click();
function albumsGrid(albums) {
  const grid = element('div',null,'release-grid');
  for (const release of albums) {
    const link = routeLink('', '#album?' + new URLSearchParams({id:release.id,name:release.name}), 'release-card');
    if (release.artwork) {
      const image = new Image(); image.alt = ''; image.loading = 'lazy'; image.src = release.artwork; link.append(image);
    }
    link.append(element('strong',release.name),element('small',release.year));
    grid.append(link);
  }
  return grid;
}
function listTracks(body,tracks,label) {
  if (!tracks.length) return;
  const heading = element('div',null,'row-title');
  heading.append(element('h2',label),control('Play all',() => playTracks(tracks)));
  const list = element('div',null,'profile-tracks');
  titleRows(list,tracks);
  body.append(heading,list);
}
async function renderDetail(type,params,signal) {
  const name = params.get('name') || '';
  let id = params.get('id');
  const body = $('detailBody');
  body.replaceChildren();
  $('artistPhoto').replaceChildren();
  $('detailHeading').textContent = name || (type === 'album' ? 'Album' : 'Artist');
  $('detailStatus').textContent = 'Loading…';
  try {
    if (type === 'album') {
      const {album,tracks} = await directory('album',{id},signal);
      if (signal.aborted) return;
      $('detailHeading').textContent = album.name;
      const meta = element('p',null,'detail-meta');
      meta.append(artistLink({channel:album.artist,directoryArtistId:album.artistId}),document.createTextNode(' · ' + album.year));
      if (album.artwork) { const img = new Image(); img.src = album.artwork; img.alt = ''; img.className = 'album-art'; body.append(img); }
      body.append(meta);
      listTracks(body,tracks,'Tracks');
      $('detailStatus').textContent = tracks.length ? '' : 'No tracks available.';
      return;
    }
    if (!id && name) {
      const {artists} = await directory('artists',{q:name},signal);
      id = artists.find(a => normalizeName(a.name) === normalizeName(name))?.id;
    }
    if (id) {
      const {artist,tracks,albums,singles = []} = await directory('artist',{id},signal);
      if (signal.aborted) return;
      $('detailHeading').textContent = artist.name;
      $('artistPhoto').append(artistPortrait(artist));
      if (artist.genre) body.append(element('p',artist.genre,'detail-meta'));
      listTracks(body,tracks.slice(0,5),'Top 5 songs');
      if (albums.length) body.append(element('h2','Albums'),albumsGrid(albums));
      if (singles.length) body.append(element('h2','Singles & EPs'),albumsGrid(singles));
      $('detailStatus').textContent = albums.length || singles.length || tracks.length ? '' : 'No releases available.';
      return;
    }
    throw Error('Artist unavailable.');
  } catch (error) {
    if (signal.aborted) return;
    if (type === 'artist' && name) {
      try {
        const tracks = (await catalogSearch(name,signal)).filter(track => artistNames(track.channel).includes(normalizeName(name)));
        if (signal.aborted) return;
        if (tracks.length) {
          listTracks(body,tracks.slice(0,5),'Top songs');
          $('detailStatus').textContent = 'The full discography is unavailable.';
          return;
        }
      } catch { if (signal.aborted) return; }
    }
    $('detailStatus').textContent = error.message;
    body.append(control('Try again',displayPage));
  }
}
function displayPage() {
  const signal = beginRequest();
  const [type,query = ''] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  const searchMode = type === 'search' || type === 'songSearch';
  const browsing = searchMode || type === 'artist' || type === 'album';
  document.body.classList.toggle('browsing-music',browsing);
  document.querySelector('.discovery-layout').hidden = browsing;
  document.querySelector('.media-heading').hidden = browsing;
  $('musicBrowser').hidden = !browsing;
  if (!browsing) {
    document.title = 'mu(sic) • aidan.im';
    document.getElementById(type)?.scrollIntoView();
    return;
  }
  window.scrollTo(0,0);
  $('searchPage').hidden = !searchMode;
  $('detailPage').hidden = searchMode;
  $('browseSearch').hidden = searchMode;
  if (searchMode) {
    document.title = 'Search • aidan.im';
    queryBox.value = params.get('q') || '';
    searchFilter = ['artists','songs'].includes(params.get('filter')) ? params.get('filter') : 'all';
    search(queryBox.value,true);
    queryBox.focus({preventScroll:true});
  } else {
    document.title = (params.get('name') || 'Music') + ' • aidan.im';
    renderDetail(type,params,signal);
    $('detailHeading').focus({preventScroll:true});
  }
}
document.addEventListener('click',event => {
  if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href^="#"]');
  if (!link || link.target === '_blank') return;
  event.preventDefault();
  if (!$('searchPage').hidden && !$('musicBrowser').hidden) rememberSearch(queryBox.value.trim());
  if (location.hash !== link.hash) history.pushState({musicDepth:(history.state?.musicDepth || 0) + 1},'',link.hash);
  displayPage();
});
$('browseBack').onclick = () => {
  if (history.state?.musicDepth) history.back();
  else { history.replaceState(null,'',location.pathname + location.search); displayPage(); window.scrollTo(0,0); }
};
window.addEventListener('popstate',displayPage);
$('browseToggle').onclick = () => $('toggle').click();
for (const name of ['playing','pause','ended']) audio.addEventListener(name,() => {
  $('browseToggle').textContent = audio.paused ? 'Play' : 'Pause';
});
displayPage();
