import test from 'node:test';
import assert from 'node:assert/strict';
import { BezierUtils } from '../src/core/BezierUtils.js';

test('seeded random values are repeatable', () => {
    const first = BezierUtils.createRNG(12345);
    const second = BezierUtils.createRNG(12345);

    assert.deepEqual(
        Array.from({ length: 8 }, () => first()),
        Array.from({ length: 8 }, () => second())
    );
});

test('grid corners stay fixed while interior points are jittered', () => {
    const rng = BezierUtils.createRNG(42);
    const points = BezierUtils.generateGridPoints(2, 2, 100, 80, 10, 20, rng, 0.03);

    assert.deepEqual(points[0][0], { x: 10, y: 20 });
    assert.deepEqual(points[2][2], { x: 210, y: 180 });
    assert.notDeepEqual(points[1][1], { x: 110, y: 100 });
});

test('the same seed produces identical seam commands', () => {
    const makeSeam = () => {
        const rng = BezierUtils.createRNG(99);
        return BezierUtils.generateSeam(
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            false,
            true,
            1,
            rng,
            100
        );
    };

    assert.deepEqual(makeSeam(), makeSeam());
});
