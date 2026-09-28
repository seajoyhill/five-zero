/**
 * main.js — UI 层
 *
 * 负责 Canvas 渲染、鼠标交互、与控制层的连接。
 * 所有 DOM 操作集中在此文件。
 */

// ── DOM 引用 ──────────────────────────────────────────
const canvas = document.getElementById('board-canvas');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('game-status');
const modeEl = document.getElementById('mode-indicator');
const aiTypeEl = document.getElementById('ai-type-indicator');
const btnNewGame = document.getElementById('btn-new-game');
const btnSwitchMode = document.getElementById('btn-switch-mode');
const btnSwitchAI = document.getElementById('btn-switch-ai');
const aiStrengthSelect = document.getElementById('ai-strength-select');
const strengthControl = aiStrengthSelect.closest('.strength-control');

// ── 配置 ──────────────────────────────────────────────
const BOARD_SIZE = 15;
const PADDING = 30;         // 棋盘边距（像素）
const STAR_POINTS = [       // 星位坐标（标准 15×15）
  [3, 3], [3, 7], [3, 11],
  [7, 3], [7, 7], [7, 11],
  [11, 3], [11, 7], [11, 11],
];
const STONE_RADIUS_RATIO = 0.43;  // 棋子半径占格子宽度的比例

// ── 运行时状态 ────────────────────────────────────────
const game = new Game(BOARD_SIZE);
let cellSize = 0;       // 每格像素（根据 canvas 大小计算）
let hoverPos = null;    // 鼠标悬停的 {row, col}，用于预览

// ── 初始化 ────────────────────────────────────────────
function init() {
  resizeCanvas();
  bindEvents();
  game.onMove = (row, col, player) => {
    drawBoard();
    updateStatus();
  };
  game.onGameOver = (status) => {
    drawBoard();
    updateStatus();
  };
  game.onTurnChange = () => {
    updateStatus();
  };
  game.onAIFallback = () => {
    updateAITypeLabel();  // 更新显示，标注已降级
  };

  const savedStrength = localStorage.getItem('gomoku-ai-strength');
  if (AI_THINKING_LEVELS[savedStrength]) aiStrengthSelect.value = savedStrength;
  game.startGame(GameMode.PVE, 'mcts', aiStrengthSelect.value);
  updateModeLabel();
  updateAITypeLabel();
  drawBoard();
  updateStatus();
}

// ── Canvas 尺寸自适应 ─────────────────────────────────
function resizeCanvas() {
  const container = canvas.parentElement;
  const size = Math.min(container.clientWidth, 600);
  canvas.width = size;
  canvas.height = size;
  cellSize = (size - PADDING * 2) / (BOARD_SIZE - 1);
}

// ── 事件绑定 ──────────────────────────────────────────
function bindEvents() {
  window.addEventListener('resize', () => {
    resizeCanvas();
    drawBoard();
  });

  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('mousemove', handleCanvasHover);
  canvas.addEventListener('mouseleave', () => {
    hoverPos = null;
    drawBoard();
  });

  btnNewGame.addEventListener('click', () => {
    game.startGame(game.mode, game.aiType, aiStrengthSelect.value);
    hoverPos = null;
    updateModeLabel();
    updateAITypeLabel();
    drawBoard();
    updateStatus();
  });

  btnSwitchMode.addEventListener('click', () => {
    const newMode = game.mode === GameMode.PVE ? GameMode.PVP : GameMode.PVE;
    game.startGame(newMode, game.aiType, aiStrengthSelect.value);
    hoverPos = null;
    updateModeLabel();
    updateAITypeLabel();
    drawBoard();
    updateStatus();
  });

  btnSwitchAI.addEventListener('click', () => {
    if (game.mode !== GameMode.PVE) return;
    const types = ['mcts', 'random', 'remote'];
    const idx = types.indexOf(game.aiType);
    const nextType = types[(idx + 1) % types.length];
    game.startGame(GameMode.PVE, nextType, aiStrengthSelect.value);
    hoverPos = null;
    updateModeLabel();
    updateAITypeLabel();
    drawBoard();
    updateStatus();
  });

  aiStrengthSelect.addEventListener('change', () => {
    localStorage.setItem('gomoku-ai-strength', aiStrengthSelect.value);
    if (game.mode !== GameMode.PVE) return;
    game.startGame(GameMode.PVE, game.aiType, aiStrengthSelect.value);
    hoverPos = null;
    updateAITypeLabel();
    drawBoard();
    updateStatus();
  });
}

// ── 鼠标 → 棋盘坐标转换 ───────────────────────────────
function pixelToBoard(px, py) {
  const col = Math.round((px - PADDING) / cellSize);
  const row = Math.round((py - PADDING) / cellSize);
  // 检查是否在有效距离内
  const cx = PADDING + col * cellSize;
  const cy = PADDING + row * cellSize;
  const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  if (dist > cellSize * 0.45) return null;
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
  return { row, col };
}

function handleCanvasClick(e) {
  if (game.status !== GameStatus.PLAYING) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;
  const pos = pixelToBoard(px, py);
  if (!pos) return;
  game.makeMove(pos.row, pos.col);
  drawBoard();
  updateStatus();
}

function handleCanvasHover(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;
  const pos = pixelToBoard(px, py);
  if (!pos || game.board.grid[pos.row][pos.col] !== EMPTY) {
    if (hoverPos !== null) { hoverPos = null; drawBoard(); }
    return;
  }
  if (!hoverPos || hoverPos.row !== pos.row || hoverPos.col !== pos.col) {
    hoverPos = pos;
    drawBoard();
  }
}

// ── 棋盘绘制 ──────────────────────────────────────────
function drawBoard() {
  const w = canvas.width;
  const h = canvas.height;

  // 背景（木色）
  ctx.fillStyle = '#DEB887';
  ctx.fillRect(0, 0, w, h);

  // 网格线
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const pos = PADDING + i * cellSize;
    // 横线
    ctx.beginPath();
    ctx.moveTo(PADDING, pos);
    ctx.lineTo(PADDING + (BOARD_SIZE - 1) * cellSize, pos);
    ctx.stroke();
    // 竖线
    ctx.beginPath();
    ctx.moveTo(pos, PADDING);
    ctx.lineTo(pos, PADDING + (BOARD_SIZE - 1) * cellSize);
    ctx.stroke();
  }

  // 星位
  for (const [r, c] of STAR_POINTS) {
    const cx = PADDING + c * cellSize;
    const cy = PADDING + r * cellSize;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // 坐标标签
  ctx.fillStyle = '#555';
  ctx.font = `${Math.max(10, cellSize * 0.35)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < BOARD_SIZE; i++) {
    // 列标（字母）
    const letter = String.fromCharCode(65 + i);  // A-O
    ctx.fillText(letter, PADDING + i * cellSize, PADDING - 18);
    // 行标（数字）
    ctx.fillText(String(i + 1), PADDING - 20, PADDING + i * cellSize);
  }

  // 棋子
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (game.board.grid[r][c] !== EMPTY) {
        drawStone(r, c, game.board.grid[r][c]);
      }
    }
  }

  // 最后落子标记
  if (game.board.lastMove) {
    const { row, col } = game.board.lastMove;
    const cx = PADDING + col * cellSize;
    const cy = PADDING + row * cellSize;
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize * 0.18, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 悬停预览
  if (hoverPos && game.board.grid[hoverPos.row][hoverPos.col] === EMPTY) {
    const cx = PADDING + hoverPos.col * cellSize;
    const cy = PADDING + hoverPos.row * cellSize;
    const r = cellSize * STONE_RADIUS_RATIO;
    ctx.globalAlpha = 0.4;
    if (game.currentPlayer === BLACK) {
      drawBlackStone(cx, cy, r);
    } else {
      drawWhiteStone(cx, cy, r);
    }
    ctx.globalAlpha = 1;
  }
}

/** 绘制一颗棋子 */
function drawStone(row, col, player) {
  const cx = PADDING + col * cellSize;
  const cy = PADDING + row * cellSize;
  const r = cellSize * STONE_RADIUS_RATIO;

  // 阴影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = cellSize * 0.15;
  ctx.shadowOffsetX = cellSize * 0.06;
  ctx.shadowOffsetY = cellSize * 0.06;

  if (player === BLACK) {
    drawBlackStone(cx, cy, r);
  } else {
    drawWhiteStone(cx, cy, r);
  }
  ctx.restore();
}

/** 绘制黑子（带光泽效果） */
function drawBlackStone(cx, cy, r) {
  // 主体
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#555');
  grad.addColorStop(1, '#000');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** 绘制白子（带光泽效果） */
function drawWhiteStone(cx, cy, r) {
  // 主体
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#FFF');
  grad.addColorStop(1, '#CCC');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // 边框
  ctx.strokeStyle = '#AAA';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// ── 状态文字 ──────────────────────────────────────────
function updateStatus() {
  switch (game.status) {
    case GameStatus.WAITING:
      statusEl.textContent = '点击「新游戏」开始';
      statusEl.className = '';
      break;
    case GameStatus.PLAYING:
      if (game.aiPlayer && game.currentPlayer === game.aiPlayer.playerColor) {
        statusEl.textContent = 'AI 思考中…';
        statusEl.className = 'turn-white';
      } else {
        statusEl.textContent = `轮到 ${game.getCurrentPlayerText()}`;
        statusEl.className = game.currentPlayer === BLACK ? 'turn-black' : 'turn-white';
      }
      break;
    case GameStatus.BLACK_WIN:
      statusEl.textContent = '黑方获胜！ 🎉';
      statusEl.className = 'game-over';
      break;
    case GameStatus.WHITE_WIN:
      statusEl.textContent = '白方获胜！ 🎉';
      statusEl.className = 'game-over';
      break;
    case GameStatus.DRAW:
      statusEl.textContent = '平局！';
      statusEl.className = 'game-over';
      break;
  }
}

function updateModeLabel() {
  modeEl.textContent = game.mode === GameMode.PVE ? '人机对战' : '双人对战';
}

function updateAITypeLabel() {
  if (game.mode !== GameMode.PVE) {
    aiTypeEl.textContent = '';
    btnSwitchAI.style.display = 'none';
    strengthControl.style.display = 'none';
    return;
  }
  btnSwitchAI.style.display = '';
  strengthControl.style.display = '';
  const level = AI_THINKING_LEVELS[game.aiStrength] || AI_THINKING_LEVELS.balanced;
  aiStrengthSelect.value = game.aiStrength;
  aiStrengthSelect.disabled = game.aiType === 'random';
  const labels = {
    mcts: `本地 MCTS · ${level.label}`,
    random: '本地随机',
    remote: `远程 C++ MCTS · ${level.label}`,
  };
  aiTypeEl.textContent = labels[game.aiType] || game.aiType;
  if (game.aiType === 'remote') {
    aiTypeEl.title = `服务地址: ${RemoteAIPlayer.serverUrl}`;
  } else {
    aiTypeEl.title = game.aiType === 'mcts'
      ? `搜索时长约 ${level.thinkTimeMs / 1000} 秒`
      : '';
  }
}

// ── 启动 ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
