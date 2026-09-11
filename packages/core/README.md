# @gamut-plane/core

Framework-neutral OKLab/OKLCH conversion, exact sRGB and Display P3 membership, CSS serialization, and plane geometry for Gamut Plane. ESM JavaScript and TypeScript declarations are built into `dist`.

This repository package is **not published to npm**. It is the explicit runtime dependency of `@gamut-plane/vue`; prerelease consumers install both local tarballs. It uses `@texel/color` for color conversion and parsing and has no Vue or browser dependency.

Build with `pnpm --filter @gamut-plane/core build` from the repository. See the [repository documentation](https://github.com/maikeleckelboom/gamut-plane#readme) for local development and packed-consumer validation. Node.js 24+ is the supported build and server runtime.

MIT licensed; see `LICENSE`.
