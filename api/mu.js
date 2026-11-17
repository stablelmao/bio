module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://aidan.im');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Only GET requests are supported.' });
  const mode = req.query.mode || 'health';
  if (mode === 'health') return res.status(200).json({ ok: true, message: 'Music API is reachable.', searchKeyConfigured: Boolean(process.env.YOUTUBE_API_KEY) });
  if (mode !== 'probe' && mode !== 'search') return res.status(400).json({ error: 'Unknown test.' });
  if (mode === 'search' && !process.env.YOUTUBE_API_KEY) return res.status(503).json({ error: 'YOUTUBE_API_KEY is not configured in Vercel. Enable YouTube Data API v3 and add the key as a production environment variable.' });
  let url;
  if (mode === 'probe') {
    url = new URL('https://www.youtube.com/oembed');
    url.search = new URLSearchParams({ url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk', format: 'json' }).toString();
  } else {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.status(400).json({ error: 'Enter a search term.' });
    url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.search = new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '8', q, key: process.env.YOUTUBE_API_KEY }).toString();
  }
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(502).json({ error: `YouTube responded HTTP ${upstream.status}: ${String(data.error?.message || data.error || 'upstream request failed').slice(0, 300)}`, upstreamStatus: upstream.status });
    if (mode === 'probe') return res.status(200).json({ ok: true, message: 'The server reached YouTube oEmbed.', title: data.title || null, note: 'This tests server connectivity, not playback or the YouTube Data API key.' });
    return res.status(200).json({ results: (data.items || []).filter(item => item.id?.videoId).map(item => ({ id: item.id.videoId, title: item.snippet?.title || 'Untitled', channel: item.snippet?.channelTitle || '' })) });
  } catch (error) {
    return res.status(502).json({ error: error.name === 'TimeoutError' ? 'YouTube request timed out after 10 seconds.' : `Server could not reach YouTube: ${error.message}` });
  }
};
