# Local test server for TORN (no caching, so edits show up right away). Usage: python serve.py
import http.server, functools
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
H.extensions_map['.glb'] = 'model/gltf-binary'
H.extensions_map['.js'] = 'text/javascript'
http.server.ThreadingHTTPServer(('', 8124), H).serve_forever()
