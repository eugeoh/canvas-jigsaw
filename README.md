# canvas-jigsaw

A dependency-free browser jigsaw engine built on Canvas 2D. It generates organic interlocking pieces from shared Bezier seams and lets connected pieces move as rigid groups.

I built this after making my own puzzle site and finding that most open-source browser jigsaws were old, application-specific, or limited to rectangular tiles. The goal is a small, reusable engine for realistic jigsaw interactions without requiring a UI framework.

> This project is at an early `0.x` stage. The API is usable, but may change as the engine is tested in more applications and browsers.

## Features

- Image-backed jigsaw pieces generated at runtime
- Rectangular row and column layouts
- Seeded, repeatable piece geometry
- Relative snapping anywhere on the board
- Connected group dragging and cascading merges
- Pointer Events support for mouse, touch, and pen
- High-DPI rendering with cached piece canvases
- Importable and exportable puzzle state
- No runtime dependencies

## Quick Start

The package is not published to npm yet. Install directly from GitHub:

```bash
npm install github:eugeoh/canvas-jigsaw
```

```js
import { JigsawPuzzle } from 'canvas-jigsaw';

const puzzle = new JigsawPuzzle({
  canvas: document.querySelector('canvas'),
  image: '/photo.jpg',
  rows: 6,
  columns: 8,
  seed: 'my-puzzle',
  width: 1000,
  height: 700
});

puzzle.on('progress', ({ connected, total }) => {
  console.log(`${connected} / ${total}`);
});

puzzle.on('complete', () => {
  console.log('Solved');
});

await puzzle.initialize();
```

The canvas must have a visible CSS size, or you must pass `width` and `height`.

## API

### `new JigsawPuzzle(options)`

Required options:

| Option | Description |
| --- | --- |
| `canvas` | Target `HTMLCanvasElement` |
| `image` | Image URL or loaded `HTMLImageElement` |

Common options:

| Option | Default | Description |
| --- | ---: | --- |
| `rows` | `4` | Puzzle rows |
| `columns` | `4` | Puzzle columns |
| `seed` | dimensions | Repeatable geometry seed |
| `snapThreshold` | `0.15` | Snap distance as a fraction of piece width |
| `boardScale` | `0.55` | Fraction of available width used by the assembled image |
| `backgroundColor` | `#b8b0a4` | Canvas background |
| `backgroundNoise` | `true` | Enable generated texture |
| `autoStart` | `true` | Start rendering after initialization |

Methods:

- `initialize()`
- `start()` / `stop()`
- `shuffle()`
- `getProgress()`
- `exportState()` / `importState(state)`
- `on(event, callback)` / `off(event, callback)`
- `destroy()`

Events:

- `ready`
- `connect`
- `progress`
- `complete`
- `sound`, emitted with `{ type: 'snap' }`

## State Persistence

Storage is deliberately left to the host application:

```js
localStorage.setItem('puzzle', JSON.stringify(puzzle.exportState()));

const saved = localStorage.getItem('puzzle');
if (saved) puzzle.importState(saved);
```

Use the same image, dimensions, and seed when restoring state.

## Development

```bash
npm install
npm test
npm run demo
```

Then open <http://localhost:4173>.

The test suite uses Node's built-in test runner and has no third-party dependencies. See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and current areas where help is useful.

## Browser Support

Modern browsers with Canvas 2D, `Path2D`, ES modules, Pointer Events, and `requestAnimationFrame`.

## Project Scope

The engine owns piece generation, rendering, dragging, snapping, grouping, and serialization. Host applications remain responsible for image selection, persistence, audio playback, analytics, accounts, and product-specific UI.

## License

MIT
