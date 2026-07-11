export interface PickerCssPoint {
  x: number;
  y: number;
}

export interface PickerCssSize {
  width: number;
  height: number;
}

export interface PickerMarkerGeometry {
  center: PickerCssPoint;
  radius: number;
}

export interface PlanarWarningPlacementInput {
  activeCenter: PickerCssPoint;
  surfaceSize: PickerCssSize;
  activeRadius: number;
  warningSize: PickerCssSize;
  preferredOffset: PickerCssPoint;
  surfaceInset: number;
  markerClearance: number;
  fallbackMarker?: PickerMarkerGeometry | null;
}

export interface PlanarWarningPlacement {
  left: number;
  top: number;
}

export interface SliderWarningPositionInput {
  position: number;
  trackWidth: number;
  thumbWidth: number;
  warningWidth: number;
  edgeClearance: number;
  markerGap: number;
  obstacleClearance: number;
  obstacles?: readonly SliderWarningObstacle[];
  preferredSide?: "left" | "right";
}

export interface SliderWarningObstacle {
  center: number;
  width: number;
}

export interface SliderWarningPosition {
  normalizedPosition: number;
  positionPercent: number;
  thumbOffset: number;
  side: "left" | "right";
  sideOffset: number;
  edge: number;
}

interface SliderWarningCandidate {
  side: "left" | "right";
  center: number;
  sideOffset: number;
  collisionCount: number;
  collisionOverlap: number;
}

interface PlacementBounds {
  minLeft: number;
  maxLeft: number;
  minTop: number;
  maxTop: number;
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
}

function assertNonNegative(name: string, value: number): void {
  assertFinite(name, value);
  if (value < 0) throw new RangeError(`${name} must be non-negative`);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function placementBounds(
  surfaceSize: PickerCssSize,
  warningSize: PickerCssSize,
  surfaceInset: number,
): PlacementBounds {
  assertNonNegative("surface width", surfaceSize.width);
  assertNonNegative("surface height", surfaceSize.height);
  assertNonNegative("warning width", warningSize.width);
  assertNonNegative("warning height", warningSize.height);
  assertNonNegative("surface inset", surfaceInset);

  if (warningSize.width > surfaceSize.width || warningSize.height > surfaceSize.height) {
    throw new RangeError("Warning dimensions must fit inside the picker surface");
  }

  const horizontalInset = Math.min(surfaceInset, (surfaceSize.width - warningSize.width) / 2);
  const verticalInset = Math.min(surfaceInset, (surfaceSize.height - warningSize.height) / 2);
  return {
    minLeft: horizontalInset,
    maxLeft: surfaceSize.width - warningSize.width - horizontalInset,
    minTop: verticalInset,
    maxTop: surfaceSize.height - warningSize.height - verticalInset,
  };
}

function topLeftFromOffset(
  activeCenter: PickerCssPoint,
  warningSize: PickerCssSize,
  offset: PickerCssPoint,
): PlanarWarningPlacement {
  return {
    left: activeCenter.x + offset.x - warningSize.width / 2,
    top: activeCenter.y + offset.y - warningSize.height / 2,
  };
}

function isWithinBounds(placement: PlanarWarningPlacement, bounds: PlacementBounds): boolean {
  return (
    placement.left >= bounds.minLeft &&
    placement.left <= bounds.maxLeft &&
    placement.top >= bounds.minTop &&
    placement.top <= bounds.maxTop
  );
}

function clampPlacement(
  placement: PlanarWarningPlacement,
  bounds: PlacementBounds,
): PlanarWarningPlacement {
  return {
    left: clamp(placement.left, bounds.minLeft, bounds.maxLeft),
    top: clamp(placement.top, bounds.minTop, bounds.maxTop),
  };
}

function overlapsMarker(
  placement: PlanarWarningPlacement,
  warningSize: PickerCssSize,
  marker: PickerMarkerGeometry,
  clearance: number,
): boolean {
  const nearestX = clamp(marker.center.x, placement.left, placement.left + warningSize.width);
  const nearestY = clamp(marker.center.y, placement.top, placement.top + warningSize.height);
  const deltaX = marker.center.x - nearestX;
  const deltaY = marker.center.y - nearestY;
  const minimumDistance = marker.radius + clearance;
  return deltaX * deltaX + deltaY * deltaY < minimumDistance * minimumDistance;
}

function isClearOfMarkers(
  placement: PlanarWarningPlacement,
  input: PlanarWarningPlacementInput,
  includeFallback: boolean,
): boolean {
  const activeMarker = { center: input.activeCenter, radius: input.activeRadius };
  if (overlapsMarker(placement, input.warningSize, activeMarker, input.markerClearance)) {
    return false;
  }
  return (
    !includeFallback ||
    !input.fallbackMarker ||
    !overlapsMarker(placement, input.warningSize, input.fallbackMarker, input.markerClearance)
  );
}

export function placePlanarWarning(input: PlanarWarningPlacementInput): PlanarWarningPlacement {
  assertFinite("active center x", input.activeCenter.x);
  assertFinite("active center y", input.activeCenter.y);
  assertFinite("preferred offset x", input.preferredOffset.x);
  assertFinite("preferred offset y", input.preferredOffset.y);
  assertNonNegative("active radius", input.activeRadius);
  assertNonNegative("marker clearance", input.markerClearance);
  if (input.fallbackMarker) {
    assertFinite("fallback center x", input.fallbackMarker.center.x);
    assertFinite("fallback center y", input.fallbackMarker.center.y);
    assertNonNegative("fallback radius", input.fallbackMarker.radius);
  }

  const bounds = placementBounds(input.surfaceSize, input.warningSize, input.surfaceInset);
  const offsets = [
    input.preferredOffset,
    { x: -input.preferredOffset.x, y: input.preferredOffset.y },
    { x: input.preferredOffset.x, y: -input.preferredOffset.y },
    { x: -input.preferredOffset.x, y: -input.preferredOffset.y },
  ];
  const candidates = offsets.map((offset) =>
    topLeftFromOffset(input.activeCenter, input.warningSize, offset),
  );

  const fitting =
    candidates.find(
      (candidate) => isWithinBounds(candidate, bounds) && isClearOfMarkers(candidate, input, true),
    ) ??
    candidates.find(
      (candidate) => isWithinBounds(candidate, bounds) && isClearOfMarkers(candidate, input, false),
    ) ??
    candidates.find((candidate) => isWithinBounds(candidate, bounds));
  if (fitting) return fitting;

  const clampedCandidates = candidates.map((candidate) => clampPlacement(candidate, bounds));
  return (
    clampedCandidates.find((candidate) => isClearOfMarkers(candidate, input, true)) ??
    clampedCandidates.find((candidate) => isClearOfMarkers(candidate, input, false)) ??
    clampedCandidates[0]!
  );
}

export function getSliderWarningPosition(input: SliderWarningPositionInput): SliderWarningPosition {
  assertFinite("slider position", input.position);
  assertNonNegative("slider track width", input.trackWidth);
  assertNonNegative("slider thumb width", input.thumbWidth);
  assertNonNegative("slider warning width", input.warningWidth);
  assertNonNegative("slider edge clearance", input.edgeClearance);
  assertNonNegative("slider marker gap", input.markerGap);
  assertNonNegative("slider obstacle clearance", input.obstacleClearance);
  for (const obstacle of input.obstacles ?? []) {
    assertFinite("slider obstacle center", obstacle.center);
    assertNonNegative("slider obstacle width", obstacle.width);
  }

  const normalizedPosition = clamp(input.position, 0, 1);
  const thumbOffset = input.thumbWidth * (0.5 - normalizedPosition);
  const thumbCenter = normalizedPosition * input.trackWidth + thumbOffset;
  const sideDistance = input.thumbWidth / 2 + input.warningWidth / 2 + input.markerGap;
  const preferredSide = input.preferredSide ?? "right";
  const sides = [preferredSide, preferredSide === "right" ? "left" : "right"] as const;
  const edge = input.warningWidth / 2 + input.edgeClearance;
  const candidates = sides.map((side): SliderWarningCandidate => {
    const sideOffset = side === "right" ? sideDistance : -sideDistance;
    const center = thumbCenter + sideOffset;
    const warningStart = center - input.warningWidth / 2 - input.obstacleClearance;
    const warningEnd = center + input.warningWidth / 2 + input.obstacleClearance;
    let collisionCount = center < edge || center > input.trackWidth - edge ? 1 : 0;
    let collisionOverlap =
      Math.max(0, edge - center) + Math.max(0, center - (input.trackWidth - edge));
    for (const obstacle of input.obstacles ?? []) {
      const obstacleStart = obstacle.center - obstacle.width / 2;
      const obstacleEnd = obstacle.center + obstacle.width / 2;
      const overlap = Math.min(warningEnd, obstacleEnd) - Math.max(warningStart, obstacleStart);
      if (overlap < 0) continue;
      collisionCount += 1;
      collisionOverlap += overlap;
    }
    return { side, center, sideOffset, collisionCount, collisionOverlap };
  });
  const candidate = [...candidates].sort(
    (left, right) =>
      left.collisionCount - right.collisionCount ||
      left.collisionOverlap - right.collisionOverlap ||
      sides.indexOf(left.side) - sides.indexOf(right.side),
  )[0]!;

  return {
    normalizedPosition,
    positionPercent: normalizedPosition * 100,
    thumbOffset,
    side: candidate.side,
    sideOffset: candidate.sideOffset,
    edge,
  };
}
