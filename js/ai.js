/**
 * ai.js — AI 棋手接口层
 *
 * 设计思路：策略模式 + 工厂方法
 * - AIPlayer        抽象基类，定义 getMove() 接口
 * - RandomAIPlayer  随机落子（Mock 实现，供测试用）
 * - AIPlayerFactory  工厂，按名称创建 AI 实例
 *
 * 如何接入自己的算法：
 *   1. 继承 AIPlayer
 *   2. 实现 getMove(boardState) → { row, col } | Promise<{ row, col }>
 *   3. 在 AIPlayerFactory.registry 中注册
 */

// ── AIPlayer（抽象基类）───────────────────────────────
class AIPlayer {
  /**
   * @param {number} playerColor - 本方棋子颜色（BLACK | WHITE）
   */
  constructor(playerColor) {
    this.playerColor = playerColor;
  }

  /**
   * 【接口方法】根据当前棋盘状态返回落子坐标
   *
   * 子类必须覆写此方法。返回可以是同步或异步（Promise），
   * 为后续接入远程推理 / Web Worker 算法预留空间。
   *
   * @param {object} boardState - Board.getState() 的返回值
   * @param {number} boardState.size   - 棋盘大小
   * @param {number[][]} boardState.grid - 二维数组 (0=空, 1=黑, 2=白)
   * @param {object|null} boardState.lastMove - 对手的最后一步
   * @returns {{ row: number, col: number }} | Promise<{ row: number, col: number }>
   * @throws {Error} 如果未覆写
   */
  getMove(boardState) {
    throw new Error(
      'AIPlayer.getMove() 未实现。请继承 AIPlayer 并覆写 getMove() 方法。'
    );
  }
}

// ── RandomAIPlayer（Mock 实现）────────────────────────
class RandomAIPlayer extends AIPlayer {
  /**
   * 在所有空位中随机选择一个落子。
   * 仅用于测试游戏流程，不具备任何智能。
   */
  getMove(boardState) {
    const emptyCells = [];
    for (let r = 0; r < boardState.size; r++) {
      for (let c = 0; c < boardState.size; c++) {
        if (boardState.grid[r][c] === 0) {
          emptyCells.push({ row: r, col: c });
        }
      }
    }
    if (emptyCells.length === 0) return null;
    const pick = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    return { row: pick.row, col: pick.col };
  }
}

// ── AIPlayerFactory（工厂）─────────────────────────────
const AIPlayerFactory = {
  /** 已注册的 AI 类型：{ name: Constructor } */
  registry: {
    random: RandomAIPlayer,
  },

  /**
   * 创建 AI 实例
   * @param {string} type - 注册名，如 'random'
   * @param {number} playerColor - BLACK 或 WHITE
   * @returns {AIPlayer}
   *
   * 示例：
   *   const ai = AIPlayerFactory.create('random', WHITE);
   */
  create(type, playerColor) {
    const Cls = this.registry[type];
    if (!Cls) {
      throw new Error(
        `未知的 AI 类型: "${type}"。已注册: ${Object.keys(this.registry).join(', ')}`
      );
    }
    return new Cls(playerColor);
  },

  /**
   * 注册新的 AI 类型
   * @param {string} name
   * @param {typeof AIPlayer} Constructor
   *
   * 示例：
   *   AIPlayerFactory.register('minimax', MinimaxAIPlayer);
   */
  register(name, Constructor) {
    this.registry[name] = Constructor;
  },
};
