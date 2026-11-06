const music = document.querySelector("#music");
const entryGate = document.querySelector("#entry-gate");
const startMusic = document.querySelector("#start-music");
const enterSilent = document.querySelector("#enter-silent");
const audioToggle = document.querySelector("#audio-toggle");
const bio = document.querySelector("#bio");
const siteNav = document.querySelector("#site-nav");
const navToggle = document.querySelector(".nav-toggle");
const pageViews = [...document.querySelectorAll(".page-view")];
const navLinks = [...siteNav.querySelectorAll("a")];
let starting = false;

music.volume = 0.35;
entryGate.hidden = false;
audioToggle.hidden = false;
bio.inert = true;
siteNav.inert = true;
siteNav.classList.add("is-enhanced");
navToggle.hidden = false;
startMusic.focus();

function closeMenu() {
  siteNav.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
}

function showPage(moveFocus = true) {
  const requested = location.hash.slice(1) || "home";
  const selected =
    pageViews.find((view) => view.id === requested) || pageViews[0];
  pageViews.forEach((view) => {
    view.hidden = view !== selected;
  });
  navLinks.forEach((link) => {
    if (link.hash === `#${selected.id}`)
      link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  closeMenu();
  document.title =
    selected.id === "home"
      ? "stablelmao :p"
      : `${selected.id === "about" ? "more about me" : selected.id} | stable!`;
  if (moveFocus && entryGate.hidden) {
    selected.querySelector("h1").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}
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
navLinks.forEach((link) =>
  link.addEventListener("click", () => {
    if (
      link.hash === location.hash ||
      (!location.hash && link.hash === "#home")
    )
      showPage();
  }),
);
window.addEventListener("hashchange", () => showPage());
showPage(false);

function updateAudio() {
  const playing = !music.paused && !music.muted;
  audioToggle.textContent = playing ? "[ music: on ]" : "[ music: off ]";
  audioToggle.setAttribute(
    "aria-label",
    playing ? "Pause music" : "Play music",
  );
  audioToggle.setAttribute("aria-pressed", String(playing));
}
function enter() {
  entryGate.hidden = true;
  bio.inert = false;
  siteNav.inert = false;
  bio.classList.add("is-entered");
  showPage();
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
    audioToggle.textContent = "[ music: retry ]";
    audioToggle.setAttribute("aria-label", "Retry playing music");
    audioToggle.setAttribute("aria-pressed", "false");
  } finally {
    starting = false;
    audioToggle.disabled = false;
  }
}
startMusic.addEventListener("click", () => {
  enter();
  void playMusic();
});
enterSilent.addEventListener("click", enter);
audioToggle.addEventListener("click", () => {
  if (music.paused) void playMusic();
  else music.pause();
});
music.addEventListener("play", updateAudio);
music.addEventListener("pause", updateAudio);
music.addEventListener("volumechange", updateAudio);
