import { PuzzleGenerator } from './core/PuzzleGenerator.js';
import { SnapHandler } from './core/SnapHandler.js';
import { exportPuzzleState, importPuzzleState } from './core/PuzzleState.js';
import { DragHandler } from './input/DragHandler.js';
import { PuzzleBoard } from './rendering/PuzzleBoard.js';
import { ImageLoader } from './utils/ImageLoader.js';

const DEFAULTS = {
    rows: 4,
    columns: 4,
    snapThreshold: 0.15,
    boardScale: 0.55,
    padding: 24,
    backgroundColor: '#b8b0a4',
    backgroundNoise: true,
    autoStart: true
};

export class JigsawPuzzle {
    constructor(options) {
        if (!options?.canvas) {
            throw new TypeError('JigsawPuzzle requires a canvas');
        }
        if (!options.image) {
            throw new TypeError('JigsawPuzzle requires an image URL or HTMLImageElement');
        }

        this.options = { ...DEFAULTS, ...options };
        if (!Number.isInteger(this.options.rows) || this.options.rows < 2) {
            throw new TypeError('rows must be an integer greater than 1');
        }
        if (!Number.isInteger(this.options.columns) || this.options.columns < 2) {
            throw new TypeError('columns must be an integer greater than 1');
        }
        this.canvas = options.canvas;
        this.imageLoader = new ImageLoader();
        this.events = new Map();
        this.image = null;
        this.generator = null;
        this.board = null;
        this.snapHandler = null;
        this.dragHandler = null;
        this.pieces = [];
        this.initialized = false;
        this.completed = false;
    }

    async initialize() {
        if (this.initialized) return this;

        this.image = typeof this.options.image === 'string'
            ? await this.imageLoader.loadImage(this.options.image, this.options.crossOrigin ?? 'anonymous')
            : this.options.image;

        const dimensions = this.calculateDimensions();
        this.generator = new PuzzleGenerator({
            puzzleWidth: dimensions.puzzleWidth,
            puzzleHeight: dimensions.puzzleHeight,
            rows: this.options.rows,
            columns: this.options.columns,
            canvasWidth: dimensions.canvasWidth,
            canvasHeight: dimensions.canvasHeight,
            puzzleOffsetX: dimensions.puzzleOffsetX,
            puzzleOffsetY: dimensions.puzzleOffsetY,
            seed: this.options.seed,
            random: this.options.random
        });
        this.pieces = this.generator.generate();

        this.board = new PuzzleBoard(
            this.canvas,
            this.image,
            this.pieces,
            dimensions,
            {
                backgroundColor: this.options.backgroundColor,
                backgroundNoise: this.options.backgroundNoise,
                selectedShadowColor: this.options.selectedShadowColor
            }
        );
        await this.board.init();

        this.snapHandler = new SnapHandler(this.pieces, this.options.snapThreshold);
        this.snapHandler.onSnap((piece) => this.handleSnap(piece));
        this.dragHandler = new DragHandler(this.board, this.snapHandler, {
            onSnap: (piece) => this.emit('sound', { type: 'snap', piece })
        });

        this.initialized = true;
        if (this.options.autoStart) this.start();
        this.emit('ready', this.getProgress());
        return this;
    }

    calculateDimensions() {
        const padding = this.options.padding;
        const canvasWidth = this.options.width
            || this.canvas.clientWidth
            || this.canvas.parentElement?.clientWidth
            || 900;
        const canvasHeight = this.options.height
            || this.canvas.clientHeight
            || this.canvas.parentElement?.clientHeight
            || 600;
        const availableWidth = Math.max(canvasWidth - padding * 2, 1);
        const availableHeight = Math.max(canvasHeight - padding * 2, 1);
        const aspect = this.image.naturalWidth / this.image.naturalHeight
            || this.image.width / this.image.height;

        let puzzleWidth = availableWidth * this.options.boardScale;
        let puzzleHeight = puzzleWidth / aspect;
        if (puzzleHeight > availableHeight * 0.9) {
            puzzleHeight = availableHeight * 0.9;
            puzzleWidth = puzzleHeight * aspect;
        }

        return {
            canvasWidth,
            canvasHeight,
            puzzleWidth,
            puzzleHeight,
            puzzleOffsetX: (canvasWidth - puzzleWidth) / 2,
            puzzleOffsetY: (canvasHeight - puzzleHeight) / 2
        };
    }

    handleSnap(piece) {
        const progress = this.getProgress();
        this.emit('connect', { piece, progress });
        this.emit('progress', progress);

        if (progress.isComplete && !this.completed) {
            this.completed = true;
            this.dragHandler.setEnabled(false);
            this.board.startCompletionAnimation();
            this.emit('complete', progress);
        }
    }

    start() {
        this.assertInitialized();
        this.board.startRenderLoop();
        return this;
    }

    stop() {
        if (this.board) this.board.stopRenderLoop();
        return this;
    }

    shuffle() {
        this.assertInitialized();
        this.snapHandler.resetAll();
        this.generator.randomizePositions();
        this.completed = false;
        this.dragHandler.setEnabled(true);
        this.board.completionStartTime = null;
        this.emit('progress', this.getProgress());
        return this;
    }

    getProgress() {
        if (!this.snapHandler) {
            return { connected: 0, total: 0, percentage: 0, isComplete: false };
        }
        const stats = this.snapHandler.getStats();
        return {
            connected: stats.placed,
            total: stats.total,
            percentage: stats.percentage,
            isComplete: stats.isComplete
        };
    }

    exportState() {
        this.assertInitialized();
        return exportPuzzleState(this.pieces, {
            rows: this.options.rows,
            columns: this.options.columns,
            seed: this.options.seed ?? null
        });
    }

    importState(state) {
        this.assertInitialized();
        const parsed = typeof state === 'string' ? JSON.parse(state) : state;
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.pieces)) {
            throw new Error('Unsupported or invalid puzzle state');
        }

        const metadata = parsed.metadata || {};

        if (metadata.rows !== this.options.rows || metadata.columns !== this.options.columns) {
            throw new Error('Saved state dimensions do not match this puzzle');
        }
        if (metadata.seed !== null
            && metadata.seed !== undefined
            && metadata.seed !== this.options.seed) {
            throw new Error('Saved state seed does not match this puzzle');
        }

        importPuzzleState(this.pieces, parsed);
        this.completed = this.snapHandler.isComplete();
        this.dragHandler.setEnabled(!this.completed);
        this.emit('progress', this.getProgress());
        return this;
    }

    on(eventName, callback) {
        if (!this.events.has(eventName)) this.events.set(eventName, new Set());
        this.events.get(eventName).add(callback);
        return () => this.off(eventName, callback);
    }

    off(eventName, callback) {
        this.events.get(eventName)?.delete(callback);
        return this;
    }

    emit(eventName, payload) {
        for (const callback of this.events.get(eventName) || []) {
            callback(payload);
        }
    }

    assertInitialized() {
        if (!this.initialized) {
            throw new Error('Call initialize() before using the puzzle');
        }
    }

    destroy() {
        this.dragHandler?.destroy();
        this.snapHandler?.clearCallbacks();
        this.board?.clear();
        this.events.clear();
        this.imageLoader.clearCache();
        this.initialized = false;
    }
}
