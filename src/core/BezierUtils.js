/**
 * BezierUtils - Seam-First Jigsaw Puzzle Piece Generation
 *
 * =======================================================================
 * WHY SEAM-FIRST GENERATION CREATES MORE NATURAL PUZZLE PIECES
 * =======================================================================
 *
 * Traditional (rectangle-first) approach:
 *   1. Start with a perfect rectangle for each piece
 *   2. Add tabs/slots along each straight edge independently
 *   3. Result: pieces always look like rectangles with bumps on the sides
 *   4. The underlying grid is always visible in the final puzzle
 *
 * Seam-first approach (what this file implements):
 *   1. Start from grid intersection points and JITTER them randomly
 *   2. Generate curved seam paths between neighboring intersections
 *   3. Insert tabs/blanks at randomized positions along those curves
 *   4. Each puzzle piece is the closed region bounded by its 4 surrounding seams
 *   5. Result: pieces have irregular, organic outlines because:
 *      - corners don't align to a grid (they're jittered)
 *      - edges are curves, not straight lines with bumps
 *      - tabs sit at varied positions, not always centered
 *      - the base edge shape varies per seam
 *
 * The key insight: by generating SHARED SEAMS first (not per-piece edges),
 * neighboring pieces automatically fit together perfectly - they literally
 * share the same curve geometry. One piece uses the seam forward, the
 * neighbor uses it reversed. No alignment hacks needed.
 * =======================================================================
 */

export class BezierUtils {

    // ---------------------------------------------------------
    //  Seeded PRNG (mulberry32) - deterministic random numbers
    // ---------------------------------------------------------

    /**
     * Create a seeded pseudo-random number generator (mulberry32).
     * Returns a function that produces a new float in [0,1) on each call.
     *
     * @param {number} seed - Integer seed value
     * @returns {function(): number}
     */
    static createRNG(seed) {
        let s = seed | 0;
        return function () {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /**
     * Derive an integer seed from a string (simple djb2 hash).
     * Useful for seeding from image URL + grid size.
     */
    static hashSeed(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
        }
        return hash;
    }

    // ---------------------------------------------------------
    //  Jittered grid points
    // ---------------------------------------------------------

    /**
     * Generate a (rows+1) x (cols+1) array of grid intersection points
     * with randomized jitter so pieces don't look like rectangles.
     *
     * Interior points:  jitter in both X and Y
     * Border points:    jitter along the border only (not perpendicular)
     * Corner points:    no jitter (anchor the puzzle frame)
     *
     * @param {number} rows       - Number of grid rows
     * @param {number} cols       - Number of grid columns
     * @param {number} cellWidth  - Nominal width of one grid cell
     * @param {number} cellHeight - Nominal height of one grid cell
     * @param {number} offsetX    - Puzzle X offset on canvas
     * @param {number} offsetY    - Puzzle Y offset on canvas
     * @param {function} rng      - Seeded RNG function
     * @param {number} [jitterFraction=0.03] - Max jitter as fraction of cell size.
     *   3% breaks the grid enough to look organic without losing structure.
     *   Values above 5% make pieces look procedurally generated.
     * @returns {Array<Array<{x: number, y: number}>>}
     */
    static generateGridPoints(rows, cols, cellWidth, cellHeight, offsetX, offsetY, rng, jitterFraction = 0.03) {
        const points = [];
        const jitterX = cellWidth * jitterFraction;
        const jitterY = cellHeight * jitterFraction;

        for (let r = 0; r <= rows; r++) {
            const row = [];
            for (let c = 0; c <= cols; c++) {
                const baseX = offsetX + c * cellWidth;
                const baseY = offsetY + r * cellHeight;

                const isTopEdge = r === 0;
                const isBottomEdge = r === rows;
                const isLeftEdge = c === 0;
                const isRightEdge = c === cols;

                const isCorner = (isTopEdge || isBottomEdge) && (isLeftEdge || isRightEdge);
                const isBorderH = isTopEdge || isBottomEdge;  // horizontal border
                const isBorderV = isLeftEdge || isRightEdge;  // vertical border

                let dx = 0, dy = 0;

                if (isCorner) {
                    // No jitter - anchors the puzzle frame
                } else if (isBorderH) {
                    // Top/bottom edge: jitter only along X
                    dx = (rng() - 0.5) * 2 * jitterX;
                } else if (isBorderV) {
                    // Left/right edge: jitter only along Y
                    dy = (rng() - 0.5) * 2 * jitterY;
                } else {
                    // Interior: full jitter in both axes
                    dx = (rng() - 0.5) * 2 * jitterX;
                    dy = (rng() - 0.5) * 2 * jitterY;
                }

                row.push({ x: baseX + dx, y: baseY + dy });
            }
            points.push(row);
        }

        return points;
    }

    // ---------------------------------------------------------
    //  Seam data structure and traversal
    // ---------------------------------------------------------

    /**
     * A Seam is an ordered array of path commands from startPoint to endPoint.
     * It can be played forward or reversed onto a Path2D.
     *
     * Command types:
     *   { type: 'moveTo', x, y }
     *   { type: 'lineTo', x, y }
     *   { type: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y }
     *
     * @typedef {Object} Seam
     * @property {Array} commands  - Ordered path commands
     * @property {{x,y}} startPoint
     * @property {{x,y}} endPoint
     * @property {boolean} hasTab  - Whether this seam has a tab protrusion
     * @property {number} tabDirection - +1 or -1, which side the tab protrudes
     */

    /**
     * Play seam commands forward onto a Path2D.
     * Skips the initial moveTo - caller should have already positioned the cursor
     * at the seam's start point.
     *
     * @param {Path2D} path
     * @param {Seam} seam
     */
    static playSeamForward(path, seam) {
        for (let i = 0; i < seam.commands.length; i++) {
            const cmd = seam.commands[i];
            if (cmd.type === 'moveTo') continue; // skip, cursor already there
            if (cmd.type === 'lineTo') {
                path.lineTo(cmd.x, cmd.y);
            } else if (cmd.type === 'bezierCurveTo') {
                path.bezierCurveTo(cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y);
            }
        }
    }

    /**
     * Play seam commands in reverse onto a Path2D.
     * This traces the seam from endPoint back to startPoint.
     *
     * For bezierCurveTo: reverse means swapping cp1<->cp2 and walking
     * from the previous command's endpoint back to the current one's start.
     *
     * @param {Path2D} path
     * @param {Seam} seam
     */
    static playSeamReversed(path, seam) {
        const cmds = seam.commands;

        // Build an array of "segments" each with {startPt, endPt, type, ...}
        // so we can reverse them properly.
        const segments = [];
        let prevPt = seam.startPoint;

        for (const cmd of cmds) {
            if (cmd.type === 'moveTo') {
                prevPt = { x: cmd.x, y: cmd.y };
                continue;
            }
            segments.push({ ...cmd, fromX: prevPt.x, fromY: prevPt.y });
            prevPt = { x: cmd.x, y: cmd.y };
        }

        // Walk segments in reverse
        for (let i = segments.length - 1; i >= 0; i--) {
            const seg = segments[i];
            if (seg.type === 'lineTo') {
                path.lineTo(seg.fromX, seg.fromY);
            } else if (seg.type === 'bezierCurveTo') {
                // Reverse a cubic bezier: swap control points and direction
                path.bezierCurveTo(
                    seg.cp2x, seg.cp2y,  // old cp2 becomes new cp1
                    seg.cp1x, seg.cp1y,  // old cp1 becomes new cp2
                    seg.fromX, seg.fromY  // end at original start
                );
            }
        }
    }

    // ---------------------------------------------------------
    //  Seam generation - base curves + tab insertion
    // ---------------------------------------------------------

    /**
     * Generate a seam between two grid points.
     *
     * For border seams (no tab): a subtle S-curve.
     * For interior seams (with tab): an S-curve with a tab/blank inserted.
     *
     * @param {{x,y}} p0         - Start grid point
     * @param {{x,y}} p1         - End grid point
     * @param {boolean} isBorder - True if this is a puzzle border edge
     * @param {boolean} hasTab   - True if tab protrudes (false = slot/blank)
     * @param {number} tabDir    - +1 or -1 (which side the tab protrudes)
     * @param {function} rng     - Seeded RNG
     * @param {number} crossLen  - Perpendicular dimension (for scaling tab depth)
     * @returns {Seam}
     */
    static generateSeam(p0, p1, isBorder, hasTab, tabDir, rng, crossLen) {
        const commands = [];
        commands.push({ type: 'moveTo', x: p0.x, y: p0.y });

        if (isBorder) {
            // Border seam: subtle curvature, no tab
            this._addBorderCurve(commands, p0, p1, rng);
        } else {
            // Interior seam: base curve with tab/blank inserted
            this._addInteriorSeamWithTab(commands, p0, p1, hasTab, tabDir, rng, crossLen);
        }

        return {
            commands,
            startPoint: { x: p0.x, y: p0.y },
            endPoint: { x: p1.x, y: p1.y },
            hasTab,
            tabDirection: tabDir
        };
    }

    /**
     * Add a subtle curve for a border seam (no tab).
     * Uses a single cubic bezier with slightly offset control points
     * to create gentle, barely-perceptible curvature.
     */
    static _addBorderCurve(commands, p0, p1, rng) {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        // Normal vector (perpendicular, 90 degrees CCW)
        const nx = -dy / len;
        const ny = dx / len;

        // Visible curvature on puzzle borders (0.3-0.8%)
        const bulge = len * (0.003 + rng() * 0.005) * (rng() > 0.5 ? 1 : -1);

        const cp1x = p0.x + dx * 0.33 + nx * bulge;
        const cp1y = p0.y + dy * 0.33 + ny * bulge;
        const cp2x = p0.x + dx * 0.66 + nx * bulge;
        const cp2y = p0.y + dy * 0.66 + ny * bulge;

        commands.push({
            type: 'bezierCurveTo',
            cp1x, cp1y, cp2x, cp2y,
            x: p1.x, y: p1.y
        });
    }

    /**
     * Generate an interior seam with a classic jigsaw tab or blank.
     *
     * Based on the reference bezier structure (makeBeziers pattern):
     *   1. Shoulder  - flat start, dips OPPOSITE to tab near neck entry
     *   2. Neck      - tight S-crossing through baseline into tab side
     *   3. Left head - cp1 at neck, cp2 far left at peak (mushroom overhang)
     *   4. Right head - cp1 at peak, cp2 far right at peak (mushroom overhang)
     *   5. Neck      - tight S-crossing back through baseline
     *   6. Shoulder  - dip returns to flat at edge end
     *
     * The shoulder dip opposite to the tab is the key feature that creates
     * the classic concave jigsaw shoulder look.
     */
    static _addInteriorSeamWithTab(commands, p0, p1, hasTab, tabDir, rng, crossLen) {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const c = crossLen || len;

        const ex = dx / len;
        const ey = dy / len;
        const nx = -ey;
        const ny = ex;

        const dir = hasTab ? -tabDir : tabDir;
        const ySign = -dir;
        const sx = len / 100;
        const sy = c / 100;

        // Reference-inspired parameters in normalized 0-100 seam space.
        // Keep them narrow so generated pieces stay close to the target silhouette.
        const center = 48 + rng() * 4;       // 48-52
        const neckHalfWidth = 12.5 + rng() * 1.5; // 12.5-14.0
        const headOverhang = 17 + rng() * 2; // 17-19
        const headDepth = 19 + rng() * 2;    // 19-21
        const shoulderDip = 13.5 + rng() * 2.5; // 13.5-16
        const neckDepth = 4.5 + rng() * 1.0; // 4.5-5.5

        const neckL = center - neckHalfWidth;
        const neckR = center + neckHalfWidth;
        const neckEntryL = neckL + 1;
        const neckEntryR = neckR - 1;
        const shoulderCpL = neckL - 2;
        const shoulderCpR = neckR + 2;
        const neckCpL = neckL + 3;
        const neckCpR = neckR - 3;
        const headCpL = neckEntryL - headOverhang;
        const headCpR = neckEntryR + headOverhang;

        // Base bow: gentle arc that breaks straight grid lines while preserving reference proportions.
        const seamDrift = len * (0.008 + rng() * 0.010) * (rng() > 0.5 ? 1 : -1);

        const pt = (t, d) => {
            const bow = seamDrift * Math.sin(Math.PI * t / 100);
            const offset = d * sy * ySign + bow;
            return {
                x: p0.x + ex * t * sx + nx * offset,
                y: p0.y + ey * t * sx + ny * offset
            };
        };

        const bez = (cp1, cp2, end) => ({
            type: 'bezierCurveTo',
            cp1x: cp1.x, cp1y: cp1.y,
            cp2x: cp2.x, cp2y: cp2.y,
            x: end.x, y: end.y
        });

        commands.push(bez(
            pt(0, 0),
            pt(shoulderCpL, shoulderDip),
            pt(neckL, neckDepth)
        ));

        commands.push(bez(
            pt(neckL, neckDepth),
            pt(neckCpL, 0),
            pt(neckEntryL, -neckDepth)
        ));

        commands.push(bez(
            pt(neckEntryL, -neckDepth),
            pt(headCpL, -headDepth),
            pt(center, -headDepth)
        ));

        commands.push(bez(
            pt(center, -headDepth),
            pt(headCpR, -headDepth),
            pt(neckEntryR, -neckDepth)
        ));

        commands.push(bez(
            pt(neckEntryR, -neckDepth),
            pt(neckCpR, 0),
            pt(neckR, neckDepth)
        ));

        commands.push(bez(
            pt(neckR, neckDepth),
            pt(shoulderCpR, shoulderDip),
            p1
        ));
    }

    // ---------------------------------------------------------
    //  Piece path assembly from surrounding seams
    // ---------------------------------------------------------

    /**
     * Build a closed Path2D for a puzzle piece from its 4 surrounding seams.
     *
     * Seam traversal directions:
     *   top:    forward  (left -> right)
     *   right:  forward  (top -> bottom)
     *   bottom: REVERSED (right -> left, reusing neighbor's top seam)
     *   left:   REVERSED (bottom -> top, reusing neighbor's right seam)
     *
     * The path is built in piece-local coordinates by subtracting the piece's
     * anchor position (anchorX, anchorY) from all seam points.
     *
     * @param {Seam} topSeam
     * @param {Seam} rightSeam
     * @param {Seam} bottomSeam
     * @param {Seam} leftSeam
     * @param {number} anchorX - Piece anchor X (un-jittered grid corner)
     * @param {number} anchorY - Piece anchor Y (un-jittered grid corner)
     * @returns {Path2D}
     */
    static buildPiecePath2D(topSeam, rightSeam, bottomSeam, leftSeam, anchorX, anchorY) {
        // Create offset versions of seams in piece-local space
        const offsetSeam = (seam) => ({
            ...seam,
            startPoint: {
                x: seam.startPoint.x - anchorX,
                y: seam.startPoint.y - anchorY
            },
            endPoint: {
                x: seam.endPoint.x - anchorX,
                y: seam.endPoint.y - anchorY
            },
            commands: seam.commands.map(cmd => {
                const result = { ...cmd };
                if (result.x !== undefined) { result.x -= anchorX; result.y -= anchorY; }
                if (result.cp1x !== undefined) {
                    result.cp1x -= anchorX; result.cp1y -= anchorY;
                    result.cp2x -= anchorX; result.cp2y -= anchorY;
                }
                return result;
            })
        });

        const top = offsetSeam(topSeam);
        const right = offsetSeam(rightSeam);
        const bottom = offsetSeam(bottomSeam);
        const left = offsetSeam(leftSeam);

        const path = new Path2D();

        // Start at top-left corner (top seam's start)
        path.moveTo(top.startPoint.x, top.startPoint.y);

        // Top edge: forward (left -> right)
        this.playSeamForward(path, top);

        // Right edge: forward (top -> bottom)
        this.playSeamForward(path, right);

        // Bottom edge: reversed (right -> left)
        this.playSeamReversed(path, bottom);

        // Left edge: reversed (bottom -> top)
        this.playSeamReversed(path, left);

        path.closePath();
        return path;
    }
}
