import { ownerSignedIn } from './owner-session.mjs';
import { createHash, randomUUID } from "node:crypto";

const origins = new Set([
  "https://aidan.im",
  "https://www.aidan.im",
  "https://stablebio.vercel.app",
]);
const json = (value, status = 200, headers = {}) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });

export function createCommentsHandler(
  storage,
  env = process.env,
  now = Date.now,
) {
  return async function handle(request) {
    if (!["GET", "POST"].includes(request.method))
      return json({ error: "Method not allowed." }, 405, {
        Allow: "GET, POST",
      });
    if (!env.BLOB_STORE_ID && !env.BLOB_READ_WRITE_TOKEN)
      return json(
        { error: "The wall is getting set up. Try again shortly." },
        503,
      );
    try {
      if (request.method === "GET") {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (cursor && cursor.length > 2048) return json({ error: "Invalid page." }, 400);
        const page = await storage.list({ prefix: "comments/", limit: 50, ...(cursor ? { cursor } : {}) });
        const comments = [];
        // Limit concurrent Blob reads rather than starting one request per comment.
        for (let i = 0; i < page.blobs.length; i += 5) {
          const batch = await Promise.all(
            page.blobs.slice(i, i + 5).map(async (blob) => {
              const result = await storage.get(blob.pathname, {
                access: "private",
                useCache: false,
              });
              if (!result || result.statusCode !== 200) return null;
              const value = await new Response(result.stream).json();
              if (
                typeof value.name !== "string" ||
                typeof value.message !== "string" ||
                !Number.isFinite(Date.parse(value.createdAt))
              )
                return null;
              return {
                id: value.id,
                name: value.name.slice(0, 32),
                message: value.message.slice(0, 1000),
                createdAt: value.createdAt,
              };
            }),
          );
          comments.push(...batch.filter(Boolean));
        }
        comments.sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        );
        return json({ comments, hasMore: page.hasMore, cursor: page.cursor || null });
      }
      const allowed = new Set(origins);
      if (env.VERCEL_URL) allowed.add(`https://${env.VERCEL_URL}`);
      if (env.NODE_ENV !== "production") allowed.add("http://127.0.0.1:4173");
      if (!allowed.has(request.headers.get("origin")))
        return json({ error: "Please post from the comments wall." }, 403);
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return json({ error: "Use a JSON request." }, 415);
      if (Number(request.headers.get("content-length")) > 8192)
        return json({ error: "That message is too long." }, 413);
      // Bound the stream too: Content-Length is not trusted.
      const reader = request.body?.getReader();
      if (!reader)
        return json({ error: "A name and message are required." }, 400);
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          return json({ error: "That message is too long." }, 413);
        }
        chunks.push(value);
      }
      let data;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return json({ error: "Invalid message." }, 400);
      }
      if (!data || typeof data !== "object")
        return json({ error: "Invalid message." }, 400);
      if (data.action !== undefined) {
        if (!ownerSignedIn(request, env.MU_SESSION_SECRET || '', now())) return json({ error: "Sign in as Aidan to moderate comments." }, 401);
        if (!["edit", "delete"].includes(data.action)) return json({ error: "Unknown action." }, 400);
        if (typeof data.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id))
          return json({ error: "Invalid comment." }, 400);
        const time = Date.parse(data.createdAt);
        if (!Number.isSafeInteger(time) || time < 0 || time > 9999999999999) return json({ error: "Invalid date." }, 400);
        const path = `comments/${String(9999999999999 - time).padStart(13, "0")}-${data.id}.json`;
        const result = await storage.get(path, { access: "private", useCache: false });
        if (!result || result.statusCode !== 200) return json({ error: "This comment no longer exists." }, 404);
        const previous = await new Response(result.stream).json();
        if (previous.message !== data.original) return json({ error: "This comment changed. Reload the list before saving." }, 409);
        if (!result.blob?.etag) throw Error("Missing comment revision");
        const options = { ifMatch: result.blob.etag };
        try {
          if (data.action === "delete") {
            await storage.del(path, options);
            return json({ deleted: true });
          }
          const message = typeof data.message === "string" ? data.message.trim() : "";
          if (!message || message.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(message))
            return json({ error: "Enter a message between 1 and 1000 characters." }, 400);
          const comment = { ...previous, message };
          await storage.put(path, JSON.stringify(comment), { ...options, access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
          return json({ comment });
        } catch (error) {
          if (error?.name === "BlobPreconditionFailedError") return json({ error: "Comment changed. Reload the list." }, 409);
          throw error;
        }
      }
      if (data.website)
        return json({ error: "Could not post this message." }, 400);
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const message =
        typeof data.message === "string" ? data.message.trim() : "";
      if (!name || name.length > 32 || /[\r\n\x00-\x1f]/.test(name))
        return json(
          { error: "Enter a name between 1 and 32 characters." },
          400,
        );
      if (
        !message ||
        message.length > 1000 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(message)
      )
        return json(
          { error: "Enter a message between 1 and 1000 characters." },
          400,
        );
      const timestamp = now();
      const ip =
        request.headers.get("x-vercel-forwarded-for") ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      const client = createHash("sha256")
        .update(`${env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN}:${ip}`)
        .digest("hex");
      const minute = Math.floor(timestamp / 60000);
      const marker = `cooldowns/${client}/${minute}.json`;
      try {
        await storage.put(marker, "{}", {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: "application/json",
        });
      } catch (error) {
        const existing = await storage.get(marker, {
          access: "private",
          useCache: false,
        });
        if (existing)
          return json(
            { error: "Give it a minute before posting again." },
            429,
            { "Retry-After": String(60 - (Math.floor(timestamp / 1000) % 60)) },
          );
        throw error;
      }
      const comment = {
        id: randomUUID(),
        name,
        message,
        createdAt: new Date(timestamp).toISOString(),
      };
      // Separate immutable blobs prevent simultaneous visitors overwriting each other.
      const path = `comments/${String(9999999999999 - timestamp).padStart(13, "0")}-${comment.id}.json`;
      try {
        await storage.put(path, JSON.stringify(comment), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: "application/json",
        });
      } catch (error) {
        await storage.del(marker).catch(() => {});
        throw error;
      }
      return json({ comment }, 201);
    } catch (error) {
      console.error("Comments storage request failed:", error?.name || "Error");
      return json(
        {
          error:
            "The wall is unavailable right now. Your message was not posted. Please try again.",
        },
        503,
      );
    }
  };
}
