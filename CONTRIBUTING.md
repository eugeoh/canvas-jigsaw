# Contributing

Thanks for helping improve `canvas-jigsaw`.

## Before You Start

- Search existing issues before opening a new one.
- Open an issue before a large API change or architectural rewrite.
- Keep the browser engine dependency-free unless a dependency has a clear, documented benefit.
- Keep product-specific UI and services outside the engine.

## Development

Requirements: Node.js 18 or newer.

```bash
npm install
npm test
npm run demo
```

The demo runs at <http://localhost:4173>.

## Pull Requests

1. Create a focused branch from `main`.
2. Add or update tests for behavior changes.
3. Run `npm test` and `npm run pack:check`.
4. Explain the user-visible behavior and any API compatibility impact.
5. Keep unrelated formatting and refactors out of the pull request.

Bug reports should include the browser, operating system, puzzle dimensions, image aspect ratio, and minimal reproduction steps. Security reports should follow [SECURITY.md](SECURITY.md).
