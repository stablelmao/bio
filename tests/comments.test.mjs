import test from "node:test";
import assert from "node:assert/strict";
import { createCommentsHandler } from "../lib/comments.mjs";

function fixture() {
  const objects = new Map();
  const storage = {
    async list({ prefix, limit }) {
      const paths = [...objects.keys()]
        .filter((p) => p.startsWith(prefix))
        .sort();
      return {
        blobs: paths.slice(0, limit).map((pathname) => ({ pathname })),
        hasMore: paths.length > limit,
      };
    },
    async get(path) {
      if (!objects.has(path)) return null;
      return { statusCode: 200, stream: new Response(objects.get(path)).body };
    },
    async put(path, body, options) {
      assert.equal(options.access, "private");
      if (objects.has(path) && !options.allowOverwrite)
        throw new Error("already exists");
      objects.set(path, body);
      return { pathname: path };
    },
    async del(path) {
      objects.delete(path);
    },
  };
  return {
    objects,
    storage,
    handle: createCommentsHandler(
      storage,
      { BLOB_STORE_ID: "test-store", NODE_ENV: "production" },
      () => 1793930400000,
    ),
  };
}
const post = (data, ip = "192.0.2.1", origin = "https://aidan.im") =>
  new Request("https://aidan.im/api/comments", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-vercel-forwarded-for": ip,
    },
    body: JSON.stringify(data),
  });
const read = () => new Request("https://aidan.im/api/comments");

test("valid anonymous comment persists and is read back as plain data", async () => {
  const { handle, objects } = fixture();
  const response = await handle(
    post({ name: " visitor ", message: " <script>alert(1)</script> " }),
  );
  assert.equal(response.status, 201);
  const { comment } = await response.json();
  assert.equal(comment.name, "visitor");
  const result = await (await handle(read())).json();
  assert.equal(result.comments[0].message, "<script>alert(1)</script>");
  assert.equal(objects.size, 2);
  assert.equal(result.comments[0].ip, undefined);
});
test("concurrent visitors cannot overwrite one another", async () => {
  const { handle } = fixture();
  const results = await Promise.all([
    handle(post({ name: "a", message: "one" }, "192.0.2.1")),
    handle(post({ name: "b", message: "two" }, "192.0.2.2")),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [201, 201],
  );
  assert.equal((await (await handle(read())).json()).comments.length, 2);
});
test("same visitor concurrent posts have a shared durable cooldown", async () => {
  const { handle } = fixture();
  const results = await Promise.all([
    handle(post({ name: "a", message: "one" })),
    handle(post({ name: "a", message: "two" })),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 429]);
  assert.equal((await (await handle(read())).json()).comments.length, 1);
});
test("empty, oversized, bot and invalid name requests do not write", async () => {
  const { handle, objects } = fixture();
  for (const data of [
    { name: "", message: "hi" },
    { name: "a", message: " " },
    { name: "a", message: "x".repeat(1001) },
    { name: "x".repeat(33), message: "hi" },
    { name: "a\nb", message: "hi" },
    { name: "a", message: "hi", website: "spam" },
  ])
    assert.equal((await handle(post(data))).status, 400);
  assert.equal(objects.size, 0);
});
test("cross-origin posts fail before touching storage", async () => {
  const { handle, objects } = fixture();
  assert.equal(
    (
      await handle(
        post(
          { name: "a", message: "b" },
          "192.0.2.1",
          "https://elsewhere.example",
        ),
      )
    ).status,
    403,
  );
  assert.equal(objects.size, 0);
});
test("oversized stream is bounded even with no content-length", async () => {
  const { handle, objects } = fixture();
  assert.equal(
    (await handle(post({ name: "a", message: "x".repeat(9000) }))).status,
    413,
  );
  assert.equal(objects.size, 0);
});
test("storage failure does not claim the post succeeded and releases reservation", async () => {
  const { storage, objects } = fixture();
  const realPut = storage.put;
  storage.put = async (...args) => {
    if (args[0].startsWith("comments/")) throw new Error("unavailable");
    return realPut(...args);
  };
  const handle = createCommentsHandler(storage, {
    BLOB_STORE_ID: "test-store",
  });
  assert.equal((await handle(post({ name: "a", message: "b" }))).status, 503);
  assert.equal(objects.size, 0);
});
test("unconfigured storage returns a setup error", async () => {
  assert.equal((await createCommentsHandler({}, {})(read())).status, 503);
});
test("only 50 latest messages are returned and private markers never leak", async () => {
  const { handle, objects } = fixture();
  for (let i = 0; i < 55; i++) {
    const time = 1793930400000 + i;
    const path = `comments/${9999999999999 - time}-${i}.json`;
    objects.set(
      path,
      JSON.stringify({
        id: String(i),
        name: "a",
        message: String(i),
        createdAt: new Date(time).toISOString(),
      }),
    );
  }
  const data = await (await handle(read())).json();
  assert.equal(data.comments.length, 50);
  assert.equal(data.comments[0].message, "54");
  assert.equal(data.comments.at(-1).message, "5");
  assert.equal(data.hasMore, true);
});
