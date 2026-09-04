const music = document.querySelector("#music");
const entryGate = document.querySelector("#entry-gate");
const startMusic = document.querySelector("#start-music");
const audioToggle = document.querySelector("#audio-toggle");

startMusic.addEventListener("click", async () => {
    try {
        music.volume = 0.35;
        await music.play();
    } catch {
        audioToggle.textContent = "[ music unavailable ]";
        audioToggle.disabled = true;
    } finally {
        entryGate.classList.add("is-hidden");
    }
});

audioToggle.addEventListener("click", () => {
    music.muted = !music.muted;
    const enabled = !music.muted;
    audioToggle.textContent = enabled ? "[ music: on ]" : "[ music: off ]";
    audioToggle.setAttribute("aria-label", enabled ? "Mute music" : "Enable music");
});
