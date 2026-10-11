// engine-worker.js — 星恬五子棋 · 新一代引擎 worker 桥（Rapfi 0.43.02 · 单/多线程通用）
// 协议与旧版完全一致：__init / __think / __best / __stop  ↔  __ready / __fail / __move / __log / __cand / __err / __probe
// 多线程模式参考 RapfiWeb 的 pthread 模式：引擎线程（name=em-pthread）重开"本文件（含 ?variant=）"，只 importScripts(glue) 后交还控制权
(function () {
'use strict';

// 变体：主 worker 由主线程在 URL 上带 ?variant=multi-simd128 / single-simd128
// pthread 引擎线程由 glue 以 self.location.href（含 query）重开本文件 —— 变体自然传递
var qs = (self.location && self.location.search) || '';
var vm = /[?&]variant=([a-z0-9-]+)/.exec(qs);
var VARIANT = (vm && vm[1]) || 'single-simd128';
var IS_PTHREAD = (self.name === 'em-pthread');

// ── 引擎线程：读 glue，glue 自举线程后自己挂 onmessage ──
if (IS_PTHREAD) {
    try { importScripts('rapfi-' + VARIANT + '.js'); } catch (e) {}
    return;
}

// ── 主 worker ──
var _buf = '';
var _outCount = 0;
self.__g = 0;
self.__bm = null;

function feedChunk(s) {
    _outCount++;
    s = String(s == null ? '' : s);
    if (!s) return;
    // glue 的回调粒度为「行」（不带换行）；此处兼容两种形态：
    if (s.indexOf('\n') >= 0) {
        // 流式 chunk：行缓冲切分
        _buf += s;
        var idx;
        while ((idx = _buf.indexOf('\n')) >= 0) {
            var line = _buf.slice(0, idx);
            _buf = _buf.slice(idx + 1);
            __line(line);
        }
        if (_buf.length > 4096) { __line(_buf); _buf = ''; }
    } else {
        // 整行回调：若有残段先冲刷，再处理本行
        if (_buf) { var t = _buf; _buf = ''; __line(t); }
        __line(s);
    }
}

function __line(raw) {
    var line = String(raw == null ? '' : raw).trim();
    if (!line) return;
    if (self.__bm) {
        if (/^[0-9]+,[0-9]+$/.test(line)) {
            var p = line.split(','); self.__bm.mv++;
            if (self.__bm.mv >= 2) { var cc = self.__bm.cs.slice(); self.__bm = null; self.postMessage({ __move: { row: +p[0], col: +p[1] }, __cands: cc, __gen: self.__g || 0 }); }
            else { self.postMessage({ __probe: { row: +p[0], col: +p[1] }, __gen: self.__g || 0 }); }
            return;
        }
        if (/\(\d+\)\s*-?\d+\s*\|/.test(line)) { self.__bm.cs.push(line.replace(/^MESSAGE\s*/, '')); self.postMessage({ __cand: line, __gen: self.__g || 0 }); return; }
    }
    if (/^[0-9]+,[0-9]+$/.test(line)) { var p2 = line.split(','); self.postMessage({ __move: { row: +p2[0], col: +p2[1] }, __gen: self.__g || 0 }); }
    else if (line !== 'OK') { if (/Speed|Depth|Bestline|Node/.test(line)) self.postMessage({ __log: line }); }
}

function __run(d) {
    var e = self.__eng;
    self.__g = d.gen || 0;
    e.sendCommand('INFO RULE ' + (d.rule ? 4 : 0));
    e.sendCommand('START ' + d.boardSize);
    e.sendCommand('INFO TIMEOUT_TURN ' + d.timeoutTurnMs);
    e.sendCommand('INFO TIME_LEFT 600000');
    e.sendCommand('INFO MAX_DEPTH ' + d.maxDepth);
    e.sendCommand('INFO MAX_NODE ' + d.maxNodes);
    e.sendCommand('INFO SHOW_DETAIL 1');
    if (d.body) e.sendCommand('BOARD ' + d.body + ' DONE'); else e.sendCommand('BEGIN');
}

self.onmessage = function (ev) {
    var d = ev.data || {};
    if (d.__init) {
        if (typeof Rapfi === 'undefined') {
            try { importScripts('rapfi-' + VARIANT + '.js'); }
            catch (err) {
                self.postMessage({ __fail: 'glue load failed: ' + String((err && err.message) || err) });
                return;
            }
        }
        if (typeof Rapfi !== 'function') { self.postMessage({ __fail: 'glue invalid (no Rapfi factory)' }); return; }
        try {
            Rapfi({
                wasmBinary: d.wasmBuf || undefined,
                getPreloadedPackage: function () { var b = d.dataBuf || null; d.dataBuf = null; return b; },
                locateFile: function (p) { return p; },
                onReceiveStdout: feedChunk,
                onReceiveStderr: function (l) { self.postMessage({ __err: String(l) }); },
                setStatus: function () {},
                onExit: function (c) { self.postMessage({ __err: '[wasm exit ' + c + ']' }); }
            }).then(function (eng) {
                self.__eng = eng;
                self.postMessage({ __ready: true });
            }).catch(function (err) {
                self.postMessage({ __fail: String((err && err.message) || err) });
            });
        } catch (err) {
            self.postMessage({ __fail: String((err && err.message) || err) });
        }
    } else if (d.__think) {
        if (!self.__eng) { self.postMessage({ __fail: 'engine not ready' }); return; }
        try { __run(d); } catch (err) { self.postMessage({ __fail: String((err && err.message) || err) }); }
    } else if (d.__best) {
        // YXNBEST 通道未启用（YXNBEST_ON=false）——保守降级：按普通 think 处理
        if (!self.__eng) { self.postMessage({ __fail: 'engine not ready' }); return; }
        try { __run(d); } catch (err) { self.postMessage({ __fail: String((err && err.message) || err) }); }
    } else if (d.__stop) {
        try { if (self.__eng) self.__eng.sendCommand('YXSTOP'); } catch (err) {}
    } else if (d.__probe2) {
        var st = { outCount: _outCount, buf: _buf.slice(0, 200), eng: !!self.__eng };
        try { st.sc = self.__eng ? typeof self.__eng.sendCommand : 'no-eng'; } catch (e) { st.sc = 'err'; }
        try { st.keys = self.__eng ? Object.keys(self.__eng).slice(0, 20).join(',') : ''; } catch (e) {}
        self.postMessage({ __probe2: st });
    }
};
})();
