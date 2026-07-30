# Third-Party Notices

## Distributed runtime dependencies

The built Gamut Plane application contains code from these direct runtime dependencies:

| Package        | Version | License | Copyright / author          |
| -------------- | ------: | ------- | --------------------------- |
| `@texel/color` |  1.1.11 | MIT     | Matt DesLauriers            |
| `@vueuse/core` |  14.3.0 | MIT     | Anthony Fu and contributors |
| `vue`          |  3.5.39 | MIT     | Evan You and contributors   |

`@gamut-plane/core` is first-party workspace code and is not a third-party dependency.

The resolved production graph in `pnpm-lock.yaml` also includes Vue, VueUse, Babel parser support, CSS tooling, and small utilities under MIT, BSD-2-Clause, BSD-3-Clause, ISC, and Apache-2.0 licenses. Their package metadata and license texts remain available in the installed packages.

## Development and testing dependencies

Build, formatting, linting, type-checking, unit testing, DOM testing, and browser testing tools are not shipped as standalone runtime assets. Notable release-validation tools include:

| Package                | Version | License    | Purpose                               |
| ---------------------- | ------: | ---------- | ------------------------------------- |
| `@axe-core/playwright` |  4.12.1 | MPL-2.0    | Browser accessibility integration     |
| `axe-core`             |  4.12.1 | MPL-2.0    | Accessibility rules engine            |
| `@playwright/test`     |  1.61.1 | Apache-2.0 | Browser, production, and visual tests |

All development versions are pinned in `pnpm-lock.yaml`. The complete development graph includes additional packages under their respective licenses.

## Original project assets

The favicon, Open Graph image, documentation screenshot, interface source, generated gamut tables, and release documentation were created for Gamut Plane and are covered by the repository's MIT License. They contain no third-party fonts, icons, stock images, or copied interface artwork.

## Inventory method and limits

The production inventory is checked with:

```powershell
pnpm licenses list --prod
pnpm list --prod -r --depth Infinity
```

`pnpm licenses list --prod` reports the resolved package graph, not a tree-shaken statement of every byte retained by Vite. It may include peer or build-facing packages reachable from a runtime package even when bundling removes their code. The direct runtime table above and the inspected production artifact are therefore the authoritative concise notice for distributed application dependencies.

This notice does not replace or modify any third-party license. Complete license texts are distributed with the corresponding packages and remain available from their source repositories.
