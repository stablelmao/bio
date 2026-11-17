"""Authenticated gateway for a pinned HiFi API checkout."""
import hmac
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'upstream'))
from main import app as upstream

async def app(scope, receive, send):
    if scope['type'] != 'http':
        await upstream(scope, receive, send)
        return
    if scope.get('method') == 'GET' and scope.get('path') == '/health':
        await send({'type': 'http.response.start', 'status': 200, 'headers': [(b'content-type', b'application/json'), (b'cache-control', b'no-store')]})
        await send({'type': 'http.response.body', 'body': b'{"ok":true}'})
        return
    secret = os.environ.get('HIFI_API_SECRET', '')
    supplied = dict(scope.get('headers', [])).get(b'authorization', b'')
    expected = ('Bearer ' + secret).encode()
    allowed = scope.get('method') == 'GET' and scope.get('path') in ('/search/', '/track/')
    if not secret or not hmac.compare_digest(supplied, expected) or not allowed:
        await send({'type': 'http.response.start', 'status': 403, 'headers': [(b'content-type', b'application/json'), (b'cache-control', b'no-store')]})
        await send({'type': 'http.response.body', 'body': b'{"error":"forbidden"}'})
        return
    await upstream(scope, receive, send)
