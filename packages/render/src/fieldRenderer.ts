import {
  serializeOklchSample,
  type OklchSample,
  type PickerPlaneFieldSampler,
  type PickerPlaneSampleScratch,
  type PlanePoint,
} from "@gamut-plane/core";
import { serializeNativeRgbSample, type NativeRgbFieldSampler } from "./rgbField.js";
import { FIT_SAMPLE_WINDOW, type FieldSampleWindow } from "./viewport/math.js";

/** The context actually granted by the browser, not the display hardware. */
export type CanvasColorSpaceStatus = "pending" | "display-p3" | "srgb" | "unavailable";
export type RenderedFieldQuality = "full" | "preview";
export interface FieldRenderInput {
  plane: PickerPlaneFieldSampler | NativeRgbFieldSampler;
  /** Geometry/sampler identity, independent of representation-named legacy plane IDs. */
  fieldId: string;
  fixed: number;
  pixelRatio: number;
  interactionPreview: boolean;
  /**
   * The part of the normalized field the canvas shows. The backing store stays the size of the
   * visible viewport; magnification resamples the window, never a zoom-expanded field.
   * Omitted means the whole field.
   */
  window?: FieldSampleWindow | undefined;
}
export interface FieldRenderer {
  draw(input: FieldRenderInput): RenderedFieldQuality;
  dispose(): void;
}

/** The sampler/geometry identity is part of the cache even when representation and axis agree. */
export function fieldCacheKey(
  input: FieldRenderInput,
  size: Readonly<{ width: number; height: number; pixelRatio: number }>,
  colorSpace: CanvasColorSpaceStatus,
  quality: RenderedFieldQuality,
): string {
  const view = input.window ?? FIT_SAMPLE_WINDOW;
  return `${input.fieldId}:${input.plane.id}:${size.width}:${size.height}:${size.pixelRatio}:${input.fixed}:${colorSpace}:${quality}:${view.left}:${view.top}:${view.width}:${view.height}`;
}

/** Create in committed lifecycle setup. Drawing is synchronous; adapters own scheduling. */
export function createFieldRenderer(
  element: HTMLCanvasElement,
  onCapability: (status: CanvasColorSpaceStatus) => void,
): FieldRenderer {
  const INTERACTION_PREVIEW_COLUMN_SAMPLES = 192;
  let context: CanvasRenderingContext2D | null = null;
  let discFieldBuffer: HTMLCanvasElement | null = null;
  let discFieldContext: CanvasRenderingContext2D | null = null;
  let columnPreviewBuffer: HTMLCanvasElement | null = null;
  let columnPreviewContext: CanvasRenderingContext2D | null = null;
  let plane: FieldRenderInput["plane"];
  let canvasColorSpace: CanvasColorSpaceStatus = "pending";
  let lastFieldKey = "";
  let quality: RenderedFieldQuality = "full";
  let disposed = false;
  const fieldScratch: PickerPlaneSampleScratch = { input: [0, 0, 0], converted: [0, 0, 0] };
  function sampleCss(point: PlanePoint, fixed: number, color: OklchSample): string {
    if ("sampleKind" in plane) return serializeNativeRgbSample(plane.sampleField(point, fixed));
    plane.sampleField(point, fixed, color, fieldScratch);
    return serializeOklchSample(color);
  }
  function publishCanvasColorSpace(status: CanvasColorSpaceStatus): void {
    if (status === canvasColorSpace) return;
    canvasColorSpace = status;
    onCapability(status);
  }
  function getCanvasContext(element: HTMLCanvasElement): CanvasRenderingContext2D | null {
    try {
      const requested = element.getContext("2d", {
        alpha: false,
        colorSpace: "display-p3",
      });
      if (requested) return requested;
    } catch {
      // The default context below provides deterministic sRGB rendering.
    }

    try {
      return element.getContext("2d", { alpha: false });
    } catch {
      return null;
    }
  }

  function getDiscFieldContext(size: number): CanvasRenderingContext2D | null {
    discFieldBuffer ??= document.createElement("canvas");
    if (discFieldBuffer.width !== size || discFieldBuffer.height !== size) {
      discFieldBuffer.width = size;
      discFieldBuffer.height = size;
    }
    discFieldContext ??= getCanvasContext(discFieldBuffer);
    return discFieldContext;
  }

  function getColumnPreviewContext(width: number, height: number): CanvasRenderingContext2D | null {
    columnPreviewBuffer ??= document.createElement("canvas");
    if (columnPreviewBuffer.width !== width || columnPreviewBuffer.height !== height) {
      columnPreviewBuffer.width = width;
      columnPreviewBuffer.height = height;
    }
    columnPreviewContext ??= getCanvasContext(columnPreviewBuffer);
    return columnPreviewContext;
  }

  function drawColumnGradientField(
    target: CanvasRenderingContext2D,
    targetHeight: number,
    sampleCount: number,
    sampleScale: number,
    logicalHeight: number,
    fixed: number,
    color: OklchSample,
    view: FieldSampleWindow,
  ): void {
    const sampling = plane.fieldSampling;
    if (sampling.kind !== "column-gradient") return;
    const rowCount = Math.ceil(logicalHeight / sampling.rowStep) + 1;

    for (let column = 0; column < sampleCount; column += 1) {
      const gradient = target.createLinearGradient(0, 0, 0, targetHeight);
      // Viewport position first, then the camera window: sampling stays in field coordinates.
      const x = view.left + (column / Math.max(1, sampleCount - 1)) * view.width;

      for (let index = 0; index < rowCount; index += 1) {
        const row = Math.min(index * sampling.rowStep, logicalHeight);
        gradient.addColorStop(
          row / logicalHeight,
          sampleCss({ x, y: view.top + (row / logicalHeight) * view.height }, fixed, color),
        );
      }

      target.fillStyle = gradient;
      const start = Math.round(column * sampleScale);
      const end = Math.round((column + 1) * sampleScale);
      target.fillRect(start, 0, Math.max(1, end - start), targetHeight);
    }
  }

  function resizeCanvas(
    element: HTMLCanvasElement,
    requestedPixelRatio: number,
  ): {
    width: number;
    height: number;
    backingWidth: number;
    backingHeight: number;
    pixelRatio: number;
  } {
    const bounds = element.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const activePixelRatio = Math.max(1, requestedPixelRatio || 1);
    const backingWidth = Math.round(width * activePixelRatio);
    const backingHeight = Math.round(height * activePixelRatio);

    if (element.width !== backingWidth || element.height !== backingHeight) {
      element.width = backingWidth;
      element.height = backingHeight;
    }
    return { width, height, backingWidth, backingHeight, pixelRatio: activePixelRatio };
  }

  function draw(input: FieldRenderInput): RenderedFieldQuality {
    if (disposed) return quality;
    plane = input.plane;
    if (!context) {
      context = getCanvasContext(element);
      // Capability describes the visible canvas, never an auxiliary buffer.
      publishCanvasColorSpace(
        context
          ? context.getContextAttributes?.().colorSpace === "display-p3"
            ? "display-p3"
            : "srgb"
          : "unavailable",
      );
    }
    if (!context) return quality;

    const { width, height, backingWidth, backingHeight, pixelRatio } = resizeCanvas(
      element,
      input.pixelRatio,
    );
    const fixed = input.fixed;
    const view = input.window ?? FIT_SAMPLE_WINDOW;
    const sampling = plane.fieldSampling;
    const usePreview =
      sampling.kind === "column-gradient" &&
      input.interactionPreview &&
      width > INTERACTION_PREVIEW_COLUMN_SAMPLES;
    // Resolve optional preview resources before clearing the field or choosing its cache key.
    // If allocation fails, the existing full-width algorithm remains available.
    const previewContext = usePreview
      ? getColumnPreviewContext(INTERACTION_PREVIEW_COLUMN_SAMPLES, backingHeight)
      : null;
    const fieldQuality: RenderedFieldQuality = previewContext ? "preview" : "full";
    const fieldKey = fieldCacheKey(
      input,
      { width, height, pixelRatio },
      canvasColorSpace,
      fieldQuality,
    );
    if (fieldKey === lastFieldKey) return quality;

    const color: OklchSample = { l: 0, c: 0, h: 0, alpha: 1 };
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, backingWidth, backingHeight);

    if (sampling.kind === "column-gradient") {
      if (previewContext && columnPreviewBuffer) {
        previewContext.setTransform(1, 0, 0, 1, 0, 0);
        previewContext.clearRect(0, 0, INTERACTION_PREVIEW_COLUMN_SAMPLES, backingHeight);
        drawColumnGradientField(
          previewContext,
          backingHeight,
          INTERACTION_PREVIEW_COLUMN_SAMPLES,
          1,
          height,
          fixed,
          color,
          view,
        );
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(columnPreviewBuffer, 0, 0, backingWidth, backingHeight);
      } else {
        drawColumnGradientField(
          context,
          backingHeight,
          width,
          pixelRatio,
          height,
          fixed,
          color,
          view,
        );
      }
    } else {
      const { rowCount, columnSamples } = sampling;
      const bufferContext = getDiscFieldContext(rowCount);
      if (!bufferContext || !discFieldBuffer) return quality;
      bufferContext.setTransform(1, 0, 0, 1, 0, 0);
      bufferContext.clearRect(0, 0, rowCount, rowCount);

      for (let row = 0; row < rowCount; row += 1) {
        const y = view.top + ((row + 0.5) / rowCount) * view.height;
        const gradient = bufferContext.createLinearGradient(0, 0, rowCount, 0);

        for (let column = 0; column < columnSamples; column += 1) {
          const position = column / (columnSamples - 1);
          gradient.addColorStop(
            position,
            sampleCss({ x: view.left + position * view.width, y }, fixed, color),
          );
        }

        bufferContext.fillStyle = gradient;
        bufferContext.fillRect(0, row, rowCount, 1);
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(discFieldBuffer, 0, 0, backingWidth, backingHeight);
    }

    lastFieldKey = fieldKey;
    quality = fieldQuality;
    return quality;
  }

  return {
    draw,
    dispose() {
      disposed = true;
      context = null;
      discFieldContext = null;
      columnPreviewContext = null;
      discFieldBuffer = null;
      columnPreviewBuffer = null;
    },
  };
}
