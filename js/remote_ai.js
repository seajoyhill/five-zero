/**
 * remote_ai.js — 远程 AI（HTTP → C++ 服务）
 *
 * RemoteAIPlayer 通过 HTTP 调用 C++ AI 服务，完全兼容 AIPlayer 接口。
 *
 * 使用方式：
 *   // 1. 启动 C++ 服务：cd cpp && make setup && make && ./build/gomoku_server
 *   // 2. 在前端选择「远程 AI」模式即可
 *
 * 静态配置：
 *   RemoteAIPlayer.serverUrl = 'http://localhost:8080';  // 默认
 */

// ── RemoteAIPlayer ────────────────────────────────────
class RemoteAIPlayer extends AIPlayer {
  /** @static 后端服务地址，可按需修改 */
  static serverUrl = 'http://localhost:8080';

  /**
   * @param {number} playerColor - BLACK 或 WHITE
   */
  constructor(playerColor) {
    super(playerColor);
  }

  /**
   * 调用远程 C++ AI 服务获取落子
   *
   * POST /api/move
   * Body: { board: number[][], size: number, player: number, lastMove: {row,col}|null }
   * Response: { row: number, col: number } | { error: string }
   */
  async getMove(boardState) {
    const response = await fetch(`${RemoteAIPlayer.serverUrl}/api/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board: boardState.grid,
        size: boardState.size,
        player: this.playerColor,
        lastMove: boardState.lastMove,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    return { row: data.row, col: data.col };
  }
}

// ── 注册到工厂 ────────────────────────────────────────
AIPlayerFactory.register('remote', RemoteAIPlayer);
