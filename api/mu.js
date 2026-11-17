const { Readable } = require('node:stream');
module.exports = async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','https://aidan.im');res.setHeader('Vary','Origin');res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
  const base=process.env.HIFI_API_URL;
  if(!base)return res.status(503).json({error:'Music service is not connected yet.'});
  let host;try{host=new URL(base);if(host.protocol!=='https:'||host.username||host.password)throw Error()}catch{return res.status(503).json({error:'Music service configuration is invalid.'})}
  const mode=String(req.query.mode||'health');if(mode==='health')return res.status(200).json({ok:true,configured:true});
  let url;if(mode==='search'){const q=String(req.query.q||'').trim().slice(0,100);if(!q)return res.status(400).json({error:'Enter a search term.'});url=new URL('/search/',host);url.searchParams.set('s',q)}else if(mode==='audio'){const id=String(req.query.id||'');if(!/^\d{1,15}$/.test(id))return res.status(400).json({error:'Invalid track.'});url=new URL('/track/',host);url.searchParams.set('id',id);url.searchParams.set('quality','HIGH')}else return res.status(400).json({error:'Unknown request.'});
  try{
    const serviceHeaders={};if(process.env.HIFI_API_SECRET)serviceHeaders.Authorization=`Bearer ${process.env.HIFI_API_SECRET}`;
    const upstream=await fetch(url,{headers:serviceHeaders,redirect:'error',signal:AbortSignal.timeout(90000)});if(upstream.status===202)return res.status(503).json({error:'The music service is busy. Try again shortly.'});if(!upstream.ok)return res.status(502).json({error:`Music service returned HTTP ${upstream.status}.`});
    const body=await upstream.json();if(mode==='search'){const items=body?.data?.items;if(!Array.isArray(items))return res.status(502).json({error:'Unexpected search response.'});return res.status(200).json({results:items.filter(t=>/^\d{1,15}$/.test(String(t.id))).slice(0,20).map(t=>({id:String(t.id),title:String(t.title||'Untitled').slice(0,200),channel:String(t.artist?.name||t.artists?.[0]?.name||'Unknown artist').slice(0,120)}))})}
    const manifest=body?.data?.manifest;if(typeof manifest!=='string'||body?.data?.manifestMimeType!=='application/vnd.tidal.bts')return res.status(502).json({error:'This audio format is not supported yet.'});
    let decoded;try{decoded=JSON.parse(Buffer.from(manifest,'base64').toString('utf8'))}catch{return res.status(502).json({error:'Invalid audio manifest.'})}if(decoded.encryptionType&&decoded.encryptionType!=='NONE')return res.status(502).json({error:'This track requires an unsupported playback format.'});
    const media=new URL(decoded.urls?.[0]);if(media.protocol!=='https:'||!media.hostname.endsWith('.audio.tidal.com')||media.username||media.password)return res.status(502).json({error:'Unsupported audio source.'});
    const headers={};if(/^bytes=\d*-\d*$/.test(req.headers.range||''))headers.Range=req.headers.range;
    const audio=await fetch(media,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});if(!audio.ok&&audio.status!==206)return res.status(502).json({error:`Audio service returned HTTP ${audio.status}.`});
    for(const name of ['content-type','content-length','content-range','accept-ranges']){let val=audio.headers.get(name);if(val)res.setHeader(name,val)}res.statusCode=audio.status;Readable.fromWeb(audio.body).on('error',()=>res.destroy()).pipe(res);
  }catch(e){console.error('Music service error',e?.name);if(!res.headersSent)res.status(502).json({error:'Music service unavailable. Try again later.'});else res.destroy()}
};
