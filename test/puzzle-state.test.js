import test from 'node:test';
import assert from 'node:assert/strict';
import { PuzzlePiece } from '../src/core/PuzzlePiece.js';
import { exportPuzzleState, importPuzzleState } from '../src/core/PuzzleState.js';

function createPiece(id) {
    return new PuzzlePiece({
        id,
        row: 0,
        col: id,
        width: 100,
        height: 100,
        correctX: id * 100,
        correctY: 0,
        currentX: id * 30,
        currentY: 20,
        neighbors: {}
    });
}

test('state round trip restores positions and groups', () => {
    const original = [createPiece(0), createPiece(1)];
    original[0].joinWith(original[1]);
    const state = exportPuzzleState(original, { rows: 1, columns: 2 });

    const restored = [createPiece(0), createPiece(1)];
    restored[0].currentX = 999;
    importPuzzleState(restored, state);

    assert.equal(restored[0].currentX, original[0].currentX);
    assert.equal(restored[0].groupMembers, restored[1].groupMembers);
    assert.deepEqual(state.metadata, { rows: 1, columns: 2 });
});
