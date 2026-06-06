/**
 * PuzzlePiece Class
 *
 * Represents a single jigsaw puzzle piece with its shape, position, and state.
 */

export class PuzzlePiece {
    constructor(config) {
        // Identification
        this.id = config.id;
        this.row = config.row;
        this.col = config.col;

        // Shape
        this.svgPath = config.svgPath;      // SVG path string
        this.path2D = config.path2D;        // Path2D object for canvas
        this.width = config.width;
        this.height = config.height;

        // Position
        this.correctX = config.correctX;    // Correct position in puzzle
        this.correctY = config.correctY;
        this.currentX = config.currentX;    // Current position (randomized at start)
        this.currentY = config.currentY;

        // State
        this.isPlaced = false;              // Snapped to correct position
        this.isSelected = false;            // Currently being dragged
        this.zIndex = config.zIndex || 0;   // Layer order

        // Neighbors
        this.neighbors = {
            top: config.neighbors?.top ?? null,
            right: config.neighbors?.right ?? null,
            bottom: config.neighbors?.bottom ?? null,
            left: config.neighbors?.left ?? null
        };

        // Group (for connected pieces)
        this.groupId = null;                // ID of piece group (when snapped together)
        this.groupMembers = [this];         // Pieces in this group

        // Rendering cache
        this.imageCache = null;             // Cached ImageBitmap of piece
    }

    /**
     * Check if point (x, y) is inside this piece's shape
     * Uses canvas isPointInPath for accurate hit testing
     */
    hitTest(x, y, ctx) {
        if (!this.path2D) return false;

        // Test point in piece-local coordinates against the path at origin
        return ctx.isPointInPath(this.path2D, x - this.currentX, y - this.currentY);
    }

    /**
     * Move piece to new position
     */
    moveTo(x, y) {
        this.currentX = x;
        this.currentY = y;
    }

    /**
     * Snap piece to correct position
     */
    snapToPosition() {
        this.currentX = this.correctX;
        this.currentY = this.correctY;
        this.isPlaced = true;
    }

    /**
     * Check if piece is close to correct position (for snapping)
     * @param {number} threshold - Snap threshold as percentage of piece width
     */
    isNearCorrectPosition(threshold = 0.075) {
        const dx = this.currentX - this.correctX;
        const dy = this.currentY - this.correctY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const maxDistance = this.width * threshold;

        return distance < maxDistance;
    }

    /**
     * Get distance to correct position
     */
    getDistanceToCorrectPosition() {
        const dx = this.currentX - this.correctX;
        const dy = this.currentY - this.correctY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Check if this piece is a neighbor of another piece
     */
    isNeighborOf(otherPiece) {
        return Object.values(this.neighbors).some(neighbor => neighbor === otherPiece.id);
    }

    /**
     * Get neighbor in specific direction
     */
    getNeighbor(direction) {
        return this.neighbors[direction];
    }

    /**
     * Join this piece with another (create/merge groups)
     */
    joinWith(otherPiece) {
        // Already in the same group - check by reference since all members
        // share the same array object
        if (this.groupMembers === otherPiece.groupMembers) {
            return;
        }

        // Merge groups, deduplicating via Set to prevent bloated groupMembers
        const newGroupId = this.groupId || `group_${Date.now()}_${Math.random()}`;
        const memberSet = new Set([...this.groupMembers, ...otherPiece.groupMembers]);
        const allMembers = [...memberSet];

        // Update all pieces in merged group - every piece shares the SAME array
        allMembers.forEach(piece => {
            piece.groupId = newGroupId;
            piece.groupMembers = allMembers;
        });
    }

    /**
     * Move entire group together
     */
    moveGroup(dx, dy) {
        this.groupMembers.forEach(piece => {
            piece.currentX += dx;
            piece.currentY += dy;
        });
    }

    /**
     * Check if entire group is correctly placed
     */
    isGroupPlaced() {
        return this.groupMembers.every(piece => piece.isPlaced);
    }

    /**
     * Bring piece (and its group) to front
     */
    bringToFront(maxZ) {
        const newZ = maxZ + 1;
        this.groupMembers.forEach(piece => {
            piece.zIndex = newZ;
        });
        return newZ;
    }

    /**
     * Get bounding box of piece
     */
    getBounds() {
        return {
            x: this.currentX,
            y: this.currentY,
            width: this.width,
            height: this.height,
            right: this.currentX + this.width,
            bottom: this.currentY + this.height
        };
    }

    /**
     * Serialize piece state for saving
     */
    toJSON() {
        return {
            id: this.id,
            currentX: this.currentX,
            currentY: this.currentY,
            isPlaced: this.isPlaced,
            groupId: this.groupId,
            zIndex: this.zIndex
        };
    }

    /**
     * Restore piece state from saved data
     */
    static fromJSON(piece, savedData) {
        piece.currentX = savedData.currentX;
        piece.currentY = savedData.currentY;
        piece.isPlaced = savedData.isPlaced;
        piece.groupId = savedData.groupId;
        piece.zIndex = savedData.zIndex;
        return piece;
    }
}
