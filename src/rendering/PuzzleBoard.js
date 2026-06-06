/**
 * PuzzleBoard Class
 *
 * Manages canvas rendering, piece extraction, and visual presentation
 */

export class PuzzleBoard {
    constructor(canvas, sourceImage, pieces, dims, options = {}) {
        this.canvas = canvas;
        this.sourceImage = sourceImage;
        this.pieces = pieces;

        // Display dimensions (viewport-based, logical pixels)
        this.puzzleWidth = dims?.puzzleWidth || sourceImage.width;
        this.puzzleHeight = dims?.puzzleHeight || sourceImage.height;
        this.canvasWidth = dims?.canvasWidth || this.puzzleWidth * 2.5;
        this.canvasHeight = dims?.canvasHeight || this.puzzleHeight * 2.5;

        // Puzzle origin offset (for centering puzzle in wider canvas)
        this.puzzleOffsetX = dims?.puzzleOffsetX || 0;
        this.puzzleOffsetY = dims?.puzzleOffsetY || 0;
        this.backgroundColor = options.backgroundColor || '#b8b0a4';
        this.backgroundNoise = options.backgroundNoise !== false;
        this.selectedShadowColor = options.selectedShadowColor || 'rgba(0, 0, 0, 0.3)';

        // DPR for crisp rendering on high-density displays
        this.dpr = window.devicePixelRatio || 1;

        // Canvas backing at native resolution, CSS at logical size
        this.canvas.width = Math.ceil(this.canvasWidth * this.dpr);
        this.canvas.height = Math.ceil(this.canvasHeight * this.dpr);
        this.canvas.style.width = this.canvasWidth + 'px';
        this.canvas.style.height = this.canvasHeight + 'px';

        this.ctx = canvas.getContext('2d');

        // Piece cache (OffscreenCanvas for each piece)
        this.pieceCache = new Map();

        // Background noise texture pattern
        this.bgPattern = null;

        // Animation
        this.animationFrameId = null;
        this.isRendering = false;

        // Completion animation state
        this.completionStartTime = null;
        this.completionDuration = 1500;
        this.completionProgress = 0;

    }

    /**
     * Initialize board and cache pieces
     */
    async init() {
        this.bgPattern = this.backgroundNoise ? this.createNoisePattern() : null;
        await this.cachePieces();
    }

    /**
     * Generate a 256x256 noise texture tile for the background
     */
    createNoisePattern() {
        const size = 256;
        const tile = document.createElement('canvas');
        tile.width = size;
        tile.height = size;
        const tCtx = tile.getContext('2d');
        const imageData = tCtx.createImageData(size, size);
        const data = imageData.data;

        const color = this.parseHexColor(this.backgroundColor);
        const baseR = color.r, baseG = color.g, baseB = color.b;

        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 16;
            data[i]     = Math.max(0, Math.min(255, baseR + noise));
            data[i + 1] = Math.max(0, Math.min(255, baseG + noise));
            data[i + 2] = Math.max(0, Math.min(255, baseB + noise));
            data[i + 3] = 255;
        }

        tCtx.putImageData(imageData, 0, 0);
        return this.ctx.createPattern(tile, 'repeat');
    }

    parseHexColor(value) {
        const match = /^#([0-9a-f]{6})$/i.exec(value);
        if (!match) return { r: 184, g: 176, b: 164 };
        const number = Number.parseInt(match[1], 16);
        return {
            r: (number >> 16) & 255,
            g: (number >> 8) & 255,
            b: number & 255
        };
    }

    /**
     * Cache rendered pieces for performance
     */
    async cachePieces() {
        for (const piece of this.pieces) {
            const cached = await this.renderPieceToCache(piece);
            this.pieceCache.set(piece.id, cached);
        }
    }

    /**
     * Render a single piece to OffscreenCanvas for caching
     */
    async renderPieceToCache(piece) {
        // Margin for tab protrusions (up to 30% of cross dimension)
        // plus shadow extent (blur + offset ~= 20px).
        const margin = Math.max(piece.width, piece.height) * 0.40 + 20;
        const logicalW = piece.width + margin * 2;
        const logicalH = piece.height + margin * 2;

        // Use exact integer backing dimensions for 1:1 pixel mapping
        const backingW = Math.round(logicalW * this.dpr);
        const backingH = Math.round(logicalH * this.dpr);

        const offscreen = document.createElement('canvas');
        offscreen.width = backingW;
        offscreen.height = backingH;

        const ctx = offscreen.getContext('2d');
        ctx.scale(this.dpr, this.dpr);

        ctx.save();
        ctx.translate(margin, margin);

        // 1. Drop shadow - cast from the Path2D shape only
        //    Fill the path with shadow enabled, then erase the solid fill
        //    using destination-out so only the shadow silhouette remains.
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#000';
        ctx.fill(piece.path2D);
        // Erase the solid fill, leaving only the shadow outside the shape
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fill(piece.path2D);
        ctx.globalCompositeOperation = 'source-over';

        // 2. Cardboard edge - thin, subtle
        ctx.strokeStyle = 'rgba(160, 145, 120, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke(piece.path2D);

        // 3. Clip to piece shape, draw image and multi-pass bevel
        ctx.save();
        ctx.clip(piece.path2D);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
            this.sourceImage,
            0, 0, this.sourceImage.width, this.sourceImage.height,
            -(piece.correctX - this.puzzleOffsetX), -(piece.correctY - this.puzzleOffsetY),
            this.puzzleWidth, this.puzzleHeight
        );

        // Multi-pass outer highlight (top-left, decreasing opacity)
        for (let pass = 0; pass < 3; pass++) {
            const offset = 0.5 + pass * 0.5;
            const alpha = 0.15 - pass * 0.04;
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 1.5 - pass * 0.3;
            ctx.save();
            ctx.translate(offset, offset);
            ctx.stroke(piece.path2D);
            ctx.restore();
        }

        // Multi-pass outer shadow (bottom-right, decreasing opacity)
        for (let pass = 0; pass < 3; pass++) {
            const offset = -(0.5 + pass * 0.5);
            const alpha = 0.10 - pass * 0.03;
            ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
            ctx.lineWidth = 1.5 - pass * 0.3;
            ctx.save();
            ctx.translate(offset, offset);
            ctx.stroke(piece.path2D);
            ctx.restore();
        }

        // Glossy edge shine using overlay composite
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 3;
        ctx.stroke(piece.path2D);
        ctx.restore();

        // Specular highlight gradient using soft-light composite
        ctx.save();
        ctx.globalCompositeOperation = 'soft-light';
        const grad = ctx.createLinearGradient(0, 0, piece.width, piece.height);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
        grad.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
        ctx.fillStyle = grad;
        ctx.fill(piece.path2D);
        ctx.restore();

        ctx.restore(); // end clip

        ctx.restore(); // end translate

        return {
            canvas: offscreen,
            offsetX: margin,
            offsetY: margin,
            logicalWidth: backingW / this.dpr,
            logicalHeight: backingH / this.dpr
        };
    }

    /**
     * Render all pieces to main canvas
     */
    render() {
        // Apply DPR transform for this frame
        this.ctx.save();
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // Clear canvas with textured background
        if (this.bgPattern) {
            this.ctx.fillStyle = this.bgPattern;
        } else {
            this.ctx.fillStyle = this.backgroundColor;
        }
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        // Sort pieces by z-index (tiebreak by id for consistent layering)
        const sortedPieces = [...this.pieces].sort((a, b) => a.zIndex - b.zIndex || a.id - b.id);

        // Render each piece
        for (const piece of sortedPieces) {
            this.renderPiece(piece);
        }

        // Completion animation: fade in clean image to hide piece outlines
        if (this.completionStartTime) {
            const elapsed = performance.now() - this.completionStartTime;
            this.completionProgress = Math.min(elapsed / this.completionDuration, 1);

            if (this.pieces.length > 0) {
                // Find where the assembled puzzle actually sits on the canvas
                const p = this.pieces[0];
                const imgX = p.currentX - (p.correctX - this.puzzleOffsetX);
                const imgY = p.currentY - (p.correctY - this.puzzleOffsetY);

                this.ctx.globalAlpha = this.completionProgress;
                this.ctx.imageSmoothingEnabled = true;
                this.ctx.imageSmoothingQuality = 'high';
                this.ctx.drawImage(
                    this.sourceImage,
                    0, 0, this.sourceImage.width, this.sourceImage.height,
                    imgX, imgY, this.puzzleWidth, this.puzzleHeight
                );
                this.ctx.globalAlpha = 1;
            }
        }

        // Restore to identity so hit-testing works in logical coords
        this.ctx.restore();
    }

    /**
     * Render a single piece
     */
    renderPiece(piece) {
        const cached = this.pieceCache.get(piece.id);
        if (!cached) return;

        this.ctx.save();

        // Draw cached canvas at exact backing-pixel position (no scaling)
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        const px = Math.round((piece.currentX - cached.offsetX) * this.dpr);
        const py = Math.round((piece.currentY - cached.offsetY) * this.dpr);

        // Subtle drop shadow when picked up
        if (piece.isSelected) {
            this.ctx.shadowColor = this.selectedShadowColor;
            this.ctx.shadowBlur = 14 * this.dpr;
            this.ctx.shadowOffsetX = 3 * this.dpr;
            this.ctx.shadowOffsetY = 4 * this.dpr;
        }

        this.ctx.drawImage(cached.canvas, px, py);

        this.ctx.restore();
    }

    /**
     * Start render loop
     */
    startRenderLoop() {
        if (this.isRendering) return;

        this.isRendering = true;

        const renderFrame = () => {
            if (!this.isRendering) return;

            this.render();
            this.animationFrameId = requestAnimationFrame(renderFrame);
        };

        renderFrame();
    }

    /**
     * Start the completion animation (fade out piece lines, reveal clean image)
     */
    startCompletionAnimation() {
        this.completionStartTime = performance.now();
    }

    /**
     * Stop render loop
     */
    stopRenderLoop() {
        this.isRendering = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Convert screen coordinates to logical canvas coordinates
     */
    screenToCanvas(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();

        return {
            x: (screenX - rect.left) * (this.canvasWidth / rect.width),
            y: (screenY - rect.top) * (this.canvasHeight / rect.height)
        };
    }

    /**
     * Find piece at screen coordinates
     */
    getPieceAtPoint(screenX, screenY) {
        const { x, y } = this.screenToCanvas(screenX, screenY);

        // Check pieces in reverse z-order (top to bottom, tiebreak by id)
        const sortedPieces = [...this.pieces].sort((a, b) => b.zIndex - a.zIndex || b.id - a.id);

        for (const piece of sortedPieces) {
            if (piece.hitTest(x, y, this.ctx)) {
                return piece;
            }
        }

        return null;
    }

    /**
     * Bring piece to front
     */
    bringPieceToFront(piece) {
        const maxZ = Math.max(...this.pieces.map(p => p.zIndex));
        piece.bringToFront(maxZ);
    }

    /**
     * Get current max z-index
     */
    getMaxZIndex() {
        return Math.max(...this.pieces.map(p => p.zIndex), 0);
    }

    /**
     * Resize canvas
     */
    resize(width, height) {
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.canvas.width = Math.ceil(width * this.dpr);
        this.canvas.height = Math.ceil(height * this.dpr);
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.render();
    }

    /**
     * Clear and reset board
     */
    clear() {
        this.stopRenderLoop();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.pieceCache.clear();
    }

    /**
     * Get canvas as data URL (for saving/sharing)
     */
    toDataURL() {
        return this.canvas.toDataURL('image/png');
    }

    /**
     * Check if all pieces are placed
     */
    isComplete() {
        return this.pieces.every(piece => piece.isPlaced);
    }

    /**
     * Get completion percentage
     */
    getCompletionPercentage() {
        const placedCount = this.pieces.filter(p => p.isPlaced).length;
        return Math.round((placedCount / this.pieces.length) * 100);
    }

    /**
     * Get number of pieces placed
     */
    getPlacedCount() {
        return this.pieces.filter(p => p.isPlaced).length;
    }
}
