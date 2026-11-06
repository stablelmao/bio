import { get, list, put, del } from "@vercel/blob";
import { createCommentsHandler } from "../lib/comments.mjs";
const handle = createCommentsHandler({ get, list, put, del });
export const GET = handle;
export const POST = handle;
