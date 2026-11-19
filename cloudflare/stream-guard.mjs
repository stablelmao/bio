// Route only stream.aidan.im/assets/sbx.js* to this Worker.
// The upstream script rejects sandboxed embeds. Keep the browser's popup and
// top-navigation protection enabled without breaking the existing video player.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname !== 'stream.aidan.im' || url.pathname !== '/assets/sbx.js') {
      return new Response('Not found', {status:404});
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', {status:405, headers:{Allow:'GET, HEAD'}});
    }
    return new Response(request.method === 'HEAD' ? null : '// Player sandbox is managed by aidan.im.\n', {
      headers:{
        'Content-Type':'application/javascript; charset=utf-8',
        'Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff'
      }
    });
  }
};
