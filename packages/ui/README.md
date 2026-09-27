# @gamut-plane/ui

Private framework-neutral authority for the current Gamut Plane instrument anatomy and presentation.
This package is an implementation dependency of the Vue and React adapters, not a supported
consumer entry point. Import the adapter package and its `./style.css` export instead.
`src/style.css` is the sole authored instrument sheet; each adapter copies its built bytes to
its existing `dist/style.css` export during package build.
