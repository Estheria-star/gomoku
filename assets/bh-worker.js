/*
 * bh-worker.js — 「冰痕」引擎 Worker 宿主（gomoku-ai minimax）
 * ================================================================
 * 冰痕的 think 为同步阻塞（2-3.5s），放 worker 中执行避免卡 UI。
 * 协议（主线程 → worker）：
 *   { type:'boot' }  加载引擎 → { type:'ready', info }
 *   { type:'think', board, myColor, timeLimit } → { type:'move', reqId, x, y, ms }
 *   坐标：x = 列 / y = 行（与网站 board[row][col] 对应：row=y, col=x）
 */
'use strict';

let ready = false;

function boot() {
  importScripts('binghen-engine.js');
  if (!self.BingHenEngine) throw new Error('BingHenEngine missing');
  ready = true;
}

self.onmessage = function (e) {
  const m = (e && e.data) || {};
  if (m.type === 'boot') {
    try {
      boot();
      self.postMessage({ type: 'ready', info: self.BingHenEngine.name || 'binghen' });
    } catch (err) {
      self.postMessage({ type: 'fatal', error: String((err && err.message) || err) });
    }
    return;
  }
  if (!ready) {
    self.postMessage({ type: 'error', reqId: m.reqId, error: 'engine not ready' });
    return;
  }
  if (m.type === 'think') {
    try {
      const t0 = Date.now();
      const mv = self.BingHenEngine.think(m.board, m.myColor, { timeLimit: m.timeLimit });
      self.postMessage({
        type: 'move', reqId: m.reqId,
        x: mv ? mv.col : -1, y: mv ? mv.row : -1,
        ms: Date.now() - t0
      });
    } catch (err) {
      self.postMessage({ type: 'error', reqId: m.reqId, error: String((err && err.message) || err) });
    }
  }
};
