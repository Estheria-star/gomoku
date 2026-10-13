# -*- coding: utf-8 -*-
"""
prepare_kevin.py — 从 kevin2014123/gomoku-ai 提取五子棋 AI 核心 → 自包含 IIFE
================================================================================
源: https://github.com/kevin2014123/gomoku-ai (GPL-3.0)
输入: C:/tmp/kevin_gomoku.js (script.js)
输出: kevin-extract/binghen-engine.js

提取策略（最小侵入）：
  - 算法函数（minimax / 评估 / 棋型 / 候选生成）原样提取，逻辑一字不改
  - 上游依赖的 UI（status/makeMove/depthCount/winChance）用桩替代
  - 决策链提取自上游 makeAIMove 的第 1-5 步（去掉 UI 与 setTimeout）
  - 适配层负责：真实棋盘颜色 → 引擎内部语义（2=自己, 1=对手）
"""
import os
import re

SRC = r'C:/tmp/kevin_gomoku.js'
OUT_DIR = r'C:/Users/86186/WorkBuddy/曦月/gomoku-renju/kevin-extract'
OUT = os.path.join(OUT_DIR, 'binghen-engine.js')

t = open(SRC, encoding='utf-8').read()


def get_func(name):
    i = t.find('function ' + name + '(')
    if i < 0:
        raise RuntimeError('function not found: ' + name)
    j = t.find('{', i)
    depth = 0
    k = j
    while k < len(t):
        if t[k] == '{':
            depth += 1
        elif t[k] == '}':
            depth -= 1
            if depth == 0:
                break
        k += 1
    return t[i:k + 1]


FUNCS = [
    'checkWin', 'lineInfoFull', 'lineInfo', 'positionValue', 'evaluateBoard',
    'hasNeighbor', 'genMoves', 'findWinningMove', 'willCreateDoubleThreat',
    'minimax', 'getUltimateHellAIMove',
]

parts = []
for fn in FUNCS:
    body = get_func(fn)
    # 时间限制参数化（原：fullpower ? 3500 : 2500；maxDepth 14 : 12）
    body = body.replace(
        "let timeLimit = gameState.model === 'fullpower' ? 3500 : 2500;",
        "let timeLimit = gameState.__timeLimit || (gameState.model === 'fullpower' ? 3500 : 2500);"
    )
    body = body.replace(
        "let maxDepth = gameState.model === 'fullpower' ? 14 : 12;",
        "let maxDepth = gameState.__maxDepth || (gameState.model === 'fullpower' ? 14 : 12);"
    )
    parts.append('  ' + body.replace('\n', '\n  '))

HEADER = r'''/*!
 * 冰痕引擎（内部代号 BingHen）
 * ==================================================================
 * 提取自 kevin2014123/gomoku-ai  (https://github.com/kevin2014123/gomoku-ai)
 * 上游许可：GPL-3.0
 *
 * 提取说明（自动化脚本 prepare_kevin.py 生成）：
 *   - 算法函数（minimax / 评估 / 棋型 / 候选生成）原样提取，算法逻辑未改动
 *   - 上游依赖的界面元素以桩（stub）替代
 *   - 决策链照抄上游 makeAIMove 第 1-5 步，去除 UI 与 setTimeout 包装
 *   - 新增适配层：真实棋盘颜色 → 引擎内部语义（2=自己 / 1=对手）
 *
 * 引擎特性：Minimax + Alpha-Beta 剪枝 + 迭代加深（2→14 层）+ 时间限制
 *   + 直接胜利/防守 + 双杀点自造/预判 的决策链前置
 *
 * 接口：BingHenEngine.think(board, myColor, opts) → {row, col, depth} | null
 *   board: 15×15 数字数组（0=空，其余为两家颜色值）
 *   myColor: 本引擎执的颜色值（与 board 中该方的值一致）
 *   opts: { strong?: boolean, timeLimit?: ms, maxDepth?: n }
 * ==================================================================
 */
(function (root) {
  'use strict';

  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  /* ================= 上游函数的“假环境”桩 ================= */
  var gameState = null;          /* 由适配层填充 */
  var capturedMove = null;       /* makeMove 桩捕获 */
  var status = { innerHTML: '' };
  function updateGameStatus() {}
  function makeMove(row, col) { capturedMove = { row: row, col: col }; }
  var depthCount = { textContent: 0 };
  var winChance = { textContent: '' };

  /* ================= 上游算法（提取，未改逻辑） ================= */

'''

FOOTER = r'''
  /* ================= 决策链（提取自上游 makeAIMove 第 1-5 步，去 UI） ================= */
  function decide() {
    var r, c;
    /* 1. 直接胜利 */
    var winMove = findWinningMove(2);
    if (winMove) return winMove;
    /* 2. 阻挡玩家直接胜利 */
    var playerWin = findWinningMove(1);
    if (playerWin) return playerWin;
    /* 3. 自造双杀点（双活三/四三） */
    for (r = 0; r < 15; r++) for (c = 0; c < 15; c++) {
      if (gameState.board[r][c] === 0 && willCreateDoubleThreat(r, c, 2)) return { row: r, col: c };
    }
    /* 4. 预判玩家双杀点，优先阻挡 */
    for (r = 0; r < 15; r++) for (c = 0; c < 15; c++) {
      if (gameState.board[r][c] === 0 && willCreateDoubleThreat(r, c, 1)) return { row: r, col: c };
    }
    /* 5. 常规深度搜索 */
    return getUltimateHellAIMove();
  }

  /* ================= 适配层 ================= */

  /**
   * 思考一步。
   * @param {number[][]} board15  15×15 数组，0=空
   * @param {number} myColor      本引擎执的颜色（与 board 中的颜色值一致）
   * @param {object} [opts]       { strong, timeLimit, maxDepth }
   * @returns {{row:number,col:number,depth:number}|null}
   */
  function think(board15, myColor, opts) {
    opts = opts || {};
    var nb = new Array(15);
    var r, c, v;
    /* 空盘特判：上游 genMoves 只生成“有邻居”的点，空盘无候选 */
    var empty = true;
    for (r = 0; r < 15 && empty; r++) {
      for (c = 0; c < 15; c++) { if (board15[r][c]) { empty = false; break; } }
    }
    if (empty) return { row: 7, col: 7, depth: 0 };
    for (r = 0; r < 15; r++) {
      nb[r] = new Array(15);
      for (c = 0; c < 15; c++) {
        v = board15[r][c];
        nb[r][c] = (v === 0 || v == null) ? 0 : (v === myColor ? 2 : 1);
      }
    }
    gameState = {
      board: nb,
      currentPlayer: 2,
      gameOver: false,
      model: (opts.strong === false) ? 'normal' : 'fullpower',
      stats: { maxDepth: 0 },
      __timeLimit: opts.timeLimit || 0,
      __maxDepth: opts.maxDepth || 0
    };
    capturedMove = null;
    var mv = decide();
    if (!mv) return null;
    return { row: mv.row, col: mv.col, depth: gameState.stats.maxDepth };
  }

  root.BingHenEngine = { name: '冰痕', think: think };
})(typeof self !== 'undefined' ? self
  : (typeof globalThis !== 'undefined' ? globalThis
  : (typeof window !== 'undefined' ? window : this)));
'''

os.makedirs(OUT_DIR, exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(HEADER)
    f.write('\n\n'.join(parts))
    f.write(FOOTER)

print('输出:', OUT)
print('大小:', os.path.getsize(OUT), 'bytes')
