const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadAI(overrides = {}) {
  const context = vm.createContext({ console, performance, setTimeout, Math, ...overrides });
  for (const file of ['board.js', 'ai.js', 'mcts_ai.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);
  }
  return {
    Board: vm.runInContext('Board', context),
    MCTSAIPlayer: vm.runInContext('MCTSAIPlayer', context),
    mctsCandidateMoves: vm.runInContext('mctsCandidateMoves', context),
    mctsMovePatterns: vm.runInContext('mctsMovePatterns', context),
    MCTSNode: vm.runInContext('MCTSNode', context),
    MCTSForcingSearch: vm.runInContext('MCTSForcingSearch', context),
    mctsPositionValue: vm.runInContext('mctsPositionValue', context),
    mctsIsWinningMove: vm.runInContext('mctsIsWinningMove', context),
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

function notation(move) {
  return String.fromCharCode(65 + move.col) + (move.row + 1);
}

function forcingBoard(Board, attacker, defender) {
  const board = new Board(15);
  place(board, ['J6', 'J7', 'G8', 'H8', 'I8'], attacker);
  place(board, ['F8', 'B2', 'D2', 'B4', 'D4'], defender);
  return board;
}

test('one straight three is not confused with two intersecting threes', () => {
  const { Board, mctsMovePatterns, BLACK } = loadAI();
  const board = new Board(15);
  place(board, ['F8', 'G8'], BLACK);
  const center = { row: 7, col: 7 };
  let pattern = mctsMovePatterns(board.grid.flat(), 15, center, BLACK).attack;
  assert.equal(pattern.liveThreeExtensions, 2);
  assert.equal(pattern.liveThreeDirections, 1);
  place(board, ['H6', 'H7'], BLACK);
  pattern = mctsMovePatterns(board.grid.flat(), 15, center, BLACK).attack;
  assert.equal(pattern.liveThreeDirections, 2);
});

test('immediate win takes precedence over blocking the opponent', async () => {
  const { Board, MCTSAIPlayer, BLACK, WHITE } = loadAI();
  const board = new Board(15);
  place(board, ['D8', 'E8', 'F8', 'G8'], WHITE);
  place(board, ['D5', 'E5', 'F5', 'G5'], BLACK);
  const move = await new MCTSAIPlayer(WHITE, { thinkTimeMs: 50 }).getMove(board.getState());
  assert.ok(['C8', 'H8'].includes(notation(move)));
});

test('a forced block takes precedence over creating an open four', async () => {
  const { Board, MCTSAIPlayer, BLACK, WHITE } = loadAI();
  const board = new Board(15);
  place(board, ['A1', 'B1', 'C1', 'D1'], BLACK);
  place(board, ['F8', 'G8', 'H8'], WHITE);
  const move = await new MCTSAIPlayer(WHITE, { thinkTimeMs: 50 }).getMove(board.getState());
  assert.equal(notation(move), 'E1');
});

test('takes a proven double threat even when random sampling would prefer other moves', async () => {
  const math = Object.create(Math);
  math.random = () => 0.99;
  const { Board, MCTSAIPlayer, BLACK, WHITE } = loadAI({ Math: math });
  const board = new Board(15);
  place(board, ['F8', 'G8', 'H8'], WHITE);
  place(board, ['B2', 'C3', 'D4'], BLACK);
  const ai = new MCTSAIPlayer(WHITE, { thinkTimeMs: 50 });
  const move = await ai.getMove(board.getState());
  assert.ok(['E8', 'I8'].includes(notation(move)));
  assert.equal(ai.lastSearchStats.iterations, 0);
});

test('tree nodes restrict immediate wins and mandatory defenses at every depth', () => {
  const { Board, MCTSNode, BLACK, WHITE } = loadAI();
  const board = new Board(15);
  place(board, ['A1', 'B1', 'C1', 'D1'], BLACK);
  place(board, ['F8', 'G8'], WHITE);
  for (const playerToMove of [BLACK, WHITE]) {
    const node = new MCTSNode({ board: board.grid.flat(), size: 15,
      playerToMove, rootPlayer: WHITE, maxCandidates: 64 });
    assert.equal(node.untriedMoves.length, 1);
    assert.equal(notation(node.untriedMoves[0]), 'E1');
  }
});

test('VCF finds a five-ply four-three combination and restores the board', async () => {
  const { Board, MCTSForcingSearch, BLACK, WHITE } = loadAI();
  for (const attacker of [BLACK, WHITE]) {
    const defender = attacker === BLACK ? WHITE : BLACK;
    const board = forcingBoard(Board, attacker, defender).grid.flat();
    const before = board.slice();
    const search = new MCTSForcingSearch(15, performance.now() + 2000);
    assert.equal(await search.find(board, attacker, 3), null);
    const move = await search.find(board, attacker, 5);
    assert.equal(notation(move), 'J8');
    assert.deepEqual(board, before);
  }
});

test('expert plays the VCF combination before Monte Carlo sampling', async () => {
  const { Board, MCTSAIPlayer, BLACK, WHITE } = loadAI();
  const board = forcingBoard(Board, WHITE, BLACK);
  const state = board.getState();
  const before = JSON.stringify(state);
  const ai = new MCTSAIPlayer(WHITE, { strength: 'expert', thinkTimeMs: 500 });
  assert.equal(notation(await ai.getMove(state)), 'J8');
  assert.equal(ai.lastSearchStats.iterations, 0);
  assert.ok(ai.lastSearchStats.forcingNodes > 0);
  assert.equal(JSON.stringify(state), before);
});

test('expert defends a VCF combination before the first four is played', async () => {
  const { Board, MCTSAIPlayer, MCTSForcingSearch, BLACK, WHITE } = loadAI();
  const board = forcingBoard(Board, BLACK, WHITE);
  const ai = new MCTSAIPlayer(WHITE, { strength: 'expert', thinkTimeMs: 500 });
  const move = await ai.getMove(board.getState());
  board.placeStone(move.row, move.col, WHITE);
  const search = new MCTSForcingSearch(15, performance.now() + 2000);
  assert.equal(await search.find(board.grid.flat(), BLACK, 9), null, notation(move));
});

test('VCF does not claim a win when the compulsory defense itself wins', async () => {
  const { Board, MCTSForcingSearch, BLACK, WHITE } = loadAI();
  const board = forcingBoard(Board, WHITE, BLACK);
  place(board, ['K4', 'K5', 'K6', 'K7'], BLACK);
  const flat = board.grid.flat();
  const before = flat.slice();
  assert.equal(await new MCTSForcingSearch(15, performance.now() + 2000)
    .find(flat, WHITE, 9), null);
  assert.deepEqual(flat, before);
});

test('VCF timeout unwinds speculative stones without treating it as a proof', async () => {
  let calls = 0;
  const { Board, MCTSForcingSearch, BLACK, WHITE } = loadAI({
    performance: { now: () => ++calls < 4 ? 0 : 100 },
  });
  const flat = forcingBoard(Board, WHITE, BLACK).grid.flat();
  const before = flat.slice();
  await assert.rejects(new MCTSForcingSearch(15, 50).find(flat, WHITE, 9));
  assert.deepEqual(flat, before);
});

test('truncated positions retain a directional value rather than always drawing', () => {
  const { Board, mctsCandidateMoves, mctsPositionValue, BLACK, WHITE } = loadAI();
  const board = new Board(15);
  place(board, ['F8', 'G8', 'H8'], WHITE);
  place(board, ['A1'], BLACK);
  const moves = mctsCandidateMoves(board.grid.flat(), 15, WHITE, 64);
  const value = mctsPositionValue(moves, WHITE, WHITE);
  assert.ok(value > 0.8 && value < 1);
  assert.equal(mctsPositionValue(moves, WHITE, BLACK), 1 - value);
});

test('pattern winning detection matches direct scanning at edges, gaps and overlines', () => {
  const { Board, mctsMovePatterns, mctsIsWinningMove, BLACK, WHITE } = loadAI();
  let seed = 98765;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let sample = 0; sample < 20; sample++) {
    const board = new Board(9).grid.flat();
    for (let i = 0; i < board.length; i++) {
      const value = random();
      board[i] = value < 0.3 ? BLACK : value < 0.6 ? WHITE : 0;
    }
    const before = board.slice();
    for (let i = 0; i < board.length; i++) {
      if (board[i]) continue;
      const move = { row: Math.floor(i / 9), col: i % 9 };
      for (const player of [BLACK, WHITE]) {
        assert.equal(mctsMovePatterns(board, 9, move, player).attack.winning,
          mctsIsWinningMove(board, 9, move, player));
      }
    }
    assert.deepEqual(board, before);
  }
});

test('returns the center on an empty board and null on a full board', async () => {
  const { Board, MCTSAIPlayer, BLACK } = loadAI();
  const ai = new MCTSAIPlayer(BLACK, { thinkTimeMs: 50 });
  assert.equal(notation(await ai.getMove(new Board(15).getState())), 'H8');
  assert.equal(await ai.getMove({ size: 3, grid: [[1, 2, 1], [1, 2, 2], [2, 1, 1]] }), null);
});

test('UCT treats the opponent as adversarial when backing up root-player values', () => {
  const { MCTSAIPlayer, BLACK, WHITE } = loadAI();
  const ai = new MCTSAIPlayer(WHITE);
  const betterForWhite = { visits: 10, wins: 9, move: { score: 0 } };
  const worseForWhite = { visits: 10, wins: 1, move: { score: 0 } };
  const node = { visits: 20, children: [betterForWhite, worseForWhite] };
  assert.equal(ai._selectChild({ ...node, playerToMove: WHITE }), betterForWhite);
  assert.equal(ai._selectChild({ ...node, playerToMove: BLACK }), worseForWhite);
});

test('rollouts recognize a forced loss from two distinct enemy winning points', () => {
  const { Board, MCTSAIPlayer, BLACK, WHITE } = loadAI();
  const board = new Board(15);
  place(board, ['F8', 'G8', 'H8', 'I8'], BLACK);
  const flat = board.grid.flat();
  const before = flat.slice();
  const node = { board: flat, size: 15, playerToMove: WHITE, winner: 0 };
  assert.equal(new MCTSAIPlayer(WHITE)._rollout(node), 0);
  assert.equal(new MCTSAIPlayer(BLACK)._rollout(node), 1);
  assert.deepEqual(flat, before);
});

test('winning-reply patterns distinguish a single broken four from two crossing fours', () => {
  const { Board, mctsMovePatterns, BLACK } = loadAI();
  const board = new Board(15);
  place(board, ['E8', 'F8', 'H8'], BLACK);
  let pattern = mctsMovePatterns(board.grid.flat(), 15, { row: 7, col: 8 }, BLACK).attack;
  assert.equal(pattern.winningReplies, 1); // E F . H I: only G8 wins.
  place(board, ['I4', 'I5', 'I7'], BLACK);
  pattern = mctsMovePatterns(board.grid.flat(), 15, { row: 7, col: 8 }, BLACK).attack;
  assert.equal(pattern.winningReplies, 2); // Also I6; distinct from G8.
});
