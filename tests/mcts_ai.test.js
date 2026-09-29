const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadAI() {
  const context = vm.createContext({ console, performance, setTimeout, Math });
  for (const file of ['board.js', 'ai.js', 'mcts_ai.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
  }
  return {
    Board: vm.runInContext('Board', context),
    MCTSAIPlayer: vm.runInContext('MCTSAIPlayer', context),
    mctsCandidateMoves: vm.runInContext('mctsCandidateMoves', context),
    mctsMovePatterns: vm.runInContext('mctsMovePatterns', context),
    BLACK: vm.runInContext('BLACK', context),
    WHITE: vm.runInContext('WHITE', context),
  };
}

function place(board, positions, player) {
  for (const position of positions) {
    const col = position.charCodeAt(0) - 65;
    const row = Number(position.slice(1)) - 1;
    assert.equal(board.placeStone(row, col, player), true);
  }
}

function screenshotBoard(Board, BLACK, WHITE) {
  const board = new Board(15);
  place(board, ['F9', 'J9', 'G10', 'H10', 'I10', 'J10', 'G11', 'H11',
    'K11', 'G12', 'I12', 'J12', 'L12'], BLACK);
  place(board, ['E8', 'K8', 'H9', 'I9', 'F10', 'K10', 'I11', 'J11',
    'H12', 'K12', 'F13', 'J13'], WHITE);
  return board;
}

test('pattern scoring recognizes three and four threats in all four directions', () => {
  const { Board, mctsMovePatterns, BLACK, WHITE } = loadAI();
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const board = new Board(15);
    for (const offset of [-2, -1]) {
      board.placeStone(7 + dr * offset, 7 + dc * offset, BLACK);
    }
    const center = { row: 7, col: 7 };
    assert.equal(mctsMovePatterns(board.grid.flat(), 15, center, BLACK)
      .attack.liveThreeExtensions, 2);
    board.placeStone(center.row, center.col, BLACK);
    const fourth = { row: 7 + dr, col: 7 + dc };
    assert.equal(mctsMovePatterns(board.grid.flat(), 15, fourth, BLACK)
      .attack.winningReplies, 2);
    assert.equal(mctsMovePatterns(board.grid.flat(), 15, fourth, WHITE)
      .defense.winningReplies, 2);
    board.placeStone(7 - dr * 3, 7 - dc * 3, WHITE);
    assert.equal(mctsMovePatterns(board.grid.flat(), 15, fourth, BLACK)
      .attack.winningReplies, 1);
    board.placeStone(fourth.row, fourth.col, BLACK);
    const fifth = { row: 7 + dr * 2, col: 7 + dc * 2 };
    assert.equal(mctsMovePatterns(board.grid.flat(), 15, fifth, BLACK)
      .attack.winning, true);
    assert.equal(mctsMovePatterns(board.grid.flat(), 15, fifth, WHITE)
      .defense.winning, true);
  }
});

test('pattern scoring recognizes a broken three', () => {
  const { Board, mctsMovePatterns, BLACK } = loadAI();
  const board = new Board(15);
  place(board, ['H8', 'J8'], BLACK);
  assert.equal(mctsMovePatterns(board.grid.flat(), 15, { row: 7, col: 10 }, BLACK)
    .attack.liveThreeExtensions, 1);
});

test('the screenshot defense points rank ahead of H8', () => {
  const { Board, mctsCandidateMoves, BLACK, WHITE } = loadAI();
  const board = screenshotBoard(Board, BLACK, WHITE);
  const moves = mctsCandidateMoves(board.grid.flat(), 15, WHITE, 40);
  const rank = notation => moves.findIndex(move =>
    String.fromCharCode(65 + move.col) + (move.row + 1) === notation);
  assert.ok(rank('G9') < rank('H8'));
  assert.ok(rank('G13') < rank('H8'));
});

test('white blocks the two-ended vertical three instead of playing H8', async () => {
  const { Board, MCTSAIPlayer, BLACK, WHITE } = loadAI();
  const board = screenshotBoard(Board, BLACK, WHITE);

  const ai = new MCTSAIPlayer(WHITE, { thinkTimeMs: 50 });
  for (let run = 0; run < 8; run++) {
    const move = await ai.getMove(board.getState());
    const notation = String.fromCharCode(65 + move.col) + (move.row + 1);
    assert.ok(['G9', 'G13'].includes(notation), `run ${run + 1}: ${notation}`);
  }
});
