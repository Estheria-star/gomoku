/*!
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

  function checkWin(row, col) {
          const p = gameState.board[row][col];
          for(let [dx,dy] of DIRS) {
              let cnt = 1;
              for(let i=1; i<5; i++) { let nr=row+i*dx, nc=col+i*dy; if(nr<0||nr>=15||nc<0||nc>=15||gameState.board[nr][nc]!==p) break; cnt++; }
              for(let i=1; i<5; i++) { let nr=row-i*dx, nc=col-i*dy; if(nr<0||nr>=15||nc<0||nc>=15||gameState.board[nr][nc]!==p) break; cnt++; }
              if(cnt >= 5) return true;
          }
          return false;
      }

  function lineInfoFull(row, col, dx, dy, player) {
          let count = 1;
          let openBefore = 0, openAfter = 0;
          for(let i=1; i<5; i++) {
              let r = row + i*dx, c = col + i*dy;
              if(r<0||r>=15||c<0||c>=15) break;
              if(gameState.board[r][c] === player) count++;
              else if(gameState.board[r][c] === 0) { openAfter = 1; break; }
              else break;
          }
          for(let i=1; i<5; i++) {
              let r = row - i*dx, c = col - i*dy;
              if(r<0||r>=15||c<0||c>=15) break;
              if(gameState.board[r][c] === player) count++;
              else if(gameState.board[r][c] === 0) { openBefore = 1; break; }
              else break;
          }
          let openEnds = openBefore + openAfter;
          return { count, openEnds };
      }

  function lineInfo(row, col, dx, dy, player) {
          let count = 1;
          let openBefore = 0, openAfter = 0;
          for(let i=1; i<5; i++) {
              let r = row + i*dx, c = col + i*dy;
              if(r<0||r>=15||c<0||c>=15) break;
              if(gameState.board[r][c] === player) count++;
              else if(gameState.board[r][c] === 0) { openAfter = 1; break; }
              else break;
          }
          for(let i=1; i<5; i++) {
              let r = row - i*dx, c = col - i*dy;
              if(r<0||r>=15||c<0||c>=15) break;
              if(gameState.board[r][c] === player) count++;
              else if(gameState.board[r][c] === 0) { openBefore = 1; break; }
              else break;
          }
          let openEnds = openBefore + openAfter;
          return { count, openEnds, openBefore, openAfter };
      }

  function positionValue(row, col, player) {
          let score = 0;
          let flex3Count = 0;
          let block4Count = 0;
          for(let [dx,dy] of DIRS) {
              let info = lineInfo(row, col, dx, dy, player);
              let c = info.count;
              let o = info.openEnds;
              if(c >= 5) score += 10000000;
              else if(c === 4 && o >= 1) score += 500000;
              else if(c === 4 && o === 0) { score += 8000; block4Count++; }
              else if(c === 3 && o === 2) { score += 5000; flex3Count++; }
              else if(c === 3 && o === 1) score += 1200;
              else if(c === 2 && o === 2) score += 400;
              else if(c === 2 && o === 1) score += 80;
              else if(c === 1 && o >= 1) score += 10;
          }
          if(flex3Count >= 2) score += 300000;
          if(block4Count >= 1 && flex3Count >= 1) score += 250000;
          if(block4Count >= 2) score += 200000;
          return score;
      }

  function evaluateBoard() {
          let aiScore = 0, playerScore = 0;
          for(let r=0; r<15; r++) for(let c=0; c<15; c++) {
              if(gameState.board[r][c] === 2) aiScore += positionValue(r, c, 2);
              else if(gameState.board[r][c] === 1) playerScore += positionValue(r, c, 1);
          }
          for(let r=3; r<=11; r++) for(let c=3; c<=11; c++) {
              if(gameState.board[r][c] === 2) aiScore += 30;
              else if(gameState.board[r][c] === 1) playerScore += 15;
          }
          return aiScore - playerScore * 15.0;
      }

  function hasNeighbor(r,c,d=2) {
          for(let i=Math.max(0,r-d); i<=Math.min(14,r+d); i++) for(let j=Math.max(0,c-d); j<=Math.min(14,c+d); j++) if(gameState.board[i][j]!==0) return true;
          return false;
      }

  function genMoves() {
          let cand = [];
          for(let r=0; r<15; r++) for(let c=0; c<15; c++) {
              if(gameState.board[r][c] !== 0 || !hasNeighbor(r,c,2)) continue;
              gameState.board[r][c] = 2;
              let aiScore = positionValue(r, c, 2);
              gameState.board[r][c] = 0;
  
              gameState.board[r][c] = 1;
              let playerScore = positionValue(r, c, 1);
              gameState.board[r][c] = 0;
  
              let total = aiScore + playerScore * 10.0;
              total += 14 - (Math.abs(r-7) + Math.abs(c-7));
              cand.push({row: r, col: c, score: total});
          }
          cand.sort((a,b) => b.score - a.score);
          return cand.slice(0, 15);
      }

  function findWinningMove(player) {
          for(let r=0; r<15; r++) for(let c=0; c<15; c++) if(gameState.board[r][c]===0) {
              gameState.board[r][c] = player;
              if(checkWin(r, c)) { gameState.board[r][c] = 0; return {row: r, col: c}; }
              gameState.board[r][c] = 0;
          }
          return null;
      }

  function willCreateDoubleThreat(row, col, player) {
          if(gameState.board[row][col] !== 0) return false;
          gameState.board[row][col] = player;
          let threats = 0;
          for(let [dx,dy] of DIRS) {
              let info = lineInfoFull(row, col, dx, dy, player);
              let c = info.count;
              let o = info.openEnds;
              /* v2 收紧（2026-10-14）：真活三（两端开放）计 2 分、眠三计 1 分 —— 消除"双眠三误报双杀" */
              if(c === 3 && o === 2) threats += 2;
              else if(c === 3 && o === 1) threats += 1;
              // 冲四（count===4且openEnds===1）
              if(c === 4 && o === 1) threats += 2;
              // 活四直接必胜
              if(c === 4 && o >= 2) { gameState.board[row][col] = 0; return true; }
          }
          gameState.board[row][col] = 0;
          return threats >= 3;   /* v2：至少"真活三+1 威胁"或"双冲四"才算双杀 */
      }


  /* ================= v2 增强（2026-10-14）：活四威胁检测与封锁 ================= */
  /* 检测：player 在 (r,c) 落子后是否形成"活四"（>=4 连且两端开放） */
  function wouldMakeOpenFour(r, c, player) {
          if(gameState.board[r][c] !== 0) return false;
          gameState.board[r][c] = player;
          let danger = false;
          for(let [dx,dy] of DIRS) {
              let info = lineInfo(r, c, dx, dy, player);
              if(info.count >= 4 && info.openEnds >= 2) { danger = true; break; }
          }
          gameState.board[r][c] = 0;
          return danger;
      }

  /* 扫描：player（对手）任一落子能形成活四的点 → 返回威胁值最大的封锁点 */
  function findOpenFourBlock(player) {
          let best = null, bestVal = -1;
          for(let r=0; r<15; r++) for(let c=0; c<15; c++) {
              if(gameState.board[r][c] !== 0 || !hasNeighbor(r,c,2)) continue;
              if(!wouldMakeOpenFour(r, c, player)) continue;
              let v = positionValue(r, c, player);
              if(v > bestVal) { bestVal = v; best = { row: r, col: c }; }
          }
          return best;
      }

  function minimax(depth, alpha, beta, isMax, start, limit) {
          if(Date.now() - start > limit) return evaluateBoard();
          let w = 0;
          for(let r=0;r<15;r++) for(let c=0;c<15;c++) if(gameState.board[r][c]!==0 && checkWin(r,c)) { w = gameState.board[r][c]; break; }
          if(w !== 0) return w === 2 ? 100000000 : -100000000;
          if(depth === 0) return evaluateBoard();
  
          let moves = genMoves();
          if(!moves.length) return 0;
  
          if(isMax) {
              let maxEval = -Infinity;
              for(let mv of moves) {
                  gameState.board[mv.row][mv.col] = 2;
                  if(checkWin(mv.row, mv.col)) { gameState.board[mv.row][mv.col] = 0; return 100000000; }
                  let ev = minimax(depth-1, alpha, beta, false, start, limit);
                  gameState.board[mv.row][mv.col] = 0;
                  maxEval = Math.max(maxEval, ev);
                  alpha = Math.max(alpha, ev);
                  if(beta <= alpha) break;
              }
              return maxEval;
          } else {
              let minEval = Infinity;
              for(let mv of moves) {
                  gameState.board[mv.row][mv.col] = 1;
                  if(checkWin(mv.row, mv.col)) { gameState.board[mv.row][mv.col] = 0; return -100000000; }
                  let ev = minimax(depth-1, alpha, beta, true, start, limit);
                  gameState.board[mv.row][mv.col] = 0;
                  minEval = Math.min(minEval, ev);
                  beta = Math.min(beta, ev);
                  if(beta <= alpha) break;
              }
              return minEval;
          }
      }

  function getUltimateHellAIMove() {
          let start = Date.now();
          let maxDepth = gameState.__maxDepth || (gameState.model === 'fullpower' ? 14 : 12);
          let timeLimit = gameState.__timeLimit || (gameState.model === 'fullpower' ? 3500 : 2500);
          let moves = genMoves();
          if(!moves.length) return null;
  
          let bestMove = null;
          let bestScore = -Infinity;
          let winMove = findWinningMove(2);
          if(winMove) return winMove;
  
          for(let d=2; d<=maxDepth; d++) {
              if(Date.now() - start > timeLimit) break;
              let curBest = null, curScore = -Infinity;
              for(let mv of moves) {
                  if(Date.now() - start > timeLimit) break;
                  gameState.board[mv.row][mv.col] = 2;
                  if(checkWin(mv.row, mv.col)) {
                      gameState.board[mv.row][mv.col] = 0;
                      depthCount.textContent = d;
                      winChance.textContent = '0.00%';
                      return mv;
                  }
                  let sc = minimax(d-1, -Infinity, Infinity, false, start, timeLimit);
                  gameState.board[mv.row][mv.col] = 0;
                  if(sc > curScore) { curScore = sc; curBest = mv; }
              }
              if(curBest) { bestMove = curBest; bestScore = curScore; gameState.stats.maxDepth = d; }
              // 动态聚焦：如果当前最优分数极高（比如已经接近必胜），则提前结束迭代
              if(bestScore > 90000000) break;
          }
          depthCount.textContent = gameState.stats.maxDepth;
          winChance.textContent = '0.00%';
          return bestMove || moves[0];
      }
  /* ================= 决策链（提取自上游 makeAIMove 第 1-5 步，去 UI） ================= */
  function decide() {
    var r, c;
    /* 1. 直接胜利 */
    var winMove = findWinningMove(2);
    if (winMove) return winMove;
    /* 2. 阻挡玩家直接胜利 */
    var playerWin = findWinningMove(1);
    if (playerWin) return playerWin;
    /* 2.5 【v2】封锁玩家的活四威胁（活三/跳三的成四点）——防"活三→活四→五"速败链 */
    var blockMove = findOpenFourBlock(1);
    if (blockMove) return blockMove;
    /* 3. 自造双杀点（双活三/四三） */
    for (r = 0; r < 15; r++) for (c = 0; c < 15; c++) {
      if (gameState.board[r][c] === 0 && willCreateDoubleThreat(r, c, 2)) return { row: r, col: c };
    }
    /* 4. 预判玩家双杀点，优先阻挡（v2：选威胁值最大的点，而非坐标序第一个） */
    var bestBlock = null, bestBlockVal = -1;
    for (r = 0; r < 15; r++) for (c = 0; c < 15; c++) {
      if (gameState.board[r][c] === 0 && willCreateDoubleThreat(r, c, 1)) {
        var _bv = positionValue(r, c, 1);
        if (_bv > bestBlockVal) { bestBlockVal = _bv; bestBlock = { row: r, col: c }; }
      }
    }
    if (bestBlock) return bestBlock;
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
