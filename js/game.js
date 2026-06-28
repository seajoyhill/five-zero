/**
 * game.js — 游戏控制器
 *
 * 管理对局生命周期：回合切换、落子校验、胜负/平局判定、AI 调度。
 * 与任何 UI 无关，通过事件回调通知上层。
 */

// ── 游戏状态枚举 ──────────────────────────────────────
const GameStatus = {
  WAITING:   'waiting',   // 未开始
  PLAYING:   'playing',   // 对局中
  BLACK_WIN: 'black_win',
  WHITE_WIN: 'white_win',
  DRAW:      'draw',
};

// ── 模式 ──────────────────────────────────────────────
const GameMode = {
  PVP: 'pvp',  // 双人对战
  PVE: 'pve',  // 人机对战（玩家执黑先行）
};

// ── Game 类 ───────────────────────────────────────────
class Game {
  constructor(boardSize = 15) {
    this.board = new Board(boardSize);
    this.currentPlayer = BLACK;        // 黑先
    this.status = GameStatus.WAITING;
    this.mode = GameMode.PVE;
    this.aiType = 'random';            // AI 类型: 'random' | 'remote'
    this.aiPlayer = null;              // AI 实例（PVE 模式）
    this.moveHistory = [];             // 落子历史 [{row, col, player}, ...]

    // 回调（由 UI 层注册）
    this.onMove = null;       // (row, col, player) => void
    this.onGameOver = null;   // (status) => void
    this.onTurnChange = null; // (player) => void
    this.onAIFallback = null; // () => void — 远程 AI 降级通知
  }

  /**
   * 开始新对局
   * @param {string} mode - GameMode.PVP | GameMode.PVE
   * @param {string} [aiType='random'] - AI 类型: 'random' | 'remote'
   */
  startGame(mode = GameMode.PVE, aiType = 'random') {
    this.board.reset();
    this.currentPlayer = BLACK;
    this.status = GameStatus.PLAYING;
    this.mode = mode;
    this.aiType = aiType;
    this.moveHistory = [];

    // 人机模式：创建 AI（执白）
    if (mode === GameMode.PVE) {
      this.aiPlayer = AIPlayerFactory.create(aiType, WHITE);
    } else {
      this.aiPlayer = null;
    }

    if (this.onTurnChange) this.onTurnChange(this.currentPlayer);

    // 如果 AI 先手（不太常见，但保持灵活性）
    if (this.aiPlayer && this.currentPlayer === this.aiPlayer.playerColor) {
      this._triggerAI();
    }
  }

  /**
   * 玩家落子入口
   * @returns {{ success: boolean, reason?: string }}
   */
  makeMove(row, col) {
    if (this.status !== GameStatus.PLAYING) {
      return { success: false, reason: '对局已结束' };
    }

    // 人机模式：轮到 AI 时忽略玩家点击
    if (this.aiPlayer && this.currentPlayer === this.aiPlayer.playerColor) {
      return { success: false, reason: '等待 AI 落子' };
    }

    return this._executeMove(row, col);
  }

  /**
   * 内部执行落子逻辑
   */
  _executeMove(row, col) {
    const player = this.currentPlayer;

    if (!this.board.placeStone(row, col, player)) {
      return { success: false, reason: '无效落子位置' };
    }

    this.moveHistory.push({ row, col, player });
    if (this.onMove) this.onMove(row, col, player);

    // 胜负判定
    if (this.board.checkWin(row, col, player)) {
      this.status = player === BLACK ? GameStatus.BLACK_WIN : GameStatus.WHITE_WIN;
      if (this.onGameOver) this.onGameOver(this.status);
      return { success: true, gameOver: true };
    }

    // 平局判定
    if (this.board.isFull()) {
      this.status = GameStatus.DRAW;
      if (this.onGameOver) this.onGameOver(this.status);
      return { success: true, gameOver: true };
    }

    // 切换回合
    this._switchTurn();

    // 触发 AI
    if (this.aiPlayer && this.currentPlayer === this.aiPlayer.playerColor) {
      this._triggerAI();
    }

    return { success: true, gameOver: false };
  }

  /** 切换回合 */
  _switchTurn() {
    this.currentPlayer = this.currentPlayer === BLACK ? WHITE : BLACK;
    if (this.onTurnChange) this.onTurnChange(this.currentPlayer);
  }

  /** 请求 AI 落子（含远程 AI 降级逻辑） */
  async _triggerAI() {
    const boardState = this.board.getState();

    try {
      const move = await this.aiPlayer.getMove(boardState);
      if (move && this.status === GameStatus.PLAYING) {
        this._scheduleMove(move.row, move.col);
      }
    } catch (err) {
      console.warn('AI 调用失败:', err.message);

      // 远程 AI 不可用 → 自动降级到本地随机 AI
      if (this.aiType === 'remote') {
        console.warn('降级到本地随机 AI');
        const fallback = new RandomAIPlayer(this.aiPlayer.playerColor);
        const move = fallback.getMove(boardState);
        if (move && this.status === GameStatus.PLAYING) {
          this._scheduleMove(move.row, move.col);
        }
        if (this.onAIFallback) this.onAIFallback();
      }
    }
  }

  /** 延迟执行 AI 落子，让 UI 更自然 */
  _scheduleMove(row, col) {
    setTimeout(() => {
      if (this.status === GameStatus.PLAYING) {
        this._executeMove(row, col);
      }
    }, 300);
  }

  /** 重置到待开始状态 */
  reset() {
    this.board.reset();
    this.currentPlayer = BLACK;
    this.status = GameStatus.WAITING;
    this.aiPlayer = null;
    this.moveHistory = [];
  }

  /** 获取当前玩家文本 */
  getCurrentPlayerText() {
    return this.currentPlayer === BLACK ? '黑方' : '白方';
  }
}
