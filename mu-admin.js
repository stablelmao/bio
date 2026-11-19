const $ = id => document.getElementById(id);
const accounts = {
  music:{endpoint:'/api/mu-admin', field:'tracks', login:'Music admin sign in', title:"Developer's picks", help:"Manage the developer's picks on mu.", noun:'song'},
  jaiden:{endpoint:'/api/st-admin', field:'picks', login:'Jaiden sign in', title:"Jaiden's picks", help:'Choose movies and tell everyone why you like them.', noun:'movie'}
};
let account = 'music', selection = [], version = 0, activeSearch;
async function api(endpoint, data) {
  const response = await fetch(endpoint, data ? {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
  } : {cache:'no-store'});
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Request failed. Try again.');
  return result;
}
function row(item, index, selected) {
  const article = document.createElement('div');
  article.className = 'admin-item';
  const heading = document.createElement('div');
  heading.className = 'item-heading';
  const copy = document.createElement('div');
  copy.className = 'item-copy';
  const title = document.createElement('strong');
  title.textContent = item.title;
  const detail = document.createElement('small');
  detail.textContent = account === 'music' ? item.channel : (item.date || '').slice(0,4);
  copy.append(title, detail);
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = selected ? '×' : '+';
  button.setAttribute('aria-label', (selected ? 'Remove ' : 'Add ') + item.title);
  button.onclick = () => {
    if (selected) selection.splice(index,1);
    else if (!selection.some(entry => String(entry.id) === String(item.id))) selection.push({...item, reason:item.reason || ''});
    render();
    $('status').textContent = selected ? 'Removed from your selection. Publish to save.' : 'Added to your selection. Publish to save.';
  };
  heading.append(copy, button); article.append(heading);
  if (selected && account === 'jaiden') {
    const label = document.createElement('label');
    label.className = 'reason-label'; label.htmlFor = 'reason-' + item.id;
    label.textContent = 'Why do you like this movie?';
    const input = document.createElement('textarea');
    input.id = label.htmlFor; input.maxLength = 600; input.required = true; input.value = item.reason || '';
    input.placeholder = 'What makes it one of your favorites?';
    input.oninput = () => {item.reason = input.value;};
    article.append(label,input);
  }
  return article;
}
function render() {
  $('selected').replaceChildren(...selection.map((item,index) => row(item,index,true)));
  if (!selection.length) {
    const empty = document.createElement('p'); empty.className = 'empty';
    empty.textContent = 'No ' + accounts[account].noun + 's selected yet.'; $('selected').append(empty);
  }
}
async function showEditor(currentVersion) {
  const settings = accounts[account];
  const data = await api(settings.endpoint);
  if (currentVersion !== version) return;
  selection = data[settings.field]; render();
  $('login').hidden = true; $('editor').hidden = false;
  $('status').textContent = 'Search and add ' + settings.noun + 's, then publish your picks.';
}
async function chooseAccount(next) {
  activeSearch?.abort(); account = next; const currentVersion = ++version;
  const settings = accounts[account]; selection = [];
  $('login').hidden = false; $('editor').hidden = true; $('password').value = '';
  $('loginTitle').textContent = settings.login; $('loginHelp').textContent = settings.help;
  $('editorTitle').textContent = settings.title; $('query').value = '';
  $('query').placeholder = 'Search for a ' + settings.noun;
  $('query').setAttribute('aria-label','Search for a ' + settings.noun);
  $('results').replaceChildren(); $('selected').replaceChildren(); $('loginStatus').textContent = '';
  for (const button of document.querySelectorAll('[data-account]')) button.setAttribute('aria-pressed',String(button.dataset.account === account));
  try {
    const session = await api(settings.endpoint + '?session=1');
    if (version === currentVersion && session.authenticated) await showEditor(currentVersion);
  } catch (error) { if (version === currentVersion) $('loginStatus').textContent = error.message; }
}
for (const button of document.querySelectorAll('[data-account]')) button.onclick = () => chooseAccount(button.dataset.account);
$('loginForm').onsubmit = async event => {
  event.preventDefault(); const currentVersion = version, settings = accounts[account];
  $('signIn').disabled = true; $('loginStatus').textContent = 'Signing in…';
  try {
    await api(settings.endpoint,{action:'login',password:$('password').value});
    if (version !== currentVersion) return;
    $('password').value = ''; await showEditor(currentVersion); $('loginStatus').textContent = '';
  } catch (error) { if (version === currentVersion) $('loginStatus').textContent = error.message; }
  finally { $('signIn').disabled = false; }
};
$('logout').onclick = async () => {
  const currentVersion = version;
  try { await api(accounts[account].endpoint,{action:'logout'}); if (version === currentVersion) await chooseAccount(account); }
  catch (error) { if (version === currentVersion) $('status').textContent = error.message; }
};
$('find').onsubmit = async event => {
  event.preventDefault(); activeSearch?.abort(); const controller = new AbortController(); activeSearch = controller;
  const currentVersion = version;
  $('status').textContent = 'Searching…'; $('results').replaceChildren();
  const endpoint = account === 'jaiden' ? '/api/st?mode=search&type=movie&q=' : '/api/mu?mode=search&q=';
  try {
    const response = await fetch(endpoint + encodeURIComponent($('query').value.trim()),{signal:controller.signal});
    const data = await response.json();
    if (version !== currentVersion || controller.signal.aborted) return;
    if (!response.ok) throw Error(data.error || 'Search unavailable.');
    $('results').replaceChildren(...data.results.map((item,index) => row(item,index,false)));
    $('status').textContent = data.results.length ? 'Choose + to add a favorite.' : 'No results found.';
  } catch (error) { if (version === currentVersion && !controller.signal.aborted) $('status').textContent = error.message; }
};
$('publish').onclick = async () => {
  const currentVersion = version, settings = accounts[account];
  if (account === 'jaiden') {
    const missing = selection.find(item => !item.reason?.trim());
    if (missing) { $('status').textContent = 'Add a reason for ' + missing.title + ' first.'; $('reason-' + missing.id).focus(); return; }
  }
  $('publish').disabled = true; $('status').textContent = 'Publishing…';
  try {
    await api(settings.endpoint,{action:'save',[settings.field]:selection});
    if (version === currentVersion) $('status').textContent = 'Published! Everyone can see your picks now.';
  } catch (error) { if (version === currentVersion) $('status').textContent = error.message; }
  finally { $('publish').disabled = false; }
};
chooseAccount(new URLSearchParams(location.search).get('account') === 'jaiden' ? 'jaiden' : 'music');
