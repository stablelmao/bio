function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function control(label, action) {
  const node = element('button', label);
  node.type = 'button';
  node.onclick = action;
  return node;
}
let noticeTimer;
function notifyMusic(message) {
  clearTimeout(noticeTimer);
  $('musicNotice').textContent = message;
  noticeTimer = setTimeout(() => { $('musicNotice').textContent = ''; }, 4000);
}
const playlistDialog = $('playlistDialog');
let dialogVersion = 0;
function closePlaylist() { playlistDialog.close(); }
playlistDialog.addEventListener('close', () => { dialogVersion++; });
$('closePlaylist').onclick = closePlaylist;

function prepareDialog(heading, context) {
  dialogVersion++;
  $('playlistHeading').textContent = heading;
  $('playlistContext').textContent = context;
  $('playlistChoices').replaceChildren();
  $('playlistFeedback').textContent = '';
  $('playlistForm').reset();
  $('playlistForm').hidden = false;
  $('playlistSubmit').disabled = false;
  $('playlistName').disabled = false;
  if (!playlistDialog.open) playlistDialog.showModal();
}
function playlistPicker(track) {
  prepareDialog(track ? 'Add to playlist' : 'Create a playlist', track ? track.title + ' · ' + track.channel : '');
  const version = dialogVersion;
  let pending = false;
  async function commit(list, newName) {
    if (pending) return;
    pending = true;
    $('playlistSubmit').disabled = true;
    try {
      let recording = track;
      if (track?.chartEntry) {
        $('playlistFeedback').textContent = 'Finding this recording…';
        recording = await resolveChartTrack(track);
      }
      if (!playlistDialog.open || dialogVersion !== version) return;
      if (newName) {
        list = {name:newName,tracks:[]};
        playlists.push(list);
      }
      if (recording && !list.tracks.some(item => String(item.id) === String(recording.id))) list.tracks.push(recording);
      const saved = save();
      closePlaylist();
      if (saved) notifyMusic(recording ? 'Saved to ' + list.name : 'Created ' + list.name);
    } catch (error) {
      if (dialogVersion === version) $('playlistFeedback').textContent = error.message || 'Could not save this song.';
    } finally {
      pending = false;
      if (dialogVersion === version) $('playlistSubmit').disabled = false;
    }
  }
  if (track) for (const list of playlists) {
    const saved = (track.recording || track).id;
    const includes = saved && list.tracks.some(item => String(item.id) === String(saved));
    const choice = control(list.name + (includes ? ' · Added' : ''), () => commit(list));
    choice.disabled = Boolean(includes);
    $('playlistChoices').append(choice);
  }
  $('playlistSubmit').textContent = track ? 'Create & add' : 'Create playlist';
  $('playlistForm').onsubmit = event => {
    event.preventDefault();
    const name = $('playlistName').value.trim();
    if (name) commit(null, name);
    else $('playlistFeedback').textContent = 'Enter a playlist name.';
  };
  if (!track || !playlists.length) $('playlistName').focus();
}
function addToPlaylist(track) { playlistPicker(track); }
function deletePlaylist(list) {
  prepareDialog('Delete playlist?', list.name);
  $('playlistForm').hidden = true;
  const cancel = control('Keep playlist', closePlaylist);
  $('playlistChoices').append(cancel, control('Delete playlist', () => {
    playlists = playlists.filter(item => item !== list);
    const saved = save();
    closePlaylist();
    if (saved) notifyMusic('Deleted ' + list.name);
    $('create').focus();
  }));
  cancel.focus();
}
const openLists = new WeakSet();
function renderPlaylists() {
  const box = $('playlists');
  box.replaceChildren();
  if (!playlists.length) box.append(element('p','No playlists yet.','empty'));
  for (const list of playlists) {
    const section = element('div',null,'playlist');
    section.append(element('h3',list.name + ' · ' + list.tracks.length + (list.tracks.length === 1 ? ' song' : ' songs')));
    const buttons = element('div',null,'list-buttons');
    const tracks = element('div',null,'track-list');
    tracks.hidden = !openLists.has(list);
    const view = control('View songs', () => {
      tracks.hidden = !tracks.hidden;
      if (tracks.hidden) openLists.delete(list); else openLists.add(list);
      view.setAttribute('aria-expanded', String(!tracks.hidden));
    });
    view.setAttribute('aria-expanded',String(!tracks.hidden));
    const play = control('Play', () => playTracks(list.tracks));
    play.disabled = !list.tracks.length;
    buttons.append(play, view, control('Delete', () => deletePlaylist(list)));
    for (const [index,track] of list.tracks.entries()) {
      const item = row(track,{label:'×',aria:'Remove ' + track.title + ' from ' + list.name,action:() => {
        list.tracks.splice(index,1);
        if (save()) notifyMusic('Removed from ' + list.name);
      }});
      item.querySelector('.track-main').onclick = () => playTracks(list.tracks,index);
      tracks.append(item);
    }
    section.append(buttons,tracks);
    box.append(section);
  }
}
$('create').onclick = () => playlistPicker(null);
$('playPicks').onclick = () => playTracks(picks);
renderPlaylists();
