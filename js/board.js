/**
 * board.js — 棋盘数据模型与胜负判定（纯逻辑，无 DOM 依赖）
 *
 * 棋盘坐标：[row, col]，范围 [0, size-1]
 * 棋子值：  0 = 空, 1 = 黑方, 2 = 白方
 */

// ── 常量 ──────────────────────────────────────────────
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

// 四个扫描方向（偏移量）：水平 / 垂直 / 对角线 / 反对角线
const DIRECTIONS = [
  [0, 1],   // →
  [1, 0],   // ↓
  [1, 1],   // ↘
  [1, -1],  // ↙
];

// ── Board 类 ──────────────────────────────────────────
class Board {
  /**
   * @param {number} [size=15] 棋盘大小（标准五子棋为 15）
   */
  constructor(size = 15) {
    this.size = size;
    this.grid = this._createGrid(size);
    this.lastMove = null;  // { row, col, player } — 记录最后一步，便于 UI 高亮
  }

  /** 创建一个 size × size 的全零二维数组 */
  _createGrid(size) {
    return Array.from({ length: size }, () => new Array(size).fill(EMPTY));
  }

  /**
   * 落子
   * @param {number} row
   * @param {number} col
   * @param {number} player - BLACK 或 WHITE
   * @returns {boolean} 是否成功
   */
  placeStone(row, col, player) {
    if (!this.isValidMove(row, col)) return false;
    this.grid[row][col] = player;
    this.lastMove = { row, col, player };
    return true;
  }

  /**
   * 检查落子是否合法（在边界内且位置为空）
   */
  isValidMove(row, col) {
    return (
      row >= 0 && row < this.size &&
      col >= 0 && col < this.size &&
      this.grid[row][col] === EMPTY
    );
  }

  /**
   * 胜负判定 —— 以 (row, col) 为起点向四个方向扫描，数连续同色棋子数
   * @returns {boolean} 是否获胜
   */
  checkWin(row, col, player) {
    for (const [dr, dc] of DIRECTIONS) {
      let count = 1;  // 包含落子点自身

      // 正方向
      for (let i = 1; i < 5; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r >= 0 && r < this.size && c >= 0 && c < this.size && this.grid[r][c] === player) {
          count++;
        } else break;
      }

      // 反方向
      for (let i = 1; i < 5; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r >= 0 && r < this.size && c >= 0 && c < this.size && this.grid[r][c] === player) {
          count++;
        } else break;
      }

      if (count >= 5) return true;
    }
    return false;
  }

  /** 棋盘是否已满（平局） */
  isFull() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] === EMPTY) return false;
      }
    }
    return true;
  }

  /** 返回所有空位坐标列表 */
  getEmptyCells() {
    const cells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] === EMPTY) cells.push({ row: r, col: c });
      }
    }
    return cells;
  }

  /** 深拷贝当前棋盘状态（供 AI 分析使用） */
  getState() {
    return {
      size: this.size,
      grid: this.grid.map(row => [...row]),
      lastMove: this.lastMove ? { ...this.lastMove } : null,
    };
  }

  /** 重置棋盘 */
  reset() {
    this.grid = this._createGrid(this.size);
    this.lastMove = null;
  }
}
