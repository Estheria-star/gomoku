# -*- coding: utf-8 -*-
"""patch_binghen_guard.py — 冰痕 v2 增强补丁（活四威胁封锁 + 双杀判定收紧）

背景（2026-10-14 复盘）：冰痕 3 局败仗同一模式"活三→活四→五"，
代码级根因：① 决策链缺"活三封锁"步骤；② willCreateDoubleThreat 判定过松
（眠三算威胁 → 双眠三误报双杀 → 假进攻抢走防守手）。

本补丁（GPL-3.0 修改，需在 sources 注明）：
  1. 注入 wouldMakeOpenFour / findOpenFourBlock（全形态模拟检测：连三/跳三通用）
  2. decide() 新增步骤 2.5：封锁对手"落子即活四"的点（放在自造双杀之前——先保命再进攻）
  3. willCreateDoubleThreat 收紧：真活三(两端开)=2 分、眠三=1 分，双杀阈值 >=3

用法: python patch_binghen_guard.py [目标文件]
默认: C:/Users/86186/Desktop/代码/五子棋/github-pages/assets/binghen-engine.js
（可重复应用于"重新提取的上游版本"；已打过补丁的文件会报 FAIL 拒绝二次执行）
"""
import io
import sys

TARGET = sys.argv[1] if len(sys.argv) > 1 else 'C:/Users/86186/Desktop/代码/五子棋/github-pages/assets/binghen-engine.js'


def crlf(s):
    return s.replace('\r\n', '\n').replace('\n', '\r\n')


src = io.open(TARGET, encoding='utf-8', newline='').read()


def patch(text, old, new, tag):
    o, n = crlf(old), crlf(new)
    c = text.count(o)
    if c != 1:
        raise SystemExit('[FAIL] %s: 匹配数=%d（文件可能已打过补丁或版本不符）' % (tag, c))
    print('[ok]', tag)
    return text.replace(o, n)


NEW_FUNCS = """
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

"""

OLD_JUDGE = """              // 活三（一端开放也算活三的变种，这里简化：count===3且openEnds>=1）
              if(c === 3 && o >= 1) threats++;
"""
NEW_JUDGE = """              /* v2 收紧（2026-10-14）：真活三（两端开放）计 2 分、眠三计 1 分 —— 消除"双眠三误报双杀" */
              if(c === 3 && o === 2) threats += 2;
              else if(c === 3 && o === 1) threats += 1;
"""

OLD_DECIDE = """    /* 2. 阻挡玩家直接胜利 */
    var playerWin = findWinningMove(1);
    if (playerWin) return playerWin;
"""
NEW_DECIDE = """    /* 2. 阻挡玩家直接胜利 */
    var playerWin = findWinningMove(1);
    if (playerWin) return playerWin;
    /* 2.5 【v2】封锁玩家的活四威胁（活三/跳三的成四点）——防"活三→活四→五"速败链 */
    var blockMove = findOpenFourBlock(1);
    if (blockMove) return blockMove;
"""

OLD_BLOCK4 = """    /* 4. 预判玩家双杀点，优先阻挡 */
    for (r = 0; r < 15; r++) for (c = 0; c < 15; c++) {
      if (gameState.board[r][c] === 0 && willCreateDoubleThreat(r, c, 1)) return { row: r, col: c };
    }
"""
NEW_BLOCK4 = """    /* 4. 预判玩家双杀点，优先阻挡（v2：选威胁值最大的点，而非坐标序第一个） */
    var bestBlock = null, bestBlockVal = -1;
    for (r = 0; r < 15; r++) for (c = 0; c < 15; c++) {
      if (gameState.board[r][c] === 0 && willCreateDoubleThreat(r, c, 1)) {
        var _bv = positionValue(r, c, 1);
        if (_bv > bestBlockVal) { bestBlockVal = _bv; bestBlock = { row: r, col: c }; }
      }
    }
    if (bestBlock) return bestBlock;
"""

src = patch(src, OLD_JUDGE, NEW_JUDGE, 'willCreateDoubleThreat 判定收紧')
src = patch(src, 'return threats >= 2;', 'return threats >= 3;   /* v2：至少"真活三+1 威胁"或"双冲四"才算双杀 */', '双杀阈值 >=3')
src = patch(src, '  function minimax(depth, alpha, beta, isMax, start, limit) {', NEW_FUNCS + '  function minimax(depth, alpha, beta, isMax, start, limit) {', '注入 v2 函数')
src = patch(src, OLD_DECIDE, NEW_DECIDE, 'decide 新增步骤 2.5')
src = patch(src, OLD_BLOCK4, NEW_BLOCK4, 'decide 步骤 4 选点优化')

io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
print('[DONE]', TARGET, len(src.encode('utf-8')), 'bytes')
