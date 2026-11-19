const byId = id => document.getElementById(id);
const query = byId('query');
const season = byId('season');
const episode = byId('episode');
const frame = byId('frame');
let mediaType = 'movie';
let collection = 'popular';
let searchRequest;
let watchRequest;
let selected;
let selectedCard;

async function request(params, signal) {
  const response = await fetch('/api/st?' + new URLSearchParams(params), {signal});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Request failed. Try again.');
  return data;
}

function card(item, type = mediaType) {
  const button = document.createElement('button');
  button.className = 'movie';
  button.type = 'button';
  const poster = document.createElement(item.poster ? 'img' : 'span');
  poster.className = 'poster';
  if (item.poster) {
    poster.alt = '';
    poster.loading = 'lazy';
    poster.src = '/api/st?' + new URLSearchParams({mode:'image', path:item.poster});
  }
  const title = document.createElement('strong');
  title.textContent = item.title || 'Untitled';
  button.append(poster, title);
  if (item.date) {
    const year = document.createElement('small');
    year.textContent = item.date.slice(0, 4);
    button.append(year);
  }
  if (Number(item.rating) > 0 || item.type) {
    const detail = document.createElement('span');
    detail.className = 'movie-detail';
    const rating = Number(item.rating) > 0 ? '★ ' + Number(item.rating).toFixed(1) + '/10' : '';
    const resume = item.type ? [item.type === 'tv' ? 'S' + item.season + ' E' + item.episode : '', item.progress >= 1 ? Math.floor(item.progress / 60) + 'm watched' : 'Opened'].filter(Boolean).join(' · ') : '';
    detail.textContent = [rating, resume].filter(Boolean).join(' · ');
    button.append(detail);
  }
  button.addEventListener('click', () => {
    if (type !== mediaType) document.querySelector(`[data-type="${type}"]`).click();
    openWatch(item, button);
  });
  return button;
}

const labels = { popular:'Popular', new:'New releases', rated:'Top rated', history:'Continue watching', picks:'Picks', genre:'Genre' };
const commonGenres = [[35,'Comedy'],[80,'Crime'],[99,'Documentary'],[18,'Drama'],[10751,'Family'],[9648,'Mystery'],[16,'Animation']];
let page = 1;
let historyItems = [];
try {
  const saved = JSON.parse(localStorage.getItem('st-watch-history') || '[]');
  if (Array.isArray(saved)) historyItems = saved.filter(row => row && row.id && ['movie','tv'].includes(row.type)).slice(0,60);
} catch {}
function writeHistory(items) {
  historyItems = items.slice(0,60);
  try { localStorage.setItem('st-watch-history', JSON.stringify(historyItems)); } catch {}
}
function record(progress, completed = false) {
  if (!selected) return;
  const others = historyItems.filter(entry => entry.type !== mediaType || String(entry.id) !== String(selected.id));
  if (completed) writeHistory(others);
  else writeHistory([{id:selected.id, title:selected.title, date:selected.date, poster:selected.poster, rating:selected.rating,
    type:mediaType, season:season.value, episode:episode.value, progress}, ...others]);
}
function fillGenres() {
  const extra = mediaType === 'movie' ? [[28,'Action'],[27,'Horror'],[10749,'Romance'],[878,'Science fiction']] : [[10759,'Action & adventure'],[10765,'Sci-fi & fantasy'],[10764,'Reality']];
  byId('genre').replaceChildren(new Option('Choose a genre',''), ...[...commonGenres,...extra].sort((a,b) => a[1].localeCompare(b[1])).map(([id,label])=>new Option(label,id)));
}
async function search(append = false) {
  searchRequest?.abort();
  const controller = new AbortController();
  searchRequest = controller;
  if (!append) page = 1;
  const nextPage = append ? page + 1 : 1;
  const q = query.value.trim();
  const curated = collection === 'picks';
  const owner = mediaType === 'tv' ? 'Ryver' : 'Jaiden';
  byId('picks').textContent = owner + "'s picks";
  for (const button of document.querySelectorAll('[data-view]'))
    button.setAttribute('aria-pressed', String(button.dataset.view === collection && !q));
  byId('heading').textContent = q ? 'Search results' : curated ? byId('picks').textContent :
    collection === 'genre' ? byId('genre').selectedOptions[0].text : labels[collection];
  byId('moreTitles').hidden = true;
  byId('status').textContent = 'Loading titles…';
  if (!append) byId('results').replaceChildren();
  try {
    let items, pages = 1;
    if (collection === 'history') items = historyItems.filter(entry => entry.type === mediaType);
    else if (curated) {
      const response = await fetch(mediaType === 'tv' ? '/api/tv-admin' : '/api/st-admin', {cache:'no-store', signal:controller.signal});
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.picks)) throw Error('Could not load picks.');
      items = data.picks;
    } else {
      const data = await request({mode:'search', type:mediaType, q, collection, genre:byId('genre').value, page:nextPage}, controller.signal);
      items = data.results;
      pages = data.pages;
    }
    if (controller.signal.aborted) return;
    page = nextPage;
    byId('results').append(...items.map(item => {
      if (!curated) return card(item);
      const article = document.createElement('article');
      article.className = 'curated-pick';
      const reason = document.createElement('p');
      reason.className = 'pick-reason';
      reason.textContent = item.reason;
      article.append(card(item), reason);
      return article;
    }));
    byId('moreTitles').hidden = page >= pages;
    byId('status').textContent = items.length ? '' : collection === 'history' ? 'Titles you open on this device appear here.' : 'No titles found.';
  } catch (error) {
    if (!controller.signal.aborted) {
      byId('status').textContent = error.message;
      if (append) byId('moreTitles').hidden = false;
    }
  }
}
function clearPlayer() {
  byId('player').hidden = true;
  frame.removeAttribute('src');
}

function closeWatch() {
  watchRequest?.abort();
  clearPlayer();
  selected = null;
  byId('watch').hidden = true;
}

function fillOptions(select, items, title) {
  select.replaceChildren(...items.map(item => new Option(title(item), item.number)));
  select.disabled = !items.length;
}

async function loadPlayer(signal) {
  const params = {mode:'player', type:mediaType, id:selected.id};
  if (mediaType === 'tv') Object.assign(params, {season:season.value, episode:episode.value});
  const data = await request(params, signal);
  if (signal.aborted) return;
  frame.title = mediaType === 'movie' ? selected.title :
    selected.title + ', season ' + season.value + ', episode ' + episode.value;
  const previous = historyItems.find(entry => entry.type === mediaType && String(entry.id) === String(selected.id));
  const sameEpisode = mediaType === 'movie' || (previous?.season === season.value && previous?.episode === episode.value);
  const start = sameEpisode ? Number(previous?.progress) || 0 : 0;
  const url = new URL(data.url);
  if (start > 0) url.searchParams.set('startAt', Math.floor(start));
  frame.src = url.href;
  record(start);
  byId('player').hidden = false;
  byId('watch-status').textContent = '';
}

async function updateWatch(stage) {
  watchRequest?.abort();
  const controller = new AbortController();
  watchRequest = controller;
  const signal = controller.signal;
  clearPlayer();
  byId('watch-status').textContent = 'Loading…';
  try {
    if (mediaType === 'tv' && stage === 'show') {
      fillOptions(season, []);
      fillOptions(episode, []);
      const {seasons} = await request({mode:'seasons', id:selected.id}, signal);
      if (signal.aborted) return;
      fillOptions(season, seasons, s => s.name || 'Season ' + s.number);
      if (!seasons.length) throw Error('No seasons available.');
      const last = historyItems.find(entry => entry.type === 'tv' && String(entry.id) === String(selected.id));
      season.value = (seasons.find(s => String(s.number) === last?.season) || seasons.find(s => s.number > 0) || seasons[0]).number;
    }
    if (mediaType === 'tv' && stage !== 'episode') {
      fillOptions(episode, []);
      const {episodes} = await request({mode:'episodes', id:selected.id, season:season.value}, signal);
      if (signal.aborted) return;
      fillOptions(episode, episodes, e => e.name ? e.number + ' · ' + e.name : 'Episode ' + e.number);
      if (!episodes.length) throw Error('No episodes available for this season.');
      const last = historyItems.find(entry => entry.type === 'tv' && String(entry.id) === String(selected.id));
      if (last?.season === season.value && episodes.some(e => String(e.number) === last.episode)) episode.value = last.episode;
    }
    await loadPlayer(signal);
  } catch (error) {
    if (!signal.aborted) byId('watch-status').textContent = error.message;
  }
}

function openWatch(item, button) {
  selected = item;
  selectedCard = button;
  byId('watch-title').textContent = item.title;
  byId('series').hidden = mediaType !== 'tv';
  byId('watch').hidden = false;
  byId('close').focus({preventScroll:true});
  byId('watch').scrollIntoView({block:'start'});
  updateWatch('show');
}

season.addEventListener('change', () => updateWatch('season'));
episode.addEventListener('change', () => updateWatch('episode'));
byId('close').addEventListener('click', () => {
  closeWatch();
  if (selectedCard?.isConnected) selectedCard.focus();
  else query.focus();
});
byId('search').addEventListener('submit', event => {
  event.preventDefault();
  collection = 'popular';
  byId('genre').value = '';
  search();
});
const typeButtons = document.querySelectorAll('[data-type]');
for (const button of typeButtons) {
  button.addEventListener('click', () => {
    if (button.dataset.type === mediaType) return;
    closeWatch();
    mediaType = button.dataset.type;
    fillGenres();
    if (collection === 'genre') collection = 'popular';
    typeButtons.forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
    const prompt = mediaType === 'tv' ? 'Search TV shows' : 'Search movies';
    query.placeholder = prompt + '…';
    byId('query-label').textContent = prompt;
    search();
  });
}
fillGenres();
search();
function browse(view) {
  collection = view;
  query.value = '';
  if (view !== 'genre') byId('genre').value = '';
  search();
}
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => browse(button.dataset.view));
byId('genre').onchange = () => browse(byId('genre').value ? 'genre' : 'popular');
byId('moreTitles').onclick = () => search(true);
window.addEventListener('message', event => {
  if (!selected || event.source !== frame.contentWindow || event.origin !== 'https://math.aidan.im' || event.data?.type !== 'PLAYER_EVENT') return;
  const data = event.data.data;
  const info = data?.player_info;
  if (!info || String(info.tmdb) !== String(selected.id) || info.mediaType !== mediaType) return;
  if (mediaType === 'tv' && (String(info.season) !== season.value || String(info.episode) !== episode.value)) return;
  if (data.player_status === 'completed') record(0,true);
  else if (['playing','paused','seeked'].includes(data.player_status) && Number.isFinite(data.player_progress) && data.player_progress >= 0) record(Math.floor(data.player_progress));
});
