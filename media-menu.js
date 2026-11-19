document.querySelectorAll('.discovery-nav').forEach(nav => {
  const toggle = nav.querySelector('.menu-toggle');
  toggle.onclick = () => toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
  function close() {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus({preventScroll:true});
  }
  nav.addEventListener('click', event => { if (event.target.closest('.menu-items a,.menu-items button')) close(); });
  nav.addEventListener('change', close);
  nav.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
});
