/** Unsupported internal standalone-experiment route. No GPU or browser allocation. */
export { generateBoundaryMesh, quantizeBoundaryPositions } from "./boundaryMesh.js";
export type { BoundaryMesh, KnotDistribution } from "./boundaryMesh.js";
export {
  generateRadialBoundaryMesh,
  MAX_RADIAL_SUBDIVISIONS,
  SPATIAL_RADIAL_GENERATOR_REVISION,
} from "./radialBoundaryMesh.js";
export { spatialColorDefinition } from "@gamut-plane/core/internal/capabilities";
