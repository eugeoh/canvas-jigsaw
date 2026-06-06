import test from 'node:test';
import assert from 'node:assert/strict';
import { PuzzlePiece } from '../src/core/PuzzlePiece.js';
import { SnapHandler } from '../src/core/SnapHandler.js';

function makePiece({ id, col, currentX, neighbors }) {
    return new PuzzlePiece({
        id,
        row: 0,
        col,
        width: 100,
        height: 100,
        correctX: col * 100,
        correctY: 0,
        currentX,
        currentY: 40,
        neighbors
    });
}

test('piece zero remains a valid neighbor', () => {
    const piece = makePiece({
        id: 1,
        col: 1,
        currentX: 109,
        neighbors: { left: 0 }
    });

    assert.equal(piece.getNeighbor('left'), 0);
});

test('nearby neighbors align and join one shared group', () => {
    const left = makePiece({
        id: 0,
        col: 0,
        currentX: 10,
        neighbors: { right: 1 }
    });
    const right = makePiece({
        id: 1,
        col: 1,
        currentX: 118,
        neighbors: { left: 0 }
    });
    const handler = new SnapHandler([left, right], 0.15);

    assert.equal(handler.trySnap(right), true);
    assert.equal(right.currentX, 110);
    assert.equal(left.groupMembers, right.groupMembers);
    assert.equal(handler.isComplete(), true);
});

test('pieces outside the threshold remain separate', () => {
    const left = makePiece({
        id: 0,
        col: 0,
        currentX: 10,
        neighbors: { right: 1 }
    });
    const right = makePiece({
        id: 1,
        col: 1,
        currentX: 150,
        neighbors: { left: 0 }
    });
    const handler = new SnapHandler([left, right], 0.15);

    assert.equal(handler.trySnap(right), false);
    assert.equal(left.groupMembers.length, 1);
    assert.equal(right.groupMembers.length, 1);
});
