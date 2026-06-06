/**
 * PuzzleGenerator Class - Seam-First Topology
 *
 * =======================================================================
 * WHY SEAM-FIRST GENERATION CREATES MORE NATURAL PUZZLE PIECES
 * =======================================================================
 *
 * Traditional (rectangle-first) approach:
 *   1. Each piece starts as a perfect rectangle
 *   2. Tabs/slots are bolted onto each straight edge independently
 *   3. Every piece looks like a rectangle with bumps - the grid is obvious
 *
 * Seam-first approach (what this class implements):
 *   1. Grid intersection points are JITTERED randomly so corners don't align
 *   2. Shared seam curves are generated between adjacent intersections
 *   3. Tabs/blanks are inserted at varied positions along those curves
 *   4. Each piece is the closed region bounded by its 4 surrounding seams
 *   5. Result: organic, irregular outlines with no visible grid
 *
 * The key insight: because neighboring pieces share the SAME seam object
 * (one traverses it forward, the other reversed), they automatically
 * interlock perfectly. No alignment hacks needed.
 *
 * Generation flow:
 *   1. Seed a deterministic PRNG from puzzle parameters
 *   2. Generate jittered grid points (interior: XY jitter, border: along-edge only)
 *   3. Build horizontal seam network: hSeams[r][c] connects grid[r][c] -> grid[r][c+1]
 *   4. Build vertical seam network:   vSeams[r][c] connects grid[r][c] -> grid[r+1][c]
 *   5. For each cell (r,c), assemble a closed Path2D from its 4 surrounding seams
 *   6. Piece anchor = un-jittered grid corner, so image clipping math stays unchanged
 * =======================================================================
 */

import { BezierUtils } from './BezierUtils.js';
import { PuzzlePiece } from './PuzzlePiece.js';

export class PuzzleGenerator {
    constructor({
        puzzleWidth,
        puzzleHeight,
        rows = 4,
        columns = 4,
        canvasWidth,
        canvasHeight,
        puzzleOffsetX = 0,
        puzzleOffsetY = 0,
        seed,
        random = Math.random
    }) {
        this.imageWidth = puzzleWidth;
        this.imageHeight = puzzleHeight;
        this.rows = rows;
        this.columns = columns;
        this.canvasWidth = canvasWidth || puzzleWidth * 2.5;
        this.canvasHeight = canvasHeight || puzzleHeight * 2.5;
        this.puzzleOffsetX = puzzleOffsetX;
        this.puzzleOffsetY = puzzleOffsetY;
        this.seed = seed ?? `${puzzleWidth}x${puzzleHeight}_${rows}x${columns}`;
        this.random = random;

        this.pieceWidth = puzzleWidth / columns;
        this.pieceHeight = puzzleHeight / rows;

        this.pieces = [];
    }

    /**
     * Generate complete puzzle using seam-first approach.
     * @returns {Array<PuzzlePiece>} Array of puzzle pieces
     */
    generate() {
        const rows = this.rows;
        const cols = this.columns;

        // -- Step 1: Seeded PRNG --
        // Derive seed from puzzle parameters so the same image+size always
        // produces identical piece shapes (important for save/restore).
        const seed = typeof this.seed === 'number'
            ? this.seed
            : BezierUtils.hashSeed(String(this.seed));
        const rng = BezierUtils.createRNG(seed);

        // -- Step 2: Jittered grid points --
        // (rows+1) x (cols+1) intersection points with randomized offsets.
        // Interior points get XY jitter, border points get along-edge jitter only,
        // corner points stay fixed to anchor the puzzle frame.
        const gridPoints = BezierUtils.generateGridPoints(
            rows, cols,
            this.pieceWidth, this.pieceHeight,
            this.puzzleOffsetX, this.puzzleOffsetY,
            rng, 0.03
        );

        // -- Step 3: Shared seam network --
        // Horizontal seams: hSeams[r][c] connects grid[r][c] -> grid[r][c+1]
        // Vertical seams:   vSeams[r][c] connects grid[r][c] -> grid[r+1][c]
        const hSeams = this._buildHorizontalSeams(rows, cols, gridPoints, rng);
        const vSeams = this._buildVerticalSeams(rows, cols, gridPoints, rng);

        // -- Step 4: Piece assembly --
        this._assemblePieces(rows, cols, hSeams, vSeams);

        // -- Step 5: Randomize initial positions --
        this.randomizePositions();

        return this.pieces;
    }

    /**
     * Build horizontal seam network.
     * hSeams[r][c] is the seam along row r from column c to column c+1.
     * - Row 0 and row `rows` are top/bottom borders (no tabs).
     * - Interior rows get tabs with random direction.
     */
    _buildHorizontalSeams(rows, cols, gridPoints, rng) {
        const hSeams = [];

        for (let r = 0; r <= rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                const p0 = gridPoints[r][c];
                const p1 = gridPoints[r][c + 1];
                const isBorder = (r === 0 || r === rows);
                const tabDir = rng() > 0.5 ? 1 : -1;

                row.push(BezierUtils.generateSeam(
                    p0, p1, isBorder,
                    !isBorder,  // hasTab: true for interior seams
                    tabDir, rng,
                    this.pieceHeight  // crossLen: perpendicular dimension for tab depth scaling
                ));
            }
            hSeams.push(row);
        }

        return hSeams;
    }

    /**
     * Build vertical seam network.
     * vSeams[r][c] is the seam along column c from row r to row r+1.
     * - Column 0 and column `cols` are left/right borders (no tabs).
     * - Interior columns get tabs with random direction.
     */
    _buildVerticalSeams(rows, cols, gridPoints, rng) {
        const vSeams = [];

        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c <= cols; c++) {
                const p0 = gridPoints[r][c];
                const p1 = gridPoints[r + 1][c];
                const isBorder = (c === 0 || c === cols);
                const tabDir = rng() > 0.5 ? 1 : -1;

                row.push(BezierUtils.generateSeam(
                    p0, p1, isBorder,
                    !isBorder,  // hasTab: true for interior seams
                    tabDir, rng,
                    this.pieceWidth  // crossLen: perpendicular dimension for tab depth scaling
                ));
            }
            vSeams.push(row);
        }

        return vSeams;
    }

    /**
     * Assemble puzzle pieces from the seam network.
     *
     * For each cell (r, c), build a closed Path2D from:
     *   top:    hSeams[r][c]     - forward  (left -> right)
     *   right:  vSeams[r][c+1]   - forward  (top -> bottom)
     *   bottom: hSeams[r+1][c]   - reversed (right -> left)
     *   left:   vSeams[r][c]     - reversed (bottom -> top)
     *
     * The piece anchor (correctX, correctY) uses the UN-jittered grid corner
     * so that image clipping offsets in PuzzleBoard remain unchanged.
     */
    _assemblePieces(rows, cols, hSeams, vSeams) {
        let pieceId = 0;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const topSeam    = hSeams[r][c];
                const rightSeam  = vSeams[r][c + 1];
                const bottomSeam = hSeams[r + 1][c];
                const leftSeam   = vSeams[r][c];

                // Anchor = un-jittered grid corner (preserves image clipping math)
                const anchorX = this.puzzleOffsetX + c * this.pieceWidth;
                const anchorY = this.puzzleOffsetY + r * this.pieceHeight;

                const path2D = BezierUtils.buildPiecePath2D(
                    topSeam, rightSeam, bottomSeam, leftSeam,
                    anchorX, anchorY
                );

                // Determine neighbors
                const neighbors = {
                    top:    r > 0          ? this.getPieceId(r - 1, c) : null,
                    right:  c < cols - 1   ? this.getPieceId(r, c + 1) : null,
                    bottom: r < rows - 1   ? this.getPieceId(r + 1, c) : null,
                    left:   c > 0          ? this.getPieceId(r, c - 1) : null
                };

                this.pieces.push(new PuzzlePiece({
                    id: pieceId++,
                    row: r,
                    col: c,
                    svgPath: null,
                    path2D,
                    width: this.pieceWidth,
                    height: this.pieceHeight,
                    correctX: anchorX,
                    correctY: anchorY,
                    currentX: anchorX,  // Will be randomized below
                    currentY: anchorY,
                    neighbors,
                    zIndex: 0
                }));
            }
        }
    }

    /**
     * Get piece ID from row/col
     */
    getPieceId(row, col) {
        return row * this.columns + col;
    }

    /**
     * Randomize piece positions (scatter to left and right sides of canvas)
     */
    randomizePositions() {
        const pad = Math.max(this.pieceWidth, this.pieceHeight) * 0.3;
        const puzzleLeft = this.puzzleOffsetX;
        const puzzleRight = this.puzzleOffsetX + this.imageWidth;

        // Shuffle pieces so adjacent grid pieces don't always end up together
        const shuffled = [...this.pieces];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        shuffled.forEach((piece, i) => {
            // Spread vertically across canvas, stay within bounds
            piece.currentY = pad + this.random() * Math.max(this.canvasHeight - piece.height - pad * 2, 0);

            if (i % 2 === 0) {
                // Left zone: from pad to just before puzzle area
                const zoneEnd = Math.max(puzzleLeft - piece.width * 0.3, pad + piece.width);
                piece.currentX = pad + this.random() * Math.max(zoneEnd - pad - piece.width, 0);
            } else {
                // Right zone: just after puzzle area to canvas edge
                const zoneStart = puzzleRight - piece.width * 0.2;
                const zoneEnd = this.canvasWidth - piece.width - pad;
                piece.currentX = zoneStart + this.random() * Math.max(zoneEnd - zoneStart, 0);
            }
        });
    }

    /**
     * Get piece by ID
     */
    getPiece(id) {
        return this.pieces.find(p => p.id === id);
    }

    /**
     * Get piece at row, col
     */
    getPieceAt(row, col) {
        return this.pieces.find(p => p.row === row && p.col === col);
    }

    /**
     * Get puzzle dimensions
     */
    getDimensions() {
        return {
            imageWidth: this.imageWidth,
            imageHeight: this.imageHeight,
            pieceWidth: this.pieceWidth,
            pieceHeight: this.pieceHeight,
            rows: this.rows,
            columns: this.columns,
            totalPieces: this.rows * this.columns
        };
    }
}
