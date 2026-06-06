/**
 * DragHandler Class
 *
 * Handles drag-and-drop interaction for puzzle pieces.
 * Uses Pointer API for unified mouse/touch support.
 *
 * When a piece is picked up, its entire group (all pieces sharing the
 * same groupId via PuzzlePiece.groupMembers) is moved together by
 * calling piece.moveGroup(dx, dy). This ensures that previously-snapped
 * sub-assemblies stay rigid during dragging.
 *
 * On drop, the handler delegates to SnapHandler.trySnap() and invokes
 * the optional onSnap callback when a valid connection is made.
 */

export class DragHandler {
    constructor(puzzleBoard, snapHandler, options = {}) {
        this.board = puzzleBoard;
        this.snapHandler = snapHandler;
        this.onSnap = options.onSnap || (() => {});

        this.isDragging = false;
        this.draggedPiece = null;
        this.dragOffset = { x: 0, y: 0 };
        this.lastPointerPos = { x: 0, y: 0 };

        this.enabled = true;
        this.listeners = [];

        this.setupEventListeners();
    }

    /**
     * Set up pointer event listeners
     */
    setupEventListeners() {
        const canvas = this.board.canvas;

        // Pointer events (handles both mouse and touch)
        this.addListener(canvas, 'pointerdown', this.onPointerDown.bind(this));
        this.addListener(canvas, 'pointermove', this.onPointerMove.bind(this));
        this.addListener(canvas, 'pointerup', this.onPointerUp.bind(this));
        this.addListener(canvas, 'pointercancel', this.onPointerUp.bind(this));
        this.addListener(canvas, 'contextmenu', (event) => event.preventDefault());
    }

    addListener(target, type, handler) {
        target.addEventListener(type, handler);
        this.listeners.push({ target, type, handler });
    }

    /**
     * Handle pointer down (start drag)
     */
    onPointerDown(e) {
        if (!this.enabled) return;

        e.preventDefault();

        const piece = this.board.getPieceAtPoint(e.clientX, e.clientY);

        if (piece) {
            this.startDrag(piece, e.clientX, e.clientY);
        }
    }

    /**
     * Handle pointer move (dragging)
     */
    onPointerMove(e) {
        if (!this.enabled || !this.isDragging) return;

        e.preventDefault();

        this.updateDrag(e.clientX, e.clientY);
    }

    /**
     * Handle pointer up (end drag)
     */
    onPointerUp(e) {
        if (!this.enabled || !this.isDragging) return;

        e.preventDefault();

        this.endDrag();
    }

    /**
     * Start dragging a piece
     */
    startDrag(piece, screenX, screenY) {
        this.isDragging = true;
        this.draggedPiece = piece;

        // Bring piece (and its group) to front
        this.board.bringPieceToFront(piece);

        // Mark as selected
        piece.isSelected = true;
        piece.groupMembers.forEach(p => p.isSelected = true);

        // Calculate offset from piece origin to click point
        const canvasPos = this.board.screenToCanvas(screenX, screenY);
        this.dragOffset = {
            x: canvasPos.x - piece.currentX,
            y: canvasPos.y - piece.currentY
        };

        this.lastPointerPos = { x: screenX, y: screenY };

        // Change cursor
        this.board.canvas.style.cursor = 'grabbing';
    }

    /**
     * Update drag position
     */
    updateDrag(screenX, screenY) {
        if (!this.draggedPiece) return;

        const canvasPos = this.board.screenToCanvas(screenX, screenY);
        const piece = this.draggedPiece;

        // Calculate new position
        let newX = canvasPos.x - this.dragOffset.x;
        let newY = canvasPos.y - this.dragOffset.y;

        // Clamp within canvas bounds (allow slight overflow for tabs)
        const margin = Math.max(piece.width, piece.height) * 0.25;
        newX = Math.max(-margin, Math.min(newX, this.board.canvasWidth - piece.width + margin));
        newY = Math.max(-margin, Math.min(newY, this.board.canvasHeight - piece.height + margin));

        // Calculate delta for group movement
        const dx = newX - piece.currentX;
        const dy = newY - piece.currentY;

        // Move piece and its group
        piece.moveGroup(dx, dy);

        this.lastPointerPos = { x: screenX, y: screenY };
    }

    /**
     * End drag (try to snap)
     */
    endDrag() {
        if (!this.draggedPiece) return;

        const piece = this.draggedPiece;

        // Mark as not selected
        piece.isSelected = false;
        piece.groupMembers.forEach(p => p.isSelected = false);

        // Try to snap piece
        const snapped = this.snapHandler.trySnap(piece);

        if (snapped) {
            this.onSnap(piece);
        }

        // Reset drag state
        this.isDragging = false;
        this.draggedPiece = null;
        this.dragOffset = { x: 0, y: 0 };

        // Reset cursor
        this.board.canvas.style.cursor = 'grab';
    }

    /**
     * Enable/disable dragging
     */
    setEnabled(enabled) {
        this.enabled = enabled;

        if (!enabled && this.isDragging) {
            this.endDrag();
        }

        this.board.canvas.style.cursor = enabled ? 'grab' : 'default';
    }

    /**
     * Check if currently dragging
     */
    isDraggingPiece() {
        return this.isDragging;
    }

    /**
     * Get currently dragged piece
     */
    getDraggedPiece() {
        return this.draggedPiece;
    }

    /**
     * Cancel current drag
     */
    cancelDrag() {
        if (this.isDragging) {
            this.draggedPiece.isSelected = false;
            this.isDragging = false;
            this.draggedPiece = null;
            this.board.canvas.style.cursor = 'grab';
        }
    }

    destroy() {
        this.cancelDrag();
        this.listeners.forEach(({ target, type, handler }) => {
            target.removeEventListener(type, handler);
        });
        this.listeners = [];
    }
}
