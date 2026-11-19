import { get, put } from '@vercel/blob';
import { pbkdf2Sync, timingSafeEqual, createHmac, randomBytes, createHash } from 'node:crypto';
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const path='mu/developer-picks-hifi.json';
const sign=s=>createHmac('sha256',process.env.MU_SESSION_SECRET).update(s).digest('base64url');
import { ownerSignedIn as authorized } from '../lib/owner-session.mjs';
async function readPicks(){const result=await get(path,{access:'private',useCache:false});if(!result||result.statusCode!==200)return [];const data=await new Response(result.stream).json();return Array.isArray(data.tracks)?data.tracks:[]}
export async function GET(req){try{if(new URL(req.url).searchParams.get('session')==='1')return json({authenticated:authorized(req)});return json({tracks:await readPicks()})}catch{return json({error:'Could not load Developer’s Picks.'},503)}}
export async function POST(req){
 if(req.headers.get('origin')!=='https://aidan.im')return json({error:'Invalid origin.'},403);
 if(!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required.'},415);
 if(!process.env.MU_ADMIN_PASSWORD_HASH||!process.env.MU_SESSION_SECRET)return json({error:'Admin is not configured.'},503);
 if(Number(req.headers.get('content-length')||0)>30000)return json({error:'Request too large.'},413);
 let raw;try{raw=await req.text();if(raw.length>30000)return json({error:'Request too large.'},413)}catch{return json({error:'Invalid request.'},400)}
 let data;try{data=JSON.parse(raw)}catch{return json({error:'Invalid request.'},400)}
 try{
 if(data.action==='login'){
  const ip=(req.headers.get('x-vercel-forwarded-for')||'unknown').split(',')[0].trim();const marker=`mu/login/${createHash('sha256').update(ip).digest('hex')}/${Math.floor(Date.now()/30000)}.json`;
  try{await put(marker,'{}',{access:'private',addRandomSuffix:false,allowOverwrite:false})}catch{return json({error:'Please wait 30 seconds before trying again.'},429)}
  if(typeof data.password!=='string'||data.password.length>256)return json({error:'Invalid password.'},401);
  const [salt,hash]=process.env.MU_ADMIN_PASSWORD_HASH.split(':');const expected=Buffer.from(hash||'','hex');const actual=pbkdf2Sync(data.password,salt,310000,32,'sha256');
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return json({error:'Invalid password.'},401);
  const exp=Date.now()+8*60*60*1000,nonce=randomBytes(18).toString('base64url'),body=`${exp}.${nonce}`;
  return json({ok:true},200,{'Set-Cookie':`mu_admin=${body}.${sign(body)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`});
 }
 if(data.action==='logout')return json({ok:true},200,{'Set-Cookie':'mu_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
 if(!authorized(req))return json({error:'Sign in first.'},401);
 if(data.action!=='save'||!Array.isArray(data.tracks)||data.tracks.length>100)return json({error:'Invalid playlist.'},400);
 const tracks=[];for(const t of data.tracks){if(!t||typeof t.id!=='string'||!/^\d{1,15}$/.test(t.id)||typeof t.title!=='string'||typeof t.channel!=='string')return json({error:'Invalid track.'},400);tracks.push({id:t.id,title:t.title.slice(0,200),channel:t.channel.slice(0,120),album:typeof t.album==='string'?t.album.slice(0,200):'',cover:typeof t.cover==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.cover)?t.cover:'',duration:Number.isFinite(t.duration)&&t.duration>=0?Math.min(t.duration,86400):0})}
 await put(path,JSON.stringify({tracks}),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});return json({ok:true,tracks});
 }catch(e){console.error('Music admin request failed',e?.name);return json({error:'Storage unavailable. Try again.'},503)}
}
