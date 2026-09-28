/**
 * tic_tac_toe.js — 井字棋游戏
 *
 * 独立于五子棋的数据与控制逻辑，支持双人对战和人机对战。
 * 人机使用 Minimax，AI 会优先取胜、阻止对手，并在最优情况下保持不败。
 */

const TTGameStatus = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  X_WIN: 'x_win',
  O_WIN: 'o_win',
  DRAW: 'draw',
};

const TTGameMode = {
  PVP: 'pvp',
  PVE: 'pve',
};

const TT_WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

class TicTacToeGame {
  constructor() {
    this.board = Array(9).fill(null);
    this.currentPlayer = 'X';
    this.status = TTGameStatus.WAITING;
    this.mode = TTGameMode.PVE;
    this.aiPlayer = 'O';
    this.moveHistory = [];
    this.roundId = 0;

    this.onMove = null;
    this.onGameOver = null;
    this.onTurnChange = null;
  }

  startGame(mode = TTGameMode.PVE) {
    this.roundId += 1;
    this.board = Array(9).fill(null);
    this.currentPlayer = 'X';
    this.status = TTGameStatus.PLAYING;
    this.mode = mode;
    this.moveHistory = [];

    if (this.onTurnChange) this.onTurnChange(this.currentPlayer);
  }

  makeMove(index) {
    if (this.status !== TTGameStatus.PLAYING) {
      return { success: false, reason: '对局已结束' };
    }
    if (this.mode === TTGameMode.PVE && this.currentPlayer === this.aiPlayer) {
      return { success: false, reason: '等待 AI 落子' };
    }
    return this._executeMove(index);
  }

  _executeMove(index) {
    if (!Number.isInteger(index) || index < 0 || index >= 9 || this.board[index]) {
      return { success: false, reason: '无效落子位置' };
    }

    const player = this.currentPlayer;
    this.board[index] = player;
    this.moveHistory.push({ index, player });
    if (this.onMove) this.onMove(index, player);

    const winner = this.getWinner(this.board);
    if (winner) {
      this.status = winner === 'X' ? TTGameStatus.X_WIN : TTGameStatus.O_WIN;
      if (this.onGameOver) this.onGameOver(this.status, winner);
      return { success: true, gameOver: true };
    }

    if (this.board.every(Boolean)) {
      this.status = TTGameStatus.DRAW;
      if (this.onGameOver) this.onGameOver(this.status, null);
      return { success: true, gameOver: true };
    }

    this.currentPlayer = player === 'X' ? 'O' : 'X';
    if (this.onTurnChange) this.onTurnChange(this.currentPlayer);

    if (this.mode === TTGameMode.PVE && this.currentPlayer === this.aiPlayer) {
      this._triggerAI();
    }
    return { success: true, gameOver: false };
  }

  _triggerAI() {
    const roundId = this.roundId;
    const thinkingStartedAt = performance.now();
    const move = this.getBestMove();
    const thinkingTime = performance.now() - thinkingStartedAt;
    console.log(
      `[井字棋 AI] 思考耗时: ${thinkingTime.toFixed(2)} ms，选择位置: ${move + 1}`
    );
    setTimeout(() => {
      if (roundId === this.roundId && this.status === TTGameStatus.PLAYING) {
        this._executeMove(move);
      }
    }, 260);
  }

  /** 返回获胜方，没有胜者时返回 null。 */
  getWinner(board = this.board) {
    for (const [a, b, c] of TT_WIN_LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  }

  /** 返回当前棋盘上的胜利连线，用于 UI 高亮。 */
  getWinningLine(board = this.board) {
    for (const line of TT_WIN_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return line;
      }
    }
    return [];
  }

  /** Minimax：O 为最大化方，X 为最小化方。 */
  getBestMove() {
    let bestScore = -Infinity;
    let bestMoves = [];

    for (const index of this.getAvailableMoves(this.board)) {
      this.board[index] = this.aiPlayer;
      const score = this.minimax(this.board, false, 0);
      this.board[index] = null;

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [index];
      } else if (score === bestScore) {
        bestMoves.push(index);
      }
    }

    // 同分时随机选择，避免每局 AI 都完全按同一条路线走。
    return bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? -1;
  }

  minimax(board, maximizing, depth) {
    const winner = this.getWinner(board);
    if (winner === this.aiPlayer) return 10 - depth;
    if (winner) return depth - 10;
    // 如果棋盘上的 9 个位置都已经有棋子，并且前面没有判断出任何一方获胜，那么当前局面就是平局，返回分数 0
    if (board.every(Boolean)) return 0;

    const scores = this.getAvailableMoves(board).map(index => {
      board[index] = maximizing ? this.aiPlayer : 'X';
      const score = this.minimax(board, !maximizing, depth + 1);
      board[index] = null;
      return score;
    });

    return maximizing ? Math.max(...scores) : Math.min(...scores);
  }

  getAvailableMoves(board = this.board) {
    return board.reduce((moves, value, index) => {
      if (!value) moves.push(index);
      return moves;
    }, []);
  }
}

function initTicTacToe() {
  const game = new TicTacToeGame();
  const boardEl = document.getElementById('ttt-board');
  const statusEl = document.getElementById('ttt-status');
  const modeEl = document.getElementById('ttt-mode-indicator');
  const newGameBtn = document.getElementById('ttt-new-game');
  const switchModeBtn = document.getElementById('ttt-switch-mode');
  const gomokuView = document.getElementById('gomoku-view');
  const tttView = document.getElementById('tictactoe-view');
  const gomokuTab = document.getElementById('btn-game-gomoku');
  const tttTab = document.getElementById('btn-game-tictactoe');
  const titleEl = document.getElementById('app-title');
  const subtitleEl = document.getElementById('app-subtitle');

  const cells = Array.from({ length: 9 }, (_, index) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'ttt-cell';
    cell.dataset.index = String(index);
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `第 ${index + 1} 格，空`);
    cell.addEventListener('click', () => {
      game.makeMove(index);
      render();
    });
    boardEl.appendChild(cell);
    return cell;
  });

  function render() {
    const winningLine = game.getWinningLine();
    cells.forEach((cell, index) => {
      const value = game.board[index];
      cell.textContent = value || '';
      cell.className = `ttt-cell${value ? ` mark-${value.toLowerCase()}` : ''}${winningLine.includes(index) ? ' winning' : ''}`;
      cell.disabled = game.status !== TTGameStatus.PLAYING || Boolean(value) ||
        (game.mode === TTGameMode.PVE && game.currentPlayer === game.aiPlayer);
      cell.setAttribute('aria-label', `第 ${index + 1} 格，${value || '空'}`);
    });
    updateStatus();
  }

  function updateStatus() {
    switch (game.status) {
      case TTGameStatus.WAITING:
        statusEl.textContent = '点击「新游戏」开始';
        statusEl.className = 'status-text';
        break;
      case TTGameStatus.PLAYING:
        statusEl.textContent = game.mode === TTGameMode.PVE && game.currentPlayer === game.aiPlayer
          ? 'AI 思考中…'
          : `轮到 ${game.currentPlayer}`;
        statusEl.className = `status-text ${game.currentPlayer === 'X' ? 'turn-x' : 'turn-o'}`;
        break;
      case TTGameStatus.X_WIN:
        statusEl.textContent = 'X 获胜！ 🎉';
        statusEl.className = 'status-text game-over';
        break;
      case TTGameStatus.O_WIN:
        statusEl.textContent = 'O 获胜！ 🎉';
        statusEl.className = 'status-text game-over';
        break;
      case TTGameStatus.DRAW:
        statusEl.textContent = '平局！';
        statusEl.className = 'status-text game-over';
        break;
    }
  }

  function updateModeLabel() {
    modeEl.textContent = game.mode === TTGameMode.PVE ? '人机对战' : '双人对战';
  }

  function startCurrentGame() {
    game.startGame(game.mode);
    updateModeLabel();
    render();
  }

  function selectGame(name) {
    const isTicTacToe = name === 'tictactoe';
    gomokuView.classList.toggle('hidden', isTicTacToe);
    tttView.classList.toggle('hidden', !isTicTacToe);
    tttView.setAttribute('aria-hidden', String(!isTicTacToe));
    gomokuTab.classList.toggle('active', !isTicTacToe);
    tttTab.classList.toggle('active', isTicTacToe);
    titleEl.textContent = isTicTacToe ? '井字棋' : '五子棋';
    subtitleEl.textContent = isTicTacToe ? 'Tic-Tac-Toe' : 'Gomoku';
  }

  gomokuTab.addEventListener('click', () => selectGame('gomoku'));
  tttTab.addEventListener('click', () => selectGame('tictactoe'));
  newGameBtn.addEventListener('click', startCurrentGame);
  switchModeBtn.addEventListener('click', () => {
    game.startGame(game.mode === TTGameMode.PVE ? TTGameMode.PVP : TTGameMode.PVE);
    updateModeLabel();
    render();
  });

  game.onMove = render;
  game.onGameOver = render;
  game.onTurnChange = render;
  game.startGame(TTGameMode.PVE);
  updateModeLabel();
  render();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initTicTacToe);
}

if (typeof module !== 'undefined') module.exports = { TicTacToeGame, TTGameStatus, TTGameMode };
