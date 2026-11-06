import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const pages = {
  "/": "index.html",
  "/portfolio": "portfolio.html",
  "/about": "about.html",
  "/links": "links.html",
  "/wall": "wall.html",
};
for (const [route, file] of Object.entries(pages)) {
  test(`${route} is a complete standalone page with valid navigation`, async () => {
    const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.equal((html.match(/<section\b/g) || []).length, 1);
    assert.match(
      html,
      new RegExp(`<link rel="canonical" href="https://aidan.im${route}"`),
    );
    const nav = html.match(/<nav[\s\S]*?<\/nav>/)[0];
    const targets = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(new Set(targets), new Set(Object.keys(pages)));
    assert.match(nav, new RegExp(`href="${route}"[^>]*aria-current="page"`));
    assert.doesNotMatch(nav, /href="#/);
    assert.match(html, /src="\/main.js\?/);
    assert.equal(html.includes('src="/wall.js?'), route === "/wall");
    assert.equal(html.includes('id="entry-gate"'), route === "/");
  });
}
test("clean routes preserve API endpoints without a catch-all rewrite", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  assert.equal(config.cleanUrls, true);
  assert.equal(config.rewrites, undefined);
  const error = await readFile(new URL("../404.html", import.meta.url), "utf8");
  assert.match(error, /name="robots" content="noindex"/);
});
