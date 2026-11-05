const music = document.querySelector("#music");
const entryGate = document.querySelector("#entry-gate");
const startMusic = document.querySelector("#start-music");
const enterSilent = document.querySelector("#enter-silent");
const audioToggle = document.querySelector("#audio-toggle");
const bio = document.querySelector("#bio");
const nameHeading = document.querySelector("#name");
let starting = false;

music.volume = 0.35;
entryGate.hidden = false;
audioToggle.hidden = false;
bio.inert = true;
startMusic.focus();

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
  bio.classList.add("is-entered");
  nameHeading.focus({ preventScroll: true });
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
