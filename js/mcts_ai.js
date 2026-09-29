/**
 * mcts_ai.js — 蒙特卡洛树搜索五子棋 AI
 *
 * 依赖：board.js 中的 EMPTY / BLACK / WHITE，以及 ai.js 中的 AIPlayer 和 AIPlayerFactory。
 */

// ── AI 思考强度 ───────────────────────────────────────
// 时间越长，MCTS 可以完成的模拟次数越多，通常棋力也越强。
const AI_THINKING_LEVELS = Object.freeze({
  easy: {
    label: '入门',
    thinkTimeMs: 250,
    maxCandidates: 28,
    rolloutDepth: 48,
  },
  balanced: {
    label: '标准',
    thinkTimeMs: 800,
    maxCandidates: 40,
    rolloutDepth: 64,
  },
  strong: {
    label: '强力',
    thinkTimeMs: 1800,
    maxCandidates: 52,
    rolloutDepth: 80,
  },
  expert: {
    label: '大师',
    thinkTimeMs: 4000,
    maxCandidates: 64,
    rolloutDepth: 96,
  },
});

// ── MCTS 内部工具 ─────────────────────────────────────
const MCTS_SEARCH_DIRECTIONS = [
  [0, 1], [1, 0], [1, 1], [1, -1],
];

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

/**
 * 只搜索已有棋子附近的空位，大幅减少 15×15 棋盘的无效分支。
 * 同时保留中心点，避免开局时搜索到边角。
 */
function mctsCandidateMoves(board, size, player, maxCandidates) {
  const occupied = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (board[mctsIndex(size, row, col)] !== EMPTY) occupied.push({ row, col });
    }
  }

  if (occupied.length === 0) {
    const center = Math.floor(size / 2);
    return [{ row: center, col: center }];
  }

  const candidateSet = new Set();
  for (const stone of occupied) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const row = stone.row + dr;
        const col = stone.col + dc;
        if (mctsInside(size, row, col) && board[mctsIndex(size, row, col)] === EMPTY) {
          candidateSet.add(mctsIndex(size, row, col));
        }
      }
    }
  }

  const center = (size - 1) / 2;
  const moves = [...candidateSet].map(index => ({
    row: Math.floor(index / size),
    col: index % size,
  }));

  // 优先级：立即获胜 > 必须拦截 > 邻近棋子多 > 靠近中心。
  const opponent = mctsOpponent(player);
  const scored = moves.map(move => {
    let nearby = 0;
    let opponentNearby = 0;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dr === 0 && dc === 0) continue;
        const row = move.row + dr;
        const col = move.col + dc;
        if (!mctsInside(size, row, col)) continue;
        const value = board[mctsIndex(size, row, col)];
        if (value === player) nearby++;
        if (value === opponent) opponentNearby++;
      }
    }
    const centerDistance = Math.abs(move.row - center) + Math.abs(move.col - center);
    const winning = mctsIsWinningMove(board, size, move, player);
    const blocking = !winning && mctsIsWinningMove(board, size, move, opponent);
    return {
      ...move,
      winning,
      blocking,
      score: (winning ? 100000 : 0) + (blocking ? 50000 : 0) +
        nearby * 12 + opponentNearby * 8 - centerDistance,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, maxCandidates));
}

function mctsImmediateMoves(board, size, moves, player) {
  return moves.filter(move => mctsIsWinningMove(board, size, move, player));
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
function mctsDoubleThreatMoves(board, size, player) {
  const moves = mctsCandidateMoves(board, size, player, size * size);
  return moves.filter(move => {
    const index = mctsIndex(size, move.row, move.col);
    board[index] = player;
    const doubleThreat = mctsWinningRepliesNear(board, size, move, player).length >= 2;
    board[index] = EMPTY;
    return doubleThreat;
  });
}

function mctsMovesAvoidingDoubleThreats(board, size, moves, player, threats) {
  const opponent = mctsOpponent(player);
  return moves.filter(move => {
    const index = mctsIndex(size, move.row, move.col);
    board[index] = player;
    const ownWinningReplies = mctsWinningRepliesNear(board, size, move, player);
    let safe = true;

    for (const threat of threats) {
      const threatIndex = mctsIndex(size, threat.row, threat.col);
      if (board[threatIndex] !== EMPTY) continue;
      board[threatIndex] = opponent;
      const opponentWon = mctsHasFive(board, size, threat.row, threat.col, opponent);
      const doubleThreat = !opponentWon &&
        mctsWinningRepliesNear(board, size, threat, opponent).length >= 2;
      board[threatIndex] = EMPTY;
      if (opponentWon || (doubleThreat &&
          !ownWinningReplies.some(reply => reply !== threatIndex))) {
        safe = false;
        break;
      }
    }

    board[index] = EMPTY;
    return safe;
  });
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
      : mctsCandidateMoves(board, size, playerToMove, maxCandidates);
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
    const size = boardState.size;
    const board = boardState.grid.flat();
    const emptyCount = mctsCountEmpty(board);
    if (emptyCount === 0) return null;

    const rootMoves = mctsCandidateMoves(
      board,
      size,
      this.playerColor,
      this.settings.maxCandidates,
    );

    // 必胜或必须防守的着法直接落子，避免 MCTS 在明显战术上浪费模拟次数。
    const winningMoves = mctsImmediateMoves(board, size, rootMoves, this.playerColor);
    if (winningMoves.length > 0) return mctsRandomChoice(winningMoves);
    const opponent = mctsOpponent(this.playerColor);
    const blockingMoves = mctsImmediateMoves(board, size, rootMoves, opponent);
    if (blockingMoves.length > 0) return mctsRandomChoice(blockingMoves);

    // 先排除允许对手下一步制造两个成五点的着法。
    let searchMoves = rootMoves;
    const doubleThreats = mctsDoubleThreatMoves(board, size, opponent);
    if (doubleThreats.length > 0) {
      let safeMoves = mctsMovesAvoidingDoubleThreats(
        board, size, rootMoves, this.playerColor, doubleThreats,
      );
      if (safeMoves.length === 0) {
        const allMoves = mctsCandidateMoves(board, size, this.playerColor, size * size);
        safeMoves = mctsMovesAvoidingDoubleThreats(
          board, size, allMoves.slice(rootMoves.length), this.playerColor, doubleThreats,
        ).slice(0, this.settings.maxCandidates);
      }
      if (safeMoves.length > 0) searchMoves = safeMoves;
    }

    const root = new MCTSNode({
      board,
      size,
      playerToMove: this.playerColor,
      rootPlayer: this.playerColor,
      maxCandidates: this.settings.maxCandidates,
    });
    root.untriedMoves = searchMoves.slice();
    const deadline = performance.now() + Math.max(50, this.settings.thinkTimeMs);
    let iterations = 0;

    while (performance.now() < deadline || iterations === 0) {
      let node = root;

      // Selection：沿 UCT 选择最有希望的子节点。
      while (!node.isTerminal() && node.untriedMoves.length === 0 && node.children.length > 0) {
        node = this._selectChild(node);
      }

      // Expansion：扩展一个尚未尝试的候选着法。
      if (!node.isTerminal() && node.untriedMoves.length > 0) {
        const moveIndex = Math.floor(Math.random() * node.untriedMoves.length);
        const move = node.untriedMoves.splice(moveIndex, 1)[0];
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
      if ((iterations & 31) === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    if (root.children.length === 0) return searchMoves[0] || null;
    root.children.sort((a, b) => b.visits - a.visits || b.wins - a.wins);
    return root.children[0].move;
  }

  _selectChild(node) {
    const exploration = Math.SQRT2;
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
      const score = exploitation + explorationBonus;
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
    for (let depth = 0; depth < this.settings.rolloutDepth; depth++) {
      const moves = mctsCandidateMoves(board, node.size, player, this.settings.maxCandidates);
      if (moves.length === 0) return 0.5;

      const winningMoves = mctsImmediateMoves(board, node.size, moves, player);
      let move;
      if (winningMoves.length > 0) {
        move = mctsRandomChoice(winningMoves);
      } else {
        const opponent = mctsOpponent(player);
        const blocks = mctsImmediateMoves(board, node.size, moves, opponent);
        if (blocks.length > 0) {
          move = mctsRandomChoice(blocks);
        } else {
          // 在评分靠前的一小批候选中随机取样，兼顾速度和多样性。
          move = mctsRandomChoice(moves.slice(0, Math.min(8, moves.length)));
        }
      }

      board[mctsIndex(node.size, move.row, move.col)] = player;
      if (mctsHasFive(board, node.size, move.row, move.col, player)) {
        return player === this.playerColor ? 1 : 0;
      }
      if (mctsCountEmpty(board) === 0) return 0.5;
      player = mctsOpponent(player);
    }

    // 截断的模拟按平局处理，避免给随机深度引入过强偏置。
    return 0.5;
  }
}

// 注册 MCTS AI。
AIPlayerFactory.register('mcts', MCTSAIPlayer);
