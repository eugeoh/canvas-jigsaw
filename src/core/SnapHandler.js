/**
 * SnapHandler Class
 *
 * =======================================================================
 * WHY RELATIVE SNAPPING BEATS ABSOLUTE-POSITION SNAPPING
 * =======================================================================
 *
 * Absolute snapping: each piece checks if it's near its correctX/Y on
 * the canvas. This forces the user to place pieces in a fixed location
 * and doesn't allow freely assembling sub-groups anywhere on the board.
 *
 * Relative snapping (what this class implements): when a piece is
 * dropped, we check if any of its grid neighbors are positioned at the
 * correct RELATIVE offset from it. The formula is simple:
 *
 *   expectedX = neighbor.currentX + (piece.correctX - neighbor.correctX)
 *   expectedY = neighbor.currentY + (piece.correctY - neighbor.correctY)
 *
 * If piece.current is close to (expectedX, expectedY), the two pieces
 * snap together regardless of where they sit on the canvas. This lets
 * users assemble sub-groups anywhere, then merge sub-groups together.
 *
 * =======================================================================
 * HOW CLUSTER MERGING WORKS
 * =======================================================================
 *
 * When a group is dropped, snapping happens in two passes:
 *
 * Pass 1 - Best-fit alignment:
 *   Scan every member of the dropped group and every neighbor outside
 *   the group. Find the closest valid snap (smallest distance below
 *   threshold). Move the entire dropped group by the delta to align.
 *   Merge the two groups.
 *
 * Pass 2 - Cascading merges (while loop):
 *   After the initial alignment, the dropped group may now be perfectly
 *   aligned with ADDITIONAL neighboring groups (because they were already
 *   placed correctly relative to the first snap target). The while loop
 *   repeatedly scans for neighbors within 1px tolerance and merges them.
 *   This handles the scenario where dropping a piece between two already-
 *   correct groups connects all three in a single drop.
 *
 *   Example: groups A and B are already in correct relative position but
 *   separated. User drops piece C between them and snaps to A. Now C's
 *   group includes A, and B is within 1px tolerance of A - so B merges
 *   too. The while loop keeps going until no new merges are found.
 * =======================================================================
 */

export class SnapHandler {
    constructor(pieces, threshold = 0.22) {
        this.pieces = pieces;
        this.threshold = threshold;
        this.snapCallbacks = [];
    }

    /**
     * Try to snap a piece (and its group) after being dropped.
     * @param {PuzzlePiece} piece - Piece that was just dropped
     * @returns {boolean} True if any snap occurred
     */
    trySnap(piece) {
        return this.trySnapToNeighbors(piece);
    }

    /**
     * Try to snap the dropped group to any neighboring piece/group
     * by checking relative positions. Merges with ALL valid neighbors,
     * not just the first one found.
     */
    trySnapToNeighbors(piece) {
        const directions = ['top', 'right', 'bottom', 'left'];
        let snapped = false;

        // First pass: find the closest snap to align the group
        let bestMove = null;
        let bestDistance = Infinity;
        let bestMember = null;
        let bestNeighbor = null;

        const members = [...piece.groupMembers];
        for (const member of members) {
            for (const direction of directions) {
                const neighborId = member.getNeighbor(direction);
                if (neighborId === null) continue;

                const neighbor = this.pieces.find(p => p.id === neighborId);
                if (!neighbor) continue;
                if (member.groupMembers.includes(neighbor)) continue;

                const expectedPos = this.getExpectedPosition(member, neighbor);
                const dx = member.currentX - expectedPos.x;
                const dy = member.currentY - expectedPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const maxDistance = member.width * this.threshold;

                if (distance < maxDistance && distance < bestDistance) {
                    bestDistance = distance;
                    bestMove = { x: expectedPos.x - member.currentX, y: expectedPos.y - member.currentY };
                    bestMember = member;
                    bestNeighbor = neighbor;
                }
            }
        }

        // Align the group to the closest snap
        if (bestMove) {
            piece.moveGroup(bestMove.x, bestMove.y);
            bestMember.joinWith(bestNeighbor);
            snapped = true;

            // Second pass: now that we're aligned, merge any other
            // neighbors that are in the correct position
            let merged = true;
            while (merged) {
                merged = false;
                const currentMembers = [...piece.groupMembers];
                for (const member of currentMembers) {
                    for (const direction of directions) {
                        const neighborId = member.getNeighbor(direction);
                        if (neighborId === null) continue;

                        const neighbor = this.pieces.find(p => p.id === neighborId);
                        if (!neighbor) continue;
                        if (member.groupMembers.includes(neighbor)) continue;

                        const expectedPos = this.getExpectedPosition(member, neighbor);
                        const dx = member.currentX - expectedPos.x;
                        const dy = member.currentY - expectedPos.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        // Tighter threshold for secondary merges (already aligned)
                        // Use a small fraction of piece size to absorb floating-point drift
                        if (distance < member.width * 0.02) {
                            member.joinWith(neighbor);
                            merged = true;
                        }
                    }
                }
            }

            this.triggerSnapCallbacks(piece);
        }

        return snapped;
    }

    /**
     * Calculate where piece should be positioned relative to a neighbor
     * based on their known correct offsets
     */
    getExpectedPosition(piece, neighbor) {
        return {
            x: neighbor.currentX + (piece.correctX - neighbor.correctX),
            y: neighbor.currentY + (piece.correctY - neighbor.correctY)
        };
    }

    /**
     * Set snap threshold
     * @param {number} threshold - Threshold as percentage of piece width
     */
    setThreshold(threshold) {
        this.threshold = threshold;
    }

    /**
     * Get current threshold
     */
    getThreshold() {
        return this.threshold;
    }

    /**
     * Register callback for snap events
     */
    onSnap(callback) {
        this.snapCallbacks.push(callback);
    }

    /**
     * Trigger snap callbacks
     */
    triggerSnapCallbacks(piece) {
        this.snapCallbacks.forEach(cb => {
            try {
                cb(piece);
            } catch (e) {
                console.error('Error in snap callback:', e);
            }
        });
    }

    /**
     * Clear all snap callbacks
     */
    clearCallbacks() {
        this.snapCallbacks = [];
    }

    /**
     * Check if all pieces are snapped (puzzle complete)
     */
    isComplete() {
        if (this.pieces.length === 0) return false;
        return this.pieces[0].groupMembers.length === this.pieces.length;
    }

    /**
     * Get snap statistics
     */
    getStats() {
        const totalCount = this.pieces.length;
        // Largest group size shows how many pieces are connected
        const largestGroup = totalCount > 0
            ? Math.max(...this.pieces.map(p => p.groupMembers.length))
            : 0;

        return {
            placed: largestGroup,
            total: totalCount,
            percentage: Math.round((largestGroup / totalCount) * 100),
            remaining: totalCount - largestGroup,
            isComplete: largestGroup === totalCount
        };
    }

    /**
     * Reset all snaps
     */
    resetAll() {
        this.pieces.forEach(piece => {
            piece.groupId = null;
            piece.groupMembers = [piece];
        });
    }
}
