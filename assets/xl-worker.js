/*
 * xl-worker.js — 「墨渊」引擎 Worker（xl-engine WebAssembly 宿主）
 * ================================================================
 * 协议（主线程 → worker）：
 *   { type:'boot' }                      启动/加载 wasm，就绪后回 { type:'ready', info }
 *   { type:'reset' }                     重开一局
 *   { type:'move', x, y }                按真实落子顺序通知一手
 *   { type:'think', timeout }            思考 → 回 { type:'move', x, y, ms, logs }（-1,-1 = PASS）
 *   { type:'rebuild', moves:[[x,y],...] } 重置 + 按序重放（悔棋/恢复局面用）
 *   { type:'ping' }                      探活 → { type:'pong' }
 *
 * 引擎行为要点（详见 xl-wasm/README.md）：
 *   - 15×15 固定；空盘 think 直接返回天元 (7,7)
 *   - 颜色由手数奇偶决定（第 1 手方=黑），宿主只需保证落子顺序正确
 *   - think 为同步阻塞调用（本 worker 内执行，不卡主线程）
 *   - 返回坐标打包 (x<<8)|y；x=列 0-14，y=行 0-14
 */
'use strict';

let XL = null;
let f = {};
let ready = false;
let bootPromise = null;
const SOURCE = 'xl-engine';

function boot() {
  importScripts(SOURCE + '.js');
  return self.createXlEngine({}).then(function (mod) {
    XL = mod;
    f.init    = mod.cwrap('xl_engine_init', null, ['number', 'number']);
    f.turn    = mod.cwrap('xl_engine_turn', 'number', ['number']);
    f.my      = mod.cwrap('xl_engine_my', null, ['number', 'number']);
    f.opp     = mod.cwrap('xl_engine_opp', null, ['number', 'number']);
    f.restart = mod.cwrap('xl_engine_restart', null, []);
    f.out     = mod.cwrap('xl_engine_out', 'string', []);
    f.clear   = mod.cwrap('xl_engine_clear_out', null, []);
    f.info    = mod.cwrap('xl_engine_info', 'string', []);
    f.init(15, 15);
    f.clear();
    ready = true;
  });
}

function out() {
  try {
    const s = f.out();
    f.clear();
    return s || '';
  } catch (e) {
    return '';
  }
}

self.onmessage = function (e) {
  const msg = (e && e.data) || {};

  if (msg.type === 'boot') {
    if (!bootPromise) bootPromise = boot();
    bootPromise.then(function () {
      self.postMessage({ type: 'ready', info: f.info() });
    }).catch(function (err) {
      self.postMessage({ type: 'fatal', error: String((err && err.message) || err) });
    });
    return;
  }
  if (msg.type === 'ping') {
    self.postMessage({ type: 'pong', ready: ready });
    return;
  }
  if (!ready) {
    self.postMessage({ type: 'error', error: 'engine not ready' });
    return;
  }

  try {
    if (msg.type === 'reset') {
      f.restart();
      f.clear();
      self.postMessage({ type: 'reset-ok', reqId: msg.reqId });
    } else if (msg.type === 'move') {
      /* my/opp 标签不影响引擎行为（均按序落子），统一走 opp 通道亦可；
         为日志可读性保留区分 */
      if (msg.who === 'my') f.my(msg.x, msg.y);
      else f.opp(msg.x, msg.y);
      f.clear();
      self.postMessage({ type: 'move-ok', reqId: msg.reqId });
    } else if (msg.type === 'rebuild') {
      f.restart();
      const moves = msg.moves || [];
      for (let i = 0; i < moves.length; i++) {
        f.opp(moves[i][0], moves[i][1]);
      }
      f.clear();
      self.postMessage({ type: 'reset-ok', reqId: msg.reqId, replayed: moves.length });
    } else if (msg.type === 'think') {
      const t0 = Date.now();
      const r = f.turn(msg.timeout || 4000);
      const ms = Date.now() - t0;
      const logs = out();
      if (r < 0) self.postMessage({ type: 'move', reqId: msg.reqId, x: -1, y: -1, ms: ms, logs: logs });
      else self.postMessage({ type: 'move', reqId: msg.reqId, x: (r >> 8) & 0xff, y: r & 0xff, ms: ms, logs: logs });
    } else {
      self.postMessage({ type: 'error', reqId: msg.reqId, error: 'unknown message: ' + msg.type });
    }
  } catch (err) {
    self.postMessage({ type: 'error', reqId: msg.reqId, error: String((err && err.message) || err) });
  }
};
