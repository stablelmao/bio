const wallStatus = document.querySelector("#wall-status");
const wallComments = document.querySelector("#wall-comments");
const wallRefresh = document.querySelector("#wall-refresh");
let wallLoading = false;
let wallLoadedAt = 0;

function renderWall(comments, hasMore = false) {
  const fragment = document.createDocumentFragment();
  for (const comment of comments) {
    const article = document.createElement("article");
    article.className = "wall-comment";
    const header = document.createElement("header");
    const author = document.createElement("span");
    author.className = "wall-comment-author";
    author.textContent = comment.name;
    header.append(author);
    const date = new Date(comment.createdAt);
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
    body.textContent = comment.message;
    article.append(header, body);
    fragment.append(article);
  }
  wallComments.replaceChildren(fragment);
  wallStatus.textContent = comments.length
    ? `${comments.length} ${comments.length === 1 ? "message" : "messages"}${hasMore ? " shown (latest 50)." : "."}`
    : "no messages yet. be the first to say hi :)";
}

async function loadWall(force = false) {
  if (wallLoading || (!force && Date.now() - wallLoadedAt < 30000)) return;
  wallLoading = true;
  wallRefresh.disabled = true;
  wallStatus.textContent = "loading messages...";
  wallComments.setAttribute("aria-busy", "true");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("/api/comments", {
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.comments))
      throw new Error("Comments unavailable");
    renderWall(data.comments, data.hasMore);
    wallLoadedAt = Date.now();
  } catch {
    wallStatus.textContent =
      "couldn't load messages right now. try refresh in a moment.";
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

const wallForm = document.querySelector("#wall-form");
const wallSubmit = document.querySelector("#wall-submit");
const wallFormStatus = document.querySelector("#wall-form-status");
wallForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (wallSubmit.disabled || !wallForm.reportValidity()) return;
  const fields = new FormData(wallForm);
  const payload = {
    name: fields.get("name").trim(),
    message: fields.get("message").trim(),
    website: fields.get("website"),
  };
  if (!payload.name || !payload.message) {
    wallFormStatus.textContent = "add your name and a message first.";
    return;
  }
  wallSubmit.disabled = true;
  wallSubmit.textContent = "[ posting... ]";
  wallFormStatus.textContent = "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      wallFormStatus.textContent =
        data.error || "couldn't post right now. try again.";
      return;
    }
    wallForm.querySelector('[name="message"]').value = "";
    wallFormStatus.textContent = "posted! thanks for stopping by :)";
    wallLoadedAt = 0;
    await loadWall(true);
  } catch {
    wallFormStatus.textContent =
      "couldn't confirm the post. refresh the wall before trying again. your message is still here.";
  } finally {
    clearTimeout(timeout);
    wallSubmit.disabled = false;
    wallSubmit.textContent = "[ post comment ]";
  }
});

void loadWall();
