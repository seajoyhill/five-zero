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

test('white blocks the two-ended vertical three instead of playing H8', async () => {
  const { Board, MCTSAIPlayer, BLACK, WHITE } = loadAI();
  const board = new Board(15);
  place(board, ['F9', 'J9', 'G10', 'H10', 'I10', 'J10', 'G11', 'H11',
    'K11', 'G12', 'I12', 'J12', 'L12'], BLACK);
  place(board, ['E8', 'K8', 'H9', 'I9', 'F10', 'K10', 'I11', 'J11',
    'H12', 'K12', 'F13', 'J13'], WHITE);

  const ai = new MCTSAIPlayer(WHITE, { thinkTimeMs: 50 });
  for (let run = 0; run < 8; run++) {
    const move = await ai.getMove(board.getState());
    const notation = String.fromCharCode(65 + move.col) + (move.row + 1);
    assert.ok(['G9', 'G13'].includes(notation), `run ${run + 1}: ${notation}`);
  }
});
