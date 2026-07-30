# Provenance

Gamut Plane began as a clean-room extraction from a larger private application workspace. The retained code was reorganized around a standalone color-domain core and a runnable Vue instrument.

This repository contains only the generic coordinate-plane color tooling needed for that instrument. Application-specific provenance, scale, theme, proof, export, route, sharing, persistence, telemetry, and shell behavior were excluded.

The remaining implementation is not presented as a package copied from an external public project. The local Git history is the record of this standalone repository. Third-party runtime and development packages remain under their own licenses and are identified by the lockfile and [Third-Party Notices](../THIRD_PARTY_NOTICES.md).

No retained code, documentation, or interface copy claims ownership by or dependency on the earlier application. Future contributions should continue to use neutral color-domain terminology and should not recreate excluded product contracts through aliases or compatibility layers.
