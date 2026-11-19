const $=id=>document.getElementById(id),API='https://api.aidan.im/api/mu',MDATA='https://mdata.aidan.im/api/mu',audio=$('audio');
function fillCover(box,track){box.replaceChildren();if(!track.cover){box.textContent='mu!';return}const img=document.createElement('img');img.alt='';img.loading='lazy';let fallback=false;img.onerror=()=>{if(!fallback){fallback=true;img.src=API+'?mode=cover&id='+encodeURIComponent(track.cover)}else{box.textContent='mu!'}};img.src=MDATA+'?mode=cover&id='+encodeURIComponent(track.cover);box.append(img)}
let playlists;try{playlists=JSON.parse(localStorage.getItem('mu-hifi-playlists')||'[]');if(!Array.isArray(playlists))playlists=[]}catch{playlists=[]}
let picks=[],queue=[],current=-1,shuffle=false,repeat=false;
function save(){try{localStorage.setItem('mu-hifi-playlists',JSON.stringify(playlists))}catch{$('playerStatus').textContent='Could not save playlists on this device.'}renderPlaylists()}
function time(s){if(!Number.isFinite(s))return '0:00';s=Math.floor(s);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
function row(track, extra) {
  const el = document.createElement('div');
  el.className = 'track';
  const image = document.createElement('div');
  image.className = 'thumb';
  fillCover(image, track);
  const copy = document.createElement('div');
  copy.className = 'track-copy';
  const heading = document.createElement('div');
  heading.className = 'track-heading';
  const info = document.createElement('div');
  info.className = 'track-main';
  info.tabIndex = 0;
  info.setAttribute('role', 'button');
  info.setAttribute('aria-label', 'Play ' + track.title);
  const title = document.createElement('strong');
  title.textContent = track.title;
  info.append(title);
  info.onclick = () => playTracks([track], 0);
  info.onkeydown = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      info.click();
    }
  };
  heading.append(info);
  if (extra) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = extra.label;
    button.setAttribute('aria-label', extra.aria || extra.label);
    button.onclick = extra.action;
    heading.append(button);
  }
  const artist = document.createElement('small');
  artist.textContent = [track.channel, track.album, track.duration ? time(track.duration) : ''].filter(Boolean).join(' · ');
  copy.append(heading, artist);
  el.append(image, copy);
  return el;
}
function showTrack(t){$('title').textContent=t.title;$('artist').textContent=t.channel;$('album').textContent=t.album||'';fillCover($('cover'),t);if('mediaSession' in navigator&&window.MediaMetadata){const metadata={title:t.title,artist:t.channel,album:t.album||''};if(t.cover)metadata.artwork=[{src:API+'?mode=cover&id='+encodeURIComponent(t.cover),sizes:'320x320',type:'image/jpeg'}];navigator.mediaSession.metadata=new MediaMetadata(metadata)}$('playerStatus').textContent='Loading track…'}
let currentStream=null,objectUrl=null;
function bufferChunk(buffer,data,signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(Error('Cancelled'));const done=()=>{buffer.removeEventListener('error',fail);resolve()};const fail=()=>{buffer.removeEventListener('updateend',done);reject(Error('Audio buffer failed'))};buffer.addEventListener('updateend',done,{once:true});buffer.addEventListener('error',fail,{once:true});try{buffer.appendBuffer(data)}catch(e){buffer.removeEventListener('updateend',done);buffer.removeEventListener('error',fail);reject(e)}})}
async function startTrack(t){showTrack(t);if(currentStream)currentStream.abort();const controller=new AbortController();currentStream=controller;audio.pause();audio.removeAttribute('src');audio.load();if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null}try{const r=await fetch(`${API}?mode=manifest&id=${encodeURIComponent(t.id)}`,{signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to load track');if(controller.signal.aborted)return;if(data.type==='direct'){audio.src=`${API}?mode=audio&id=${encodeURIComponent(t.id)}`;audio.play().catch(()=>{$('playerStatus').textContent='Press play to start the song.'});return}const mime=`audio/mp4; codecs="${data.codecs}"`;if(!window.MediaSource||!MediaSource.isTypeSupported(mime)||new URLSearchParams(location.search).get('audio')==='compat'){if(!audio.canPlayType(mime))throw Error('Your browser or device cannot decode this audio format.');$('playerStatus').textContent='Preparing audio for your browser…';const parts=[];let size=0;for(const token of data.segments){const part=await fetch(`${API}?mode=segment&token=${encodeURIComponent(token)}`,{signal:controller.signal});if(!part.ok)throw Error('Audio segment could not load.');const bytes=await part.arrayBuffer();size+=bytes.byteLength;if(size>100*1024*1024)throw Error('This track is too large for compatibility playback.');parts.push(bytes)}if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(new Blob(parts,{type:'audio/mp4'}));audio.src=objectUrl;await audio.play().catch(()=>{$('playerStatus').textContent='Press play to start the song.'});return}const source=new MediaSource();objectUrl=URL.createObjectURL(source);audio.src=objectUrl;audio.play().catch(()=>{if(!controller.signal.aborted)$('playerStatus').textContent='Press play to start the song.'});await new Promise((resolve,reject)=>{source.addEventListener('sourceopen',resolve,{once:true});controller.signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true})});if(controller.signal.aborted)return;const buffer=source.addSourceBuffer(mime);for(const token of data.segments){if(controller.signal.aborted)return;const part=await fetch(`${API}?mode=segment&token=${encodeURIComponent(token)}`,{signal:controller.signal});if(!part.ok)throw Error('Audio segment could not load.');await bufferChunk(buffer,await part.arrayBuffer(),controller.signal)}if(!controller.signal.aborted&&source.readyState==='open')source.endOfStream()}catch(e){if(!controller.signal.aborted)$('playerStatus').textContent=e.message||'This track could not play.'}}
function playTracks(tracks,index=0){if(!tracks.length)return;queue=tracks.slice();current=index;startTrack(queue[current])}
function move(delta){if(!queue.length)return;current=shuffle&&queue.length>1?Math.floor(Math.random()*queue.length):(current+delta+queue.length)%queue.length;startTrack(queue[current])}
audio.addEventListener('playing',()=>{$('toggleIcon').setAttribute('href','#pause-icon');$('playerStatus').textContent='playing now.'});audio.addEventListener('pause',()=>{$('toggleIcon').setAttribute('href','#play-icon')});audio.addEventListener('error',()=>{$('playerStatus').textContent='This track could not play. The music service may be unavailable.'});audio.addEventListener('ended',()=>{if(repeat){audio.currentTime=0;audio.play().catch(()=>{})}else if(queue.length>1)move(1)});audio.addEventListener('timeupdate',()=>{$('elapsed').textContent=time(audio.currentTime);$('duration').textContent=time(audio.duration);if(document.activeElement!==$('seek'))$('seek').value=audio.duration?Math.floor(audio.currentTime/audio.duration*1000):0});$('seek').oninput=e=>{if(audio.duration)audio.currentTime=Number(e.target.value)/1000*audio.duration};
$('toggle').onclick=()=>{if(!queue.length){$('playerStatus').textContent='Choose a song first.';return}if(!audio.paused)audio.pause();else audio.play().catch(()=>{$('playerStatus').textContent='Could not play this track.'})};$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);$('shuffle').onclick=()=>{shuffle=!shuffle;$('shuffle').classList.toggle('active',shuffle);$('shuffle').setAttribute('aria-pressed',shuffle)};$('repeat').onclick=()=>{repeat=!repeat;$('repeat').classList.toggle('active',repeat);$('repeat').setAttribute('aria-pressed',repeat)};
const songSearch = $('songSearch');
const songQuery = $('query');
const suggestions = $('suggestions');
let searchTimer;
let activeSearch;

function dismissSuggestions() {
  clearTimeout(searchTimer);
  activeSearch?.abort();
  suggestions.hidden = true;
}

async function findSongs(term) {
  const controller = new AbortController();
  activeSearch = controller;
  const params = '?mode=search&q=' + encodeURIComponent(term);
  try {
    let response;
    try {
      response = await fetch(MDATA + params, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)])
      });
      if (!response.ok) throw Error('Metadata search unavailable.');
    } catch (error) {
      if (controller.signal.aborted) return;
      response = await fetch(API + params, { signal: controller.signal });
    }
    const data = await response.json();
    if (controller.signal.aborted) return;
    if (!response.ok) throw Error(data.error || 'Search unavailable.');
    $('searchStatus').textContent = data.results.length ? '' : 'No songs found.';
    for (const track of data.results) {
      const result = row(track, {
        label: '+', aria: 'Add ' + track.title + ' to a playlist',
        action: () => addToPlaylist(track)
      });
      result.querySelector('.track-main').onclick = () => {
        dismissSuggestions();
        songQuery.focus();
        playTracks([track]);
      };
      $('results').append(result);
    }
  } catch (error) {
    if (!controller.signal.aborted) $('searchStatus').textContent = error.message || 'Search unavailable.';
  }
}

function scheduleSearch(immediate) {
  dismissSuggestions();
  $('results').replaceChildren();
  const term = songQuery.value.trim();
  if (!term || (!immediate && term.length < 2)) return;
  suggestions.hidden = false;
  $('searchStatus').textContent = 'Searching…';
  if (immediate) findSongs(term);
  else searchTimer = setTimeout(() => findSongs(term), 400);
}
songQuery.addEventListener('input', () => scheduleSearch(false));
$('search').onsubmit = event => {
  event.preventDefault();
  scheduleSearch(true);
};
songSearch.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    dismissSuggestions();
    songQuery.focus();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const rows = [...$('results').querySelectorAll('.track-main')];
    if (suggestions.hidden || !rows.length) return;
    event.preventDefault();
    const index = rows.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? index + 1 : Math.max(0, index - 1);
    rows[Math.min(next, rows.length - 1)].focus();
  }
});
document.addEventListener('pointerdown', event => {
  if (!songSearch.contains(event.target)) dismissSuggestions();
});
songSearch.addEventListener('focusout', event => {
  if (event.relatedTarget && !songSearch.contains(event.relatedTarget)) dismissSuggestions();
});
function addToPlaylist(track){if(!playlists.length){let name=prompt('Name your new playlist:');if(!name?.trim())return;playlists.push({name:name.trim().slice(0,60),tracks:[]})}let n=prompt('Add to which playlist?\n'+playlists.map((p,i)=>`${i+1}. ${p.name}`).join('\n'),'1');let index=Number(n)-1;if(!Number.isInteger(index)||!playlists[index])return;if(!playlists[index].tracks.some(t=>t.id===track.id))playlists[index].tracks.push(track);save();$('searchStatus').textContent=`Added to ${playlists[index].name}.`}
function renderPlaylists(){let box=$('playlists');box.replaceChildren();if(!playlists.length){let p=document.createElement('p');p.className='empty';p.textContent='No playlists yet. Make one and save your favorites.';box.append(p);return}playlists.forEach((p,i)=>{let div=document.createElement('div');div.className='playlist';let h=document.createElement('h3');h.textContent=`${p.name} · ${p.tracks.length} songs`;div.append(h);let buttons=document.createElement('div');buttons.className='list-buttons';for(let [label,fn] of [['play',()=>playTracks(p.tracks)],['view',()=>{let area=div.querySelector('.track-list');area.hidden=!area.hidden}],['delete',()=>{if(confirm(`Delete ${p.name}?`)){playlists.splice(i,1);save()}}]]){let b=document.createElement('button');b.textContent=label;b.onclick=fn;buttons.append(b)}div.append(buttons);let area=document.createElement('div');area.className='track-list';area.hidden=true;p.tracks.forEach((t,j)=>area.append(row(t,{label:'×',aria:'Remove from playlist',action:()=>{p.tracks.splice(j,1);save()}})));div.append(area);box.append(div)})}
$('create').onclick=()=>{let name=prompt('Playlist name:');if(name?.trim()){playlists.push({name:name.trim().slice(0,60),tracks:[]});save()}};$('libraryTab').onclick=()=>$('library').scrollIntoView({behavior:'smooth'});$('playPicks').onclick=()=>playTracks(picks);
async function loadPicks(){try{let r=await fetch('/api/mu-admin');let d=await r.json();if(!r.ok)throw Error(d.error);picks=d.tracks;$('picksList').replaceChildren();if(!picks.length){let p=document.createElement('p');p.className='empty';p.textContent='Aidan’s picks are coming soon.';$('picksList').append(p);return}picks.forEach((t,i)=>{let el=row(t,{label:'+',aria:'Add '+t.title+' to a playlist',action:()=>addToPlaylist(t)});el.querySelector('.track-main').onclick=()=>playTracks(picks,i);$('picksList').append(el)})}catch{$('picksList').textContent='Could not load picks right now.'}}renderPlaylists();loadPicks();
