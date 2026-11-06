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
const wallStatus = document.querySelector("#wall-status");
const wallComments = document.querySelector("#wall-comments");
const wallRefresh = document.querySelector("#wall-refresh");
let wallLoading = false;
let wallLoadedAt = 0;
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
  if (selected.id === "wall" && entryGate.hidden) void loadWall();
  document.title =
    selected.id === "home"
      ? "stablelmao :p"
      : `${selected.id === "about" ? "more about me" : selected.id === "wall" ? "comments wall" : selected.id} | stable!`;
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

async function loadWall(force = false) {
  if (wallLoading || (!force && Date.now() - wallLoadedAt < 60000)) return;
  wallLoading = true;
  wallRefresh.disabled = true;
  wallStatus.textContent = "loading messages...";
  wallComments.setAttribute("aria-busy", "true");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(
      "https://api.github.com/repos/stablelmao/bio/issues/2/comments?per_page=100",
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error("Comments unavailable");
    const comments = await response.json();
    if (!Array.isArray(comments)) throw new Error("Invalid comments");
    const fragment = document.createDocumentFragment();
    for (const comment of [...comments].reverse()) {
      if (
        !comment.user ||
        !/^[a-zA-Z0-9-]+$/.test(comment.user.login) ||
        !Number.isSafeInteger(comment.id)
      )
        continue;
      const article = document.createElement("article");
      article.className = "wall-comment";
      const header = document.createElement("header");
      const author = document.createElement("a");
      author.className = "wall-comment-author";
      author.href = `https://github.com/${comment.user.login}`;
      author.target = "_blank";
      author.rel = "noopener noreferrer";
      author.textContent = `@${comment.user.login}`;
      header.append(author);
      const date = new Date(comment.created_at);
      if (!Number.isNaN(date.getTime())) {
        const time = document.createElement("time");
        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        header.append(time);
      }
      const body = document.createElement("p");
      body.textContent = String(comment.body || "").slice(0, 10000);
      article.append(header, body);
      fragment.append(article);
    }
    const count = fragment.childElementCount;
    wallComments.replaceChildren(fragment);
    wallStatus.textContent = count
      ? `${count} ${count === 1 ? "message" : "messages"}${comments.length === 100 ? " shown. see the full thread for more." : "."}`
      : "no messages yet. be the first to say hi :)";
    wallLoadedAt = Date.now();
  } catch {
    wallStatus.textContent =
      "couldn't load messages right now. try refresh or open the github thread below.";
  } finally {
    clearTimeout(timeout);
    wallLoading = false;
    wallRefresh.disabled = false;
    wallComments.setAttribute("aria-busy", "false");
  }
}
wallRefresh.addEventListener("click", () => {
  void loadWall(true);
});
