// sw.js — Service Worker：为页面注入 COOP/COEP 响应头（跨源隔离 → SharedArrayBuffer → 引擎多线程）
// 参考 coi-serviceworker 模式 · startian 五子棋 v37
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
    event.respondWith(
        fetch(req).then(function (resp) {
            if (resp.status === 0) return resp;                 // opaque 错误响应
            if (resp.type === 'opaqueredirect') return resp;
            try {
                var headers = new Headers(resp.headers);
                if (!headers.has('Cross-Origin-Opener-Policy')) headers.set('Cross-Origin-Opener-Policy', 'same-origin');
                if (!headers.has('Cross-Origin-Embedder-Policy')) headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
                return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: headers });
            } catch (e) {
                return resp;   // opaque（no-cors 跨域）等不可改头 → 原样
            }
        }).catch(function (err) {
            return new Response('sw-fetch-failed', { status: 502 });
        })
    );
});
