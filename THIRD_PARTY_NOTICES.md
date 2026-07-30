# Third-Party Notices

This repository retains the following direct runtime dependencies:

| Package        | Version | License | Copyright / author          |
| -------------- | ------: | ------- | --------------------------- |
| `@texel/color` |  1.1.11 | MIT     | Matt DesLauriers            |
| `@vueuse/core` |  14.3.0 | MIT     | Anthony Fu and contributors |
| `vue`          |  3.5.39 | MIT     | Evan You and contributors   |

Their transitive runtime graph, recorded exactly in `pnpm-lock.yaml`, also includes software under MIT, BSD-2-Clause, BSD-3-Clause, ISC, and Apache-2.0 licenses. Package versions and license identifiers were verified from the installed package metadata with `pnpm licenses list --prod`.

Build, type-check, formatting, linting, unit-test, DOM-test, and browser-test dependencies are development tools and are likewise pinned in `pnpm-lock.yaml`. No third-party fonts, icons, images, or copied interface assets are shipped by the application.

The complete license text for each dependency is distributed with its package. This notice does not modify the terms of any third-party license.
