import {get, put} from '@vercel/blob';
import {createMoviePicksHandler} from '../lib/st-picks.mjs';
const handle = createMoviePicksHandler({get, put});
export const GET = handle;
export const POST = handle;
