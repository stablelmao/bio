const music = document.querySelector("#music");
const entryGate = document.querySelector("#entry-gate");
const audioToggle = document.querySelector("#audio-toggle");
const bio = document.querySelector("#bio");
const siteNav = document.querySelector("#site-nav");
const navToggle = document.querySelector(".nav-toggle");
const sessionKey = "stable-site-session";
let starting = false;
let saved = {};
try {
  saved = JSON.parse(sessionStorage.getItem(sessionKey) || "{}") || {};
} catch {}

// Keep previously shared hash links working, but send them to actual documents.
const legacyRoutes = {
  "#home": "/",
  "#portfolio": "/portfolio",
  "#about": "/about",
  "#links": "/links",
  "#wall": "/wall",
};
function redirectLegacyLink() {
  if (
    ["/", "/index.html"].includes(location.pathname) &&
    legacyRoutes[location.hash]
  )
    location.replace(legacyRoutes[location.hash]);
}
redirectLegacyLink();
window.addEventListener("hashchange", redirectLegacyLink);

function saveSession() {
  try {
    sessionStorage.setItem(
      sessionKey,
      JSON.stringify({
        entered: !entryGate || entryGate.hidden,
        playing: !music.paused && !music.muted,
        time: music.currentTime,
      }),
    );
  } catch {}
}
function closeMenu() {
  siteNav.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
}
siteNav.classList.add("is-enhanced");
navToggle.hidden = false;
navToggle.addEventListener("click", () => {
  const open = siteNav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(open));
});
siteNav.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    navToggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!siteNav.contains(event.target)) closeMenu();
});
siteNav
  .querySelectorAll("a")
  .forEach((link) => link.addEventListener("click", saveSession));
window.addEventListener("pagehide", saveSession);

music.volume = 0.35;
audioToggle.hidden = false;
function updateAudio() {
  const playing = !music.paused && !music.muted;
  audioToggle.textContent = playing ? "[ music: on ]" : "[ music: off ]";
  audioToggle.setAttribute(
    "aria-label",
    playing ? "Pause music" : "Play music",
  );
  audioToggle.setAttribute("aria-pressed", String(playing));
}
async function playMusic() {
  if (starting) return;
  starting = true;
  audioToggle.disabled = true;
  audioToggle.textContent = "[ music: loading ]";
  try {
    music.muted = false;
    await music.play();
    updateAudio();
  } catch {
    updateAudio();
    audioToggle.setAttribute("aria-label", "Play music");
  } finally {
    starting = false;
    audioToggle.disabled = false;
  }
}
audioToggle.addEventListener("click", () => {
  if (music.paused) void playMusic();
  else music.pause();
});
music.addEventListener("play", () => {
  updateAudio();
  saveSession();
});
music.addEventListener("pause", () => {
  updateAudio();
  saveSession();
});
music.addEventListener("volumechange", updateAudio);

let internalArrival = false;
try {
  internalArrival = new URL(document.referrer).origin === location.origin;
} catch {}
function enter(moveFocus = true) {
  if (entryGate) entryGate.hidden = true;
  bio.inert = false;
  siteNav.inert = false;
  bio.classList.add("is-entered");
  saveSession();
  if (moveFocus)
    document.querySelector("main h1")?.focus({ preventScroll: true });
}
if (entryGate && !saved.entered && !internalArrival) {
  entryGate.hidden = false;
  bio.inert = true;
  siteNav.inert = true;
  document.querySelector("#start-music").focus();
  document.querySelector("#start-music").addEventListener("click", () => {
    enter();
    void playMusic();
  });
  document
    .querySelector("#enter-silent")
    .addEventListener("click", () => enter());
} else {
  enter(false);
  if (Number.isFinite(saved.time) && saved.time > 0) {
    music.addEventListener(
      "loadedmetadata",
      () => {
        if (Number.isFinite(music.duration))
          music.currentTime = Math.min(saved.time, music.duration);
      },
      { once: true },
    );
  }
  if (saved.playing) void playMusic();
}

// Reconcile controls when the browser restores a document from its back cache.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  try {
    const latest = JSON.parse(sessionStorage.getItem(sessionKey) || "{}");
    if (!latest.playing) music.pause();
  } catch {}
  closeMenu();
  updateAudio();
});
