# OKLab planar picker measurement

## Scope

The OKLab field samples canonical OKLCH through the engine's OKLab projection adapter. Rendering stays synchronous and uses 80 rows with 24 canonical samples per row (1,920 samples). A reusable 80 × 80 color buffer interpolates each row, then high-quality canvas upscaling smooths the complete square field. Outside-disc samples remain uninterrupted, truthful OKLab color evidence. A neutral one-pixel circle marks the editable domain; pointer and keyboard edits still project to its C = 0.4 boundary.

## Environment

- Codex in-app Chromium browser on Windows
- Vite development server
- device pixel ratio 1.5
- 414.7 CSS px field, 623 × 623 backing canvas

## Results

- initial buffered render: 7.5 ms
- fixed-L buffered redraw, six samples: 7.4–9.7 ms, median approximately 7.85 ms
- RAF scheduling through completed fixed-L buffered draw, six samples: 21.9–27.1 ms, median approximately 25.45 ms; this includes waiting for the next animation frame
- a/b pointer movement: zero field redraw cost because the fixed-L slice remains valid; marker and canonical updates retain the existing RAF path

The first measured 96 × 96 per-cell implementation took 49.3 ms on a 414.7 CSS px field. A 128-row × 32-sample row-gradient pass took 28.1 ms. Reducing the deterministic lattice to 80 × 24 brought a direct-row pass to 13.1 ms, but its perimeter remained visibly stepped. The final reusable-buffer pass removes that artifact while retaining the complete disc boundary and explicit non-domain corner treatment.

## Worker decision

Worker escalation was not justified after the rasterization change. The measured bottleneck was thousands of canvas style and fill calls, not the OKLab-to-canonical conversion. The final synchronous draw itself remains below 10 ms in the measured environment. Moving it to a worker would not remove the intentional wait for the next animation frame, while a/b pointer movement does not invalidate the field at all.
