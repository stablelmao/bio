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
  button.addEventListener('click', () => {
    if (type !== mediaType) document.querySelector(`[data-type="${type}"]`).click();
    openWatch(item, button);
  });
  return button;
}

async function search() {
  searchRequest?.abort();
  const controller = new AbortController();
  searchRequest = controller;
  const q = query.value.trim();
  const label = mediaType === 'tv' ? 'TV shows' : 'movies';
  const curated = collection === 'picks';
  const owner = mediaType === 'tv' ? 'Ryver' : 'Jaiden';
  byId('picks').textContent = owner + "'s picks";
  byId('popular').setAttribute('aria-pressed', String(!curated));
  byId('picks').setAttribute('aria-pressed', String(curated));
  byId('heading').textContent = curated ? owner + "'s picks" : q ? 'Search results' : 'Popular ' + label;
  byId('status').textContent = 'Finding ' + label + '…';
  byId('results').replaceChildren();
  try {
    let items;
    if (curated) {
      const endpoint = mediaType === 'tv' ? '/api/tv-admin' : '/api/st-admin';
      const response = await fetch(endpoint, {cache:'no-store', signal:controller.signal});
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.picks)) throw Error('Could not load picks.');
      items = data.picks;
    } else {
      const data = await request({mode:'search', type:mediaType, q}, controller.signal);
      items = data.results;
    }
    if (controller.signal.aborted) return;
    byId('results').replaceChildren(...items.map(item => {
      if (!curated) return card(item);
      const article = document.createElement('article');
      article.className = 'curated-pick';
      const reason = document.createElement('p');
      reason.className = 'pick-reason';
      reason.textContent = item.reason;
      article.append(card(item), reason);
      return article;
    }));
    byId('status').textContent = items.length ? '' : curated ? owner + "'s favorites are coming soon." : 'No ' + label + ' found.';
  } catch (error) {
    if (!controller.signal.aborted) byId('status').textContent = error.message;
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
  frame.src = data.url;
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
      season.value = (seasons.find(s => s.number > 0) || seasons[0]).number;
    }
    if (mediaType === 'tv' && stage !== 'episode') {
      fillOptions(episode, []);
      const {episodes} = await request({mode:'episodes', id:selected.id, season:season.value}, signal);
      if (signal.aborted) return;
      fillOptions(episode, episodes, e => e.name ? e.number + ' · ' + e.name : 'Episode ' + e.number);
      if (!episodes.length) throw Error('No episodes available for this season.');
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
  search();
});
const typeButtons = document.querySelectorAll('[data-type]');
for (const button of typeButtons) {
  button.addEventListener('click', () => {
    if (button.dataset.type === mediaType) return;
    closeWatch();
    mediaType = button.dataset.type;
    typeButtons.forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
    const prompt = mediaType === 'tv' ? 'Search TV shows' : 'Search movies';
    query.placeholder = prompt + '…';
    byId('query-label').textContent = prompt;
    search();
  });
}
search();

byId('popular').addEventListener('click', () => {
  collection = 'popular';
  query.value = '';
  search();
});
byId('picks').addEventListener('click', () => {
  collection = 'picks';
  query.value = '';
  search();
});
