/**
 * remote_ai.js — 远程 AI（HTTP → C++ 服务）
 *
 * RemoteAIPlayer 通过 HTTP 调用 C++ AI 服务，兼容 AIPlayer 接口。
 * 当前默认请求 C++ MCTS，并把前端选择的思考时长传给服务端。
 */

class RemoteAIPlayer extends AIPlayer {
  static serverUrl = 'http://localhost:8080';

  constructor(playerColor, options = {}) {
    super(playerColor);
    this.aiType = options.aiType || 'mcts';
    this.strength = options.strength || 'balanced';
    this.settings = AI_THINKING_LEVELS[this.strength] || AI_THINKING_LEVELS.balanced;
  }

  async getMove(boardState) {
    const response = await fetch(`${RemoteAIPlayer.serverUrl}/api/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board: boardState.grid,
        size: boardState.size,
        player: this.playerColor,
        lastMove: boardState.lastMove,
        aiType: this.aiType,
        aiStrength: this.strength,
        thinkTimeMs: this.settings.thinkTimeMs,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return { row: data.row, col: data.col };
  }
}

AIPlayerFactory.register('remote', RemoteAIPlayer);
