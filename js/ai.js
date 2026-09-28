/**
 * ai.js — AI 棋手接口层
 *
 * 包含通用 AI 接口、随机 AI 和 AI 工厂。
 * MCTS 实现在 mcts_ai.js 中单独维护。
 */

// ── AIPlayer（抽象基类）───────────────────────────────
class AIPlayer {
  /** @param {number} playerColor - 本方棋子颜色（BLACK | WHITE） */
  constructor(playerColor) {
    this.playerColor = playerColor;
  }

  /**
   * 根据当前棋盘状态返回落子坐标。
   * 子类可以返回同步结果或 Promise。
   */
  getMove() {
    throw new Error(
      'AIPlayer.getMove() 未实现。请继承 AIPlayer 并覆写 getMove() 方法。'
    );
  }
}

// ── RandomAIPlayer（兜底实现）──────────────────────────
class RandomAIPlayer extends AIPlayer {
  getMove(boardState) {
    const emptyCells = [];
    for (let r = 0; r < boardState.size; r++) {
      for (let c = 0; c < boardState.size; c++) {
        if (boardState.grid[r][c] === EMPTY) {
          emptyCells.push({ row: r, col: c });
        }
      }
    }
    if (emptyCells.length === 0) return null;
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
  }
}

// ── AIPlayerFactory（工厂）─────────────────────────────
const AIPlayerFactory = {
  registry: {
    random: RandomAIPlayer,
  },

  create(type, playerColor, options = {}) {
    const Cls = this.registry[type];
    if (!Cls) {
      throw new Error(
        `未知的 AI 类型: "${type}"。已注册: ${Object.keys(this.registry).join(', ')}`
      );
    }
    return new Cls(playerColor, options);
  },

  register(name, Constructor) {
    this.registry[name] = Constructor;
  },
};
