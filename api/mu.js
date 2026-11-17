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
    url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.search = new URLSearchParams({ part: 'id', id: 'M7lc1UVf-VE' }).toString();
  } else {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (!q) return res.status(400).json({ error: 'Enter a search term.' });
    url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.search = new URLSearchParams({ part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '8', q, key: process.env.YOUTUBE_API_KEY }).toString();
  }
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await upstream.json().catch(() => ({}));
    if (mode === 'probe') {
      const message = typeof data.error?.message === 'string' ? data.error.message : '';
      if ((upstream.status === 400 || upstream.status === 403) && /api key|credential|unauthenticated/i.test(message)) return res.status(200).json({ ok: true, message: `Google API responded HTTP ${upstream.status}: ${message.slice(0, 250)}`, note: 'This key-free connectivity check does not verify search, a valid API key, or playback.' });
      return res.status(502).json({ error: `Unexpected YouTube Data API response (HTTP ${upstream.status}): ${message ? message.slice(0, 250) : 'No recognizable Google API error returned.'}` });
    }
    if (!upstream.ok) return res.status(502).json({ error: `YouTube responded HTTP ${upstream.status}: ${String(data.error?.message || data.error || 'upstream request failed').slice(0, 300)}`, upstreamStatus: upstream.status });
    return res.status(200).json({ results: (data.items || []).filter(item => item.id?.videoId).map(item => ({ id: item.id.videoId, title: item.snippet?.title || 'Untitled', channel: item.snippet?.channelTitle || '' })) });
  } catch (error) {
    return res.status(502).json({ error: error.name === 'TimeoutError' ? 'YouTube request timed out after 10 seconds.' : `Server could not reach YouTube: ${error.message}` });
  }
};
