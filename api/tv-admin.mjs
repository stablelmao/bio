import {get, put} from '@vercel/blob';
import {createTvPicksHandler} from '../lib/st-picks.mjs';
const handle = createTvPicksHandler({get, put});
export const GET = handle;
export const POST = handle;
