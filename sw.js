// sw.js — Service Worker：为「文档 + Worker 脚本」注入 COOP/COEP 响应头
// 作用：页面进入跨源隔离（crossOriginIsolated）→ SharedArrayBuffer 可用 → Rapfi 多线程引擎
// 参考 coi-serviceworker 模式 · startian 五子棋 v56
//
// v56 变更：
//   ① 只拦截「文档导航」与「Worker 脚本」两类请求 —— 其余子资源（wasm/data/图片）直接走网络，
//      避免 30MB 资源二次转发，也彻底避开 content-encoding 二次解码的风险
//      （Worker 脚本必须也带上 COEP，否则 worker 内部的 crossOriginIsolated 为 false，
//         emscripten pthread 起不来 —— 2026-10-17 本地实测：只处理 navigate 时多线程必失败）
//   ② 注入失败/网络异常时原样放行或给出可读错误页，不影响单线程使用
//   ③ 不做任何缓存（本 Worker 只改响应头，不接管离线）
var COOP = 'same-origin';
var COEP = 'credentialless';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

function needInject(req) {
    if (req.mode === 'navigate') return true;
    var d = req.destination;
    return d === 'worker' || d === 'sharedworker' || d === 'serviceworker';
}

self.addEventListener('fetch', function (event) {
    var req = event.request;
    if (!needInject(req)) return;                  // 其余子资源一律不接管

    event.respondWith(
        fetch(req).then(function (resp) {
            if (!resp || resp.status === 0 || resp.type === 'opaqueredirect') return resp;
            try {
                var headers = new Headers(resp.headers);
                if (!headers.has('Cross-Origin-Opener-Policy')) headers.set('Cross-Origin-Opener-Policy', COOP);
                if (!headers.has('Cross-Origin-Embedder-Policy')) headers.set('Cross-Origin-Embedder-Policy', COEP);
                return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: headers });
            } catch (e) {
                return resp;                          // 不可改头 → 原样
            }
        }).catch(function () {
            if (req.mode !== 'navigate') return new Response('', { status: 504 });
            return new Response(
                '<!doctype html><meta charset="utf-8"><title>离线</title>' +
                '<body style="font-family:system-ui;background:#EAF4FF;color:#3C5A78;text-align:center;padding:12vh 8vw">' +
                '<h2>网络好像断了 🌙</h2><p>连上网络后刷新一次就能继续下棋。</p>' +
                '<button onclick="location.reload()" style="margin-top:18px;padding:10px 22px;border:0;border-radius:12px;' +
                'background:#89C2FF;color:#fff;font-size:15px;font-weight:700;cursor:pointer">刷新</button></body>',
                { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
        })
    );
});
