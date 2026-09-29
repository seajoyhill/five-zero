/**
 * mcts_ai.js — 连续冲四搜索 + 蒙特卡洛树搜索五子棋 AI
 *
 * 依赖：board.js 中的 EMPTY / BLACK / WHITE，以及 ai.js 中的 AIPlayer 和 AIPlayerFactory。
 */

// ── AI 思考强度 ───────────────────────────────────────
// 时间越长，可搜索的变化越多。forcingDepth 按双方合计的落子手数计算。
const AI_THINKING_LEVELS = Object.freeze({
  easy: {
    label: '入门',
    thinkTimeMs: 250,
    maxCandidates: 28,
    rolloutDepth: 8,
    forcingDepth: 5,
  },
  balanced: {
    label: '标准',
    thinkTimeMs: 800,
    maxCandidates: 40,
    rolloutDepth: 12,
    forcingDepth: 9,
  },
  strong: {
    label: '强力',
    thinkTimeMs: 1800,
    maxCandidates: 52,
    rolloutDepth: 16,
    forcingDepth: 13,
  },
  expert: {
    label: '大师',
    thinkTimeMs: 4000,
    maxCandidates: 64,
    rolloutDepth: 20,
    forcingDepth: 17,
  },
});

// ── MCTS 内部工具 ─────────────────────────────────────
const MCTS_SEARCH_DIRECTIONS = [
  [0, 1], [1, 0], [1, 1], [1, -1],
];
const MCTS_FORCING_TIMEOUT = Symbol('forcing-search-timeout');

function mctsOpponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

function mctsIndex(size, row, col) {
  return row * size + col;
}

function mctsInside(size, row, col) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

function mctsHasFive(board, size, row, col, player) {
  for (const [dr, dc] of MCTS_SEARCH_DIRECTIONS) {
    let count = 1;
    for (let direction = 1; direction <= 4; direction++) {
      const r = row + dr * direction;
      const c = col + dc * direction;
      if (mctsInside(size, r, c) && board[mctsIndex(size, r, c)] === player) count++;
      else break;
    }
    for (let direction = 1; direction <= 4; direction++) {
      const r = row - dr * direction;
      const c = col - dc * direction;
      if (mctsInside(size, r, c) && board[mctsIndex(size, r, c)] === player) count++;
      else break;
    }
    if (count >= 5) return true;
  }
  return false;
}

function mctsIsWinningMove(board, size, move, player) {
  const index = mctsIndex(size, move.row, move.col);
  board[index] = player;
  const won = mctsHasFive(board, size, move.row, move.col, player);
  board[index] = EMPTY;
  return won;
}

function mctsCountEmpty(board) {
  let count = 0;
  for (const cell of board) if (cell === EMPTY) count++;
  return count;
}

const MCTS_CENTER_BIT = 1 << 5;
const MCTS_FIVE_WINDOWS = [1, 2, 3, 4, 5].map(start => 31 << start);
const MCTS_SIX_WINDOWS = [0, 1, 2, 3, 4, 5].map(start => ({
  ends: (1 << start) | (1 << (start + 5)),
  middle: 15 << (start + 1),
}));
const MCTS_PATTERN_CACHE = new Map();

function mctsCappedBitCount(mask) {
  if (mask === 0) return 0;
  return (mask & (mask - 1)) === 0 ? 1 : 2;
}

function mctsLinePattern(stones, empty) {
  const key = stones * 2048 + empty;
  const cached = MCTS_PATTERN_CACHE.get(key);
  if (cached) return cached;

  let winning = false;
  let winningReplies = 0;
  let liveThreeExtensions = 0;
  let openTwos = 0;
  // 五格四子一空：下一手能成五；两个不同空位就是活四或双冲四。
  for (const window of MCTS_FIVE_WINDOWS) {
    if ((stones & window) === window) {
      winning = true;
    } else if (((stones | empty) & window) === window) {
      const gap = empty & window;
      if (gap !== 0 && (gap & (gap - 1)) === 0) winningReplies |= gap;
    }
  }

  // 六格两端为空、中间三子一空：填入空位可形成活四。
  for (const window of MCTS_SIX_WINDOWS) {
    if ((empty & window.ends) !== window.ends ||
        ((stones | empty) & window.middle) !== window.middle) continue;
    const gap = empty & window.middle;
    if (gap !== 0 && (gap & (gap - 1)) === 0) liveThreeExtensions |= gap;
    else if (mctsCappedBitCount(stones & window.middle) === 2 &&
             mctsCappedBitCount(gap) === 2) openTwos++;
  }

  const result = {
    winning,
    winningReplies: mctsCappedBitCount(winningReplies),
    liveThreeExtensions: mctsCappedBitCount(liveThreeExtensions),
    openTwos: Math.min(2, openTwos),
  };
  if (MCTS_PATTERN_CACHE.size < 32768) MCTS_PATTERN_CACHE.set(key, result);
  return result;
}

// 同时评估这一点的进攻棋形，以及对手若下在此处会形成的威胁。
function mctsMovePatterns(board, size, move, player) {
  const attack = {
    winning: false, winningReplies: 0, liveThreeExtensions: 0, liveThreeDirections: 0, openTwos: 0,
  };
  const defense = {
    winning: false, winningReplies: 0, liveThreeExtensions: 0, liveThreeDirections: 0, openTwos: 0,
  };

  for (const [dr, dc] of MCTS_SEARCH_DIRECTIONS) {
    let black = 0;
    let white = 0;
    let empty = 0;
    for (let offset = -5; offset <= 5; offset++) {
      const row = move.row + dr * offset;
      const col = move.col + dc * offset;
      if (!mctsInside(size, row, col)) continue;
      const bit = 1 << (offset + 5);
      const value = board[mctsIndex(size, row, col)];
      if (value === BLACK) black |= bit;
      else if (value === WHITE) white |= bit;
      else if (offset !== 0) empty |= bit;
    }

    const own = player === BLACK ? black : white;
    const opposing = player === BLACK ? white : black;
    const ownPattern = mctsLinePattern(own | MCTS_CENTER_BIT, empty);
    const opposingPattern = mctsLinePattern(opposing | MCTS_CENTER_BIT, empty);
    attack.liveThreeDirections += ownPattern.liveThreeExtensions > 0 ? 1 : 0;
    defense.liveThreeDirections += opposingPattern.liveThreeExtensions > 0 ? 1 : 0;
    attack.openTwos += ownPattern.openTwos;
    defense.openTwos += opposingPattern.openTwos;
    attack.winning = attack.winning || ownPattern.winning;
    defense.winning = defense.winning || opposingPattern.winning;
    attack.winningReplies = Math.min(2, attack.winningReplies + ownPattern.winningReplies);
    defense.winningReplies = Math.min(2, defense.winningReplies + opposingPattern.winningReplies);
    attack.liveThreeExtensions = Math.min(2,
      attack.liveThreeExtensions + ownPattern.liveThreeExtensions);
    defense.liveThreeExtensions = Math.min(2,
      defense.liveThreeExtensions + opposingPattern.liveThreeExtensions);
  }

  return { attack, defense };
}

function mctsPatternScore(pattern, defending) {
  if (pattern.winning) return defending ? 50000 : 100000;
  if (pattern.winningReplies === 2) return defending ? 18000 : 20000;
  if (pattern.winningReplies === 1 && pattern.liveThreeDirections > 0) {
    return defending ? 8500 : 10000;
  }
  if (pattern.winningReplies === 1) return defending ? 4500 : 5000;
  // 一条直活三的两个延伸点不是双三；双三必须分处不同方向。
  if (pattern.liveThreeDirections >= 2) return defending ? 6500 : 7000;
  return pattern.liveThreeDirections * (defending ? 1200 : 1400) + pattern.openTwos * 100;
}

/**
 * 只搜索已有棋子附近的空位，大幅减少 15×15 棋盘的无效分支。
 * 空棋盘只保留中心点。
 */
function mctsCandidateMoves(board, size, player, maxCandidates) {
  const occupied = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const color = board[mctsIndex(size, row, col)];
      if (color !== EMPTY) occupied.push({ row, col, color });
    }
  }

  const candidateSet = new Set();
  const ownNearby = new Uint8Array(size * size);
  const opponentNearby = new Uint8Array(size * size);
  if (occupied.length === 0) {
    const center = Math.floor(size / 2);
    candidateSet.add(mctsIndex(size, center, center));
  }

  for (const stone of occupied) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const row = stone.row + dr;
        const col = stone.col + dc;
        if (mctsInside(size, row, col) && board[mctsIndex(size, row, col)] === EMPTY) {
          const index = mctsIndex(size, row, col);
          candidateSet.add(index);
          if (stone.color === player) ownNearby[index]++;
          else opponentNearby[index]++;
        }
      }
    }
  }

  const center = (size - 1) / 2;
  const moves = [...candidateSet].map(index => ({
    row: Math.floor(index / size),
    col: index % size,
  }));

  // 棋形与防点优先，周围棋子数和中心距离只用于普通着法的排序。
  const scored = moves.map(move => {
    const index = mctsIndex(size, move.row, move.col);
    const centerDistance = Math.abs(move.row - center) + Math.abs(move.col - center);
    const { attack, defense } = mctsMovePatterns(board, size, move, player);
    const winning = attack.winning;
    const blocking = !winning && defense.winning;
    const tacticalScore = mctsPatternScore(attack, false) +
      (winning ? 0 : mctsPatternScore(defense, true));
    return {
      ...move,
      winning,
      blocking,
      attack,
      defense,
      score: tacticalScore + ownNearby[index] * 12 + opponentNearby[index] * 8 - centerDistance,
    };
  });

  scored.sort((a, b) => Number(b.winning) - Number(a.winning) ||
    Number(b.blocking) - Number(a.blocking) || b.score - a.score);
  return scored.slice(0, Math.max(1, maxCandidates));
}

// 只检查与刚落下的棋子同线的空位；新出现的成五点必然经过这枚棋子。
function mctsWinningRepliesNear(board, size, move, player) {
  const winning = new Set();
  for (const [dr, dc] of MCTS_SEARCH_DIRECTIONS) {
    for (let offset = -4; offset <= 4; offset++) {
      const row = move.row + dr * offset;
      const col = move.col + dc * offset;
      if (!mctsInside(size, row, col)) continue;
      const index = mctsIndex(size, row, col);
      if (board[index] === EMPTY && !winning.has(index) &&
          mctsIsWinningMove(board, size, { row, col }, player)) {
        winning.add(index);
        if (winning.size === 2) return [...winning];
      }
    }
  }
  return [...winning];
}

// 对手一步之后若有两个不同的成五点，下一回合便无法同时拦住。
function mctsMovesAvoidingDoubleThreats(board, size, moves, player, threats) {
  const opponent = mctsOpponent(player);
  return moves.filter(move => {
    const index = mctsIndex(size, move.row, move.col);
    board[index] = player;
    const ownWinningReplies = move.attack && !move.attack.winningReplies
      ? [] : mctsWinningRepliesNear(board, size, move, player);
    let safe = true;

    for (const threat of threats) {
      const threatIndex = mctsIndex(size, threat.row, threat.col);
      if (board[threatIndex] !== EMPTY) continue;
      const pattern = mctsMovePatterns(board, size, threat, opponent).attack;
      if (pattern.winning || (pattern.winningReplies >= 2 &&
          !ownWinningReplies.some(reply => reply !== threatIndex))) {
        safe = false;
        break;
      }
    }

    board[index] = EMPTY;
    return safe;
  });
}

// 每一层都收紧强制着法；双成五点的结论以对手没有立即成五为前提。
function mctsForcingMoves(moves) {
  const wins = moves.filter(move => move.winning);
  if (wins.length) return wins;
  const blocks = moves.filter(move => move.blocking);
  if (blocks.length) return blocks;
  const forks = moves.filter(move => move.attack.winningReplies >= 2);
  return forks.length ? forks : moves;
}

// 连续冲四（VCF）：攻击方每手必须产生成五点，防守方的应手因此是确定的。
// 仅返回已证实的杀棋；超时或深度耗尽都不代表“没有杀棋”。
class MCTSForcingSearch {
  constructor(size, deadline) {
    this.size = size;
    this.deadline = deadline;
    this.nodes = 0;
    this.lastYield = performance.now();
  }

  async find(board, player, depth) {
    if (performance.now() >= this.deadline) throw MCTS_FORCING_TIMEOUT;
    this.nodes++;
    if (performance.now() - this.lastYield >= 12) {
      await new Promise(resolve => setTimeout(resolve, 0));
      this.lastYield = performance.now();
      if (this.lastYield >= this.deadline) throw MCTS_FORCING_TIMEOUT;
    }
    const moves = mctsCandidateMoves(board, this.size, player, this.size * this.size);
    const win = moves.find(move => move.winning);
    if (win) return win;
    if (depth < 3) return null;
    const blocks = moves.filter(move => move.blocking);
    if (blocks.length >= 2) return null;
    // 若对方已经冲四，攻击方只能在防点上继续自己的冲四。
    const attacks = (blocks.length ? blocks : moves)
      .filter(move => move.attack.winningReplies > 0);
    const opponent = mctsOpponent(player);
    for (const move of attacks) {
      const index = mctsIndex(this.size, move.row, move.col);
      board[index] = player;
      try {
        const replies = mctsWinningRepliesNear(board, this.size, move, player);
        if (replies.length >= 2) return move;
        if (replies.length !== 1) continue;
        const reply = replies[0];
        board[reply] = opponent;
        try {
          // 强制防守也可能同时成五，必须先判定防守方获胜。
          if (mctsHasFive(board, this.size, Math.floor(reply / this.size),
            reply % this.size, opponent)) continue;
          if (await this.find(board, player, depth - 2)) return move;
        } finally {
          board[reply] = EMPTY;
        }
      } finally {
        board[index] = EMPTY;
      }
    }
    return null;
  }
}

// 模拟截断后的局面价值。候选已从当前行棋方视角分析，不再把优势局面全算平局。
function mctsPositionValue(moves, player, rootPlayer) {
  if (!moves.length) return 0.5;
  let value;
  if (moves.some(move => move.winning)) value = 1;
  else if (moves.filter(move => move.blocking).length >= 2) value = 0;
  else {
    let attack = 0;
    let defense = 0;
    for (const move of moves) {
      attack = Math.max(attack, mctsPatternScore(move.attack, false));
      defense = Math.max(defense, mctsPatternScore(move.defense, false));
    }
    // 有先手但不把未验证的棋形当作必胜。
    value = 0.5 + 0.45 * Math.tanh((attack - defense * 0.9) / 6000);
  }
  return player === rootPlayer ? value : 1 - value;
}

function mctsRandomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

class MCTSNode {
  constructor({ board, size, playerToMove, rootPlayer, parent = null, move = null, winner = EMPTY, maxCandidates }) {
    this.board = board;
    this.size = size;
    this.playerToMove = playerToMove;
    this.rootPlayer = rootPlayer;
    this.parent = parent;
    this.move = move;
    this.winner = winner;
    this.maxCandidates = maxCandidates;
    this.visits = 0;
    this.wins = 0;
    this.children = [];
    this.untriedMoves = this.isTerminal()
      ? []
      : mctsForcingMoves(mctsCandidateMoves(board, size, playerToMove, maxCandidates));
  }

  isTerminal() {
    return this.winner !== EMPTY || mctsCountEmpty(this.board) === 0;
  }
}

// ── MCTS AI ───────────────────────────────────────────
class MCTSAIPlayer extends AIPlayer {
  /**
   * @param {number} playerColor
   * @param {{strength?: string, thinkTimeMs?: number}} options
   */
  constructor(playerColor, options = {}) {
    super(playerColor);
    this.strength = options.strength || 'balanced';
    this.settings = {
      ...(AI_THINKING_LEVELS[this.strength] || AI_THINKING_LEVELS.balanced),
      ...(Number.isFinite(options.thinkTimeMs) ? { thinkTimeMs: options.thinkTimeMs } : {}),
    };
  }

  async getMove(boardState) {
    const started = performance.now();
    const deadline = started + Math.max(50, this.settings.thinkTimeMs);
    this.lastSearchStats = { iterations: 0, forcingNodes: 0, elapsedMs: 0 };
    const finish = move => {
      this.lastSearchStats.elapsedMs = performance.now() - started;
      return move ? { row: move.row, col: move.col } : null;
    };
    const size = boardState.size;
    const board = boardState.grid.flat();
    const emptyCount = mctsCountEmpty(board);
    if (emptyCount === 0) return finish(null);

    const rootMoves = mctsCandidateMoves(
      board,
      size,
      this.playerColor,
      size * size,
    );

    // 必胜或必须防守的着法直接落子，避免 MCTS 在明显战术上浪费模拟次数。
    const winningMoves = rootMoves.filter(move => move.winning);
    if (winningMoves.length > 0) return finish(winningMoves[0]);
    const opponent = mctsOpponent(this.playerColor);
    const blockingMoves = rootMoves.filter(move => move.blocking);
    if (blockingMoves.length > 0) return finish(blockingMoves[0]);

    // 先排除允许对手下一步制造两个成五点的着法。
    const fork = rootMoves.find(move => move.attack.winningReplies >= 2);
    if (fork) return finish(fork);
    if (rootMoves.length === 1) return finish(rootMoves[0]);
    let searchMoves = rootMoves;
    const doubleThreats = rootMoves.filter(move => move.defense.winningReplies >= 2);
    if (doubleThreats.length > 0) {
      const safeMoves = mctsMovesAvoidingDoubleThreats(
        board, size, rootMoves, this.playerColor, doubleThreats,
      );
      if (safeMoves.length > 0) searchMoves = safeMoves;
    }

    // 预留大部分预算给 MCTS；防守检测逐个排除已证实会被连续冲四杀死的着法。
    searchMoves = searchMoves.slice(0, this.settings.maxCandidates);
    const forcingSearch = new MCTSForcingSearch(size,
      Math.min(deadline, started + this.settings.thinkTimeMs * 0.3));
    try {
      for (let depth = 3; depth <= this.settings.forcingDepth; depth += 2) {
        const forcedWin = await forcingSearch.find(board, this.playerColor, depth);
        if (forcedWin) {
          this.lastSearchStats.forcingNodes = forcingSearch.nodes;
          return finish(forcedWin);
        }
      }
      const safe = [];
      for (let i = 0; i < searchMoves.length; i++) {
        const move = searchMoves[i];
        const index = mctsIndex(size, move.row, move.col);
        board[index] = this.playerColor;
        let losing;
        try {
          losing = await forcingSearch.find(board, opponent, this.settings.forcingDepth);
        } catch (error) {
          if (error !== MCTS_FORCING_TIMEOUT) throw error;
          // 未检查的着法仍然保留，不能把超时当成已经排除威胁。
          safe.push(...searchMoves.slice(i));
          break;
        } finally {
          board[index] = EMPTY;
        }
        if (!losing) safe.push(move);
      }
      if (safe.length) searchMoves = safe;
    } catch (error) {
      if (error !== MCTS_FORCING_TIMEOUT) throw error;
    }
    this.lastSearchStats.forcingNodes = forcingSearch.nodes;

    const root = new MCTSNode({
      board,
      size,
      playerToMove: this.playerColor,
      rootPlayer: this.playerColor,
      maxCandidates: this.settings.maxCandidates,
    });
    root.untriedMoves = searchMoves.slice();
    let lastYield = performance.now();
    let iterations = 0;

    while (performance.now() < deadline || iterations === 0) {
      let node = root;

      // Selection：沿 UCT 选择最有希望的子节点。
      while (!node.isTerminal() && !this._canExpand(node) && node.children.length > 0) {
        node = this._selectChild(node);
      }

      // Expansion：扩展一个尚未尝试的候选着法。
      if (!node.isTerminal() && node.untriedMoves.length > 0) {
        const move = node.untriedMoves.shift();
        const nextBoard = node.board.slice();
        nextBoard[mctsIndex(size, move.row, move.col)] = node.playerToMove;
        const winner = mctsHasFive(nextBoard, size, move.row, move.col, node.playerToMove)
          ? node.playerToMove
          : EMPTY;
        const child = new MCTSNode({
          board: nextBoard,
          size,
          playerToMove: mctsOpponent(node.playerToMove),
          rootPlayer: this.playerColor,
          parent: node,
          move,
          winner,
          maxCandidates: this.settings.maxCandidates,
        });
        node.children.push(child);
        node = child;
      }

      // Simulation + Backpropagation。
      const result = this._rollout(node);
      while (node) {
        node.visits++;
        node.wins += result;
        node = node.parent;
      }

      iterations++;
      // 让浏览器有机会重绘“AI 思考中”，避免长时间搜索时页面完全失去响应。
      if (performance.now() - lastYield >= 12) {
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }

    this.lastSearchStats.iterations = iterations;
    this.lastSearchStats.rootVisits = root.children.map(child => ({
      row: child.move.row, col: child.move.col, visits: child.visits,
    }));
    if (root.children.length === 0) return finish(searchMoves[0]);
    root.children.sort((a, b) => b.visits - a.visits || b.wins - a.wins);
    return finish(root.children[0].move);
  }

  _canExpand(node) {
    // 渐进扩宽：先把好棋算深，再随访问次数引入更多候选。
    return node.untriedMoves.length > 0 &&
      node.children.length < Math.max(2, Math.ceil(1.5 * Math.sqrt(node.visits + 1)));
  }

  _selectChild(node) {
    const exploration = 0.65;
    let best = null;
    let bestScore = -Infinity;
    for (const child of node.children) {
      if (child.visits === 0) return child;
      // wins 始终从 AI 视角统计；轮到对手时应偏向 AI 胜率较低的分支。
      const rootWinRate = child.wins / child.visits;
      const exploitation = node.playerToMove === this.playerColor
        ? rootWinRate
        : 1 - rootWinRate;
      const explorationBonus = exploration * Math.sqrt(Math.log(Math.max(1, node.visits)) / child.visits);
      const prior = Math.max(0, child.move.score) / (Math.abs(child.move.score) + 3000);
      const score = exploitation + explorationBonus + 0.25 * prior / (child.visits + 1);
      if (score > bestScore) {
        bestScore = score;
        best = child;
      }
    }
    return best || node.children[0];
  }

  _rollout(node) {
    if (node.winner !== EMPTY) {
      return node.winner === this.playerColor ? 1 : 0;
    }

    const board = node.board.slice();
    let player = node.playerToMove;
    for (let depth = 0; depth <= this.settings.rolloutDepth; depth++) {
      const candidates = mctsCandidateMoves(board, node.size, player, node.size * node.size);
      if (!candidates.length) return 0.5;
      if (candidates[0].winning) return player === this.playerColor ? 1 : 0;
      const blocks = candidates.filter(move => move.blocking);
      if (blocks.length >= 2) return player === this.playerColor ? 0 : 1;
      if (!blocks.length && candidates.some(move => move.attack.winningReplies >= 2)) {
        return player === this.playerColor ? 1 : 0;
      }
      if (depth === this.settings.rolloutDepth) {
        return mctsPositionValue(candidates, player, this.playerColor);
      }
      let moves = mctsForcingMoves(candidates);
      if (!blocks.length) {
        const threats = candidates.filter(move => move.defense.winningReplies >= 2);
        if (threats.length) {
          const safe = mctsMovesAvoidingDoubleThreats(board, node.size, moves, player, threats);
          if (safe.length) moves = safe;
          else return player === this.playerColor ? 0 : 1;
        }
      }
      // 棋形明显较差的着法不参与随机采样；保留少量变化避免确定性模拟偏差。
      const top = moves.filter(move => move.score >= moves[0].score * 0.75).slice(0, 3);
      const move = mctsRandomChoice(top.length ? top : [moves[0]]);
      board[mctsIndex(node.size, move.row, move.col)] = player;
      player = mctsOpponent(player);
    }
    return 0.5;
  }
}

// 注册 MCTS AI。
AIPlayerFactory.register('mcts', MCTSAIPlayer);
