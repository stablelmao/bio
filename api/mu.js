const { Readable } = require('node:stream');
const crypto = require('node:crypto');
const key = () => crypto.createHash('sha256').update(process.env.HIFI_API_SECRET || '').digest();
function seal(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([c.update(JSON.stringify({url:value,exp:Date.now()+10*60*1000})),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64url')}
function unseal(token){const b=Buffer.from(token,'base64url');if(b.length<30||b.length>6000)throw Error('Invalid token');const d=crypto.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));const o=JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());if(o.exp<Date.now())throw Error('Expired');return allowed(o.url)}
function allowed(url){const u=new URL(url);if(u.protocol!=='https:'||!u.hostname.endsWith('.audio.tidal.com')||u.username||u.password)throw Error('Unsupported audio source');return u}
function decodeXml(s){return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function attr(s,name){const m=s.match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*["\']([^"\']*)["\']'));return m?decodeXml(m[1]):null}
function dashSegments(xml){
 if(xml.length>250000||/<!DOCTYPE|<!ENTITY|<ContentProtection/i.test(xml))throw Error('Unsupported manifest');
 const tag=xml.match(/<SegmentTemplate\b([^>]*)>/i),codec=xml.match(/<Representation\b([^>]*)>/i);if(!tag||!codec)throw Error('Unsupported manifest');
 const initial=attr(tag[1],'initialization'),template=attr(tag[1],'media'),start=Number(attr(tag[1],'startNumber')||1),codecs=attr(codec[1],'codecs');
 if(!initial||!template||!template.includes('$Number$')||!Number.isSafeInteger(start)||start<0||!/^mp4a\.40\.\d+$/.test(codecs||''))throw Error('Unsupported manifest format');
 let count=0;for(const match of xml.matchAll(/<S\s+([^>]*?)\/?\s*>/gi)){const repeat=Number(attr(match[1],'r')||0);if(!Number.isSafeInteger(repeat)||repeat<0)throw Error('Unsupported timeline');count+=repeat+1}
 if(!count||count>300)throw Error('Unsupported timeline length');
 const urls=[allowed(initial).href];for(let i=0;i<count;i++)urls.push(allowed(template.replace('$Number$',String(start+i))).href);
 return {codecs,segments:urls.map(seal)};
}
module.exports = async function handler(req,res){
 res.setHeader('Access-Control-Allow-Origin','https://aidan.im');res.setHeader('Vary','Origin');res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
 const base=process.env.HIFI_API_URL;if(!base||!process.env.HIFI_API_SECRET)return res.status(503).json({error:'Music service is not connected yet.'});
 let host;try{host=new URL(base);if(host.protocol!=='https:'||host.username||host.password)throw Error()}catch{return res.status(503).json({error:'Music service configuration is invalid.'})}
 const mode=String(req.query.mode||'health');if(mode==='health')return res.status(200).json({ok:true,configured:true});
 try{
  if(mode==='cover'){
   const id=String(req.query.id||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'Invalid cover.'});
   const image=await fetch('https://resources.tidal.com/images/'+id.replace(/-/g,'/')+'/320x320.jpg',{redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!image.ok)return res.status(404).json({error:'Cover unavailable.'});
   const type=image.headers.get('content-type')||'';if(!type.startsWith('image/'))return res.status(502).json({error:'Invalid cover response.'});
   res.setHeader('Content-Type',type);res.setHeader('Cache-Control','public, max-age=3600, s-maxage=86400');res.statusCode=200;Readable.fromWeb(image.body).on('error',()=>res.destroy()).pipe(res);return;
  }
  if(mode==='segment'){
   let media;try{media=unseal(String(req.query.token||''))}catch{return res.status(400).json({error:'Invalid or expired audio segment.'})}
   const upstream=await fetch(media,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!upstream.ok)return res.status(502).json({error:'Audio segment unavailable.'});const len=Number(upstream.headers.get('content-length'));if(len>4*1024*1024)return res.status(502).json({error:'Audio segment is too large.'});res.setHeader('Content-Type','audio/mp4');res.statusCode=200;Readable.fromWeb(upstream.body).on('error',()=>res.destroy()).pipe(res);return;
  }
  let url;if(mode==='search'){const q=String(req.query.q||'').trim().slice(0,100);if(!q)return res.status(400).json({error:'Enter a search term.'});url=new URL('/search/',host);url.searchParams.set('s',q)}else if(mode==='audio'||mode==='manifest'){const id=String(req.query.id||'');if(!/^\d{1,15}$/.test(id))return res.status(400).json({error:'Invalid track.'});url=new URL('/track/',host);url.searchParams.set('id',id);url.searchParams.set('quality','HIGH')}else return res.status(400).json({error:'Unknown request.'});
  const upstream=await fetch(url,{headers:{Authorization:`Bearer ${process.env.HIFI_API_SECRET}`},redirect:'error',signal:AbortSignal.timeout(90000)});if(upstream.status===202)return res.status(503).json({error:'The music service is busy. Try again shortly.'});if(!upstream.ok)return res.status(502).json({error:`Music service returned HTTP ${upstream.status}.`});
  const body=await upstream.json();if(mode==='search'){const items=body?.data?.items;if(!Array.isArray(items))return res.status(502).json({error:'Unexpected search response.'});return res.status(200).json({results:items.filter(t=>/^\d{1,15}$/.test(String(t.id))).slice(0,20).map(t=>({id:String(t.id),title:String(t.title||'Untitled').slice(0,200),channel:String(t.artist?.name||t.artists?.[0]?.name||'Unknown artist').slice(0,120),album:String(t.album?.title||'').slice(0,200),cover:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(t.album?.cover||''))?String(t.album.cover):'',duration:Number.isFinite(t.duration)?t.duration:0}))})}
  const manifest=body?.data?.manifest,type=body?.data?.manifestMimeType;if(typeof manifest!=='string')return res.status(502).json({error:'Invalid audio manifest.'});
  if(type==='application/dash+xml'){
    if(mode!=='manifest')return res.status(400).json({error:'Segmented playback required.'});
    try{return res.status(200).json({type:'dash',...dashSegments(Buffer.from(manifest,'base64').toString('utf8'))})}catch{return res.status(502).json({error:'This segmented audio format is not supported.'})}
  }
  if(type!=='application/vnd.tidal.bts')return res.status(502).json({error:'This audio format is not supported yet.'});
  if(mode==='manifest')return res.status(200).json({type:'direct'});
  let decoded;try{decoded=JSON.parse(Buffer.from(manifest,'base64').toString('utf8'))}catch{return res.status(502).json({error:'Invalid audio manifest.'})}if(decoded.encryptionType&&decoded.encryptionType!=='NONE')return res.status(502).json({error:'This track requires an unsupported playback format.'});
  const media=allowed(decoded.urls?.[0]);const headers={};if(/^bytes=\d*-\d*$/.test(req.headers.range||''))headers.Range=req.headers.range;
  const audio=await fetch(media,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});if(!audio.ok&&audio.status!==206)return res.status(502).json({error:`Audio service returned HTTP ${audio.status}.`});
  for(const name of ['content-type','content-length','content-range','accept-ranges']){let val=audio.headers.get(name);if(val)res.setHeader(name,val)}res.statusCode=audio.status;Readable.fromWeb(audio.body).on('error',()=>res.destroy()).pipe(res);
 }catch(e){console.error('Music service error',e?.name);if(!res.headersSent)res.status(502).json({error:'Music service unavailable. Try again later.'});else res.destroy()}
};
