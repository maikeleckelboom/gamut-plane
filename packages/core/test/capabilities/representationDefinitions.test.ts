import { describe, expect, it } from "vitest";
import { representationDefinitions } from "../../src/capabilities/representationDefinitions.js";
import { represent } from "../../src/color/represent.js";
import {
  isRepresentation,
  type ColorRepresentation,
  type ColorSpaceId,
} from "../../src/color/representation.js";
import { createColorValue, definitionOf, definingEquals } from "../../src/color/value.js";
import type { ColorResult } from "../../src/result.js";

function value<T>(result: ColorResult<T, unknown>): T {
  if (!result.ok) throw new Error("fixture operation failed");
  return result.value;
}

const fixtures = {
  oklch: { space: "oklch", channels: [1.4, 0.7, 720], alpha: -0 },
  oklab: { space: "oklab", channels: [-0.2, 1.1, -0.8], alpha: 0.3 },
  srgb: { space: "srgb", channels: [-0.2, 0.5, 1.1], alpha: 0.6 },
  "display-p3": { space: "display-p3", channels: [1.2, -0.1, 0.4], alpha: 1 },
} as const satisfies { [S in ColorSpaceId]: ColorRepresentation<S> };

describe("internal representation and qualified channel definitions", () => {
  it("covers exactly four representations and twelve unique ordered tuple coordinates", () => {
    expect(Object.keys(representationDefinitions)).toEqual(Object.keys(fixtures));
    const ids = new Set<string>();
    for (const space of Object.keys(fixtures) as ColorSpaceId[]) {
      const definition = representationDefinitions[space];
      const fixture = fixtures[space];
      // Correlation is narrowed for callable author/observe members in the type proof.
      const source = value(createColorValue(fixture));
      const observed = value(represent(source, space));
      expect(definition.author).toBe(createColorValue);
      expect(definition.observe).toBe(represent);
      expect(definition.channels.map((channel) => channel.index)).toEqual([0, 1, 2]);
      for (const channel of definition.channels) {
        expect(channel.representationId).toBe(space);
        expect(channel.id).toBe(`${space}.${channel.symbol.toLowerCase()}`);
        expect(ids.has(channel.id)).toBe(false);
        ids.add(channel.id);
        expect(observed.channels[channel.index]).toBe(fixture.channels[channel.index]);
      }
      expect(observed).toEqual(fixture);
    }
    expect(ids.size).toBe(12);
  });

  it("describes finite authored domains separately from reference ranges", () => {
    for (const space of Object.keys(fixtures) as ColorSpaceId[]) {
      const definition = representationDefinitions[space];
      expect(isRepresentation(fixtures[space])).toBe(true);
      for (const channel of definition.channels) {
        expect(channel.domain).toEqual(
          channel.id === "oklch.c"
            ? { kind: "finite-lower-bound", minimum: 0 }
            : { kind: "finite" },
        );
        const hasReference = channel.symbol === "L" || definition.model === "rgb";
        expect(channel.nominalRange).toEqual(hasReference ? [0, 1] : null);
        expect(channel.unit).toBe(
          channel.id === "oklch.h"
            ? "degree"
            : definition.model === "rgb"
              ? "encoded-rgb"
              : "coordinate",
        );
        for (const invalid of [Infinity, -Infinity, Number.NaN]) {
          const channels: unknown[] = [...fixtures[space].channels];
          channels[channel.index] = invalid;
          expect(isRepresentation({ ...fixtures[space], channels })).toBe(false);
        }
        const channels: unknown[] = [...fixtures[space].channels];
        channels[channel.index] = null;
        expect(isRepresentation({ ...fixtures[space], channels })).toBe(false);
      }
    }
    expect(
      representationDefinitions.oklch.author({
        space: "oklch",
        channels: [0.5, -0.1, 20],
        alpha: 1,
      }),
    ).toEqual({ ok: false, error: { code: "invalid-definition" } });
    expect(
      representationDefinitions.oklch.author({
        space: "oklch",
        channels: [0.5, 0.1, null],
        alpha: 1,
      }),
    ).toEqual({ ok: false, error: { code: "invalid-definition" } });
  });

  it("retains raw periodic Hue and distinguishes missing from present powerless Hue", () => {
    const lch = representationDefinitions.oklch;
    const hue = lch.channels[2];
    expect(hue.cyclic).toEqual({ period: 360 });
    expect(hue.missing).toBe("oklch-neutral-hue");
    expect(hue.effect).toBe("oklch-hue-at-zero-chroma");
    const missing = value(lch.author({ space: lch.id, channels: [0.6, 0, null], alpha: -0 }));
    const zero = value(lch.author({ space: lch.id, channels: [0.6, 0, 0], alpha: -0 }));
    const periodic = value(lch.author({ space: lch.id, channels: [0.6, 0, 720], alpha: -0 }));
    expect(value(lch.observe(periodic, lch.id)).channels[2]).toBe(720);
    expect(value(lch.observe(missing, lch.id)).channels[2]).toBeNull();
    expect(definingEquals(missing, zero)).toBe(false);
    expect(definingEquals(periodic, zero)).toBe(false);
    expect(represent(periodic, "oklab")).toEqual(represent(missing, "oklab"));
    const chromatic = value(lch.author({ space: lch.id, channels: [0.6, 1e-12, 90], alpha: 1 }));
    expect(value(represent(chromatic, "oklab")).channels[2]).toBeGreaterThan(0);
    for (const definition of Object.values(representationDefinitions)) {
      for (const channel of definition.channels.filter((entry) => entry.id !== hue.id)) {
        expect(channel.missing).toBe("not-supported");
        expect(channel.effect).toBe("always-effective");
        expect(channel.cyclic).toBeNull();
      }
    }
  });

  it("preserves signed zero through construction and observation in every representation", () => {
    for (const space of Object.keys(fixtures) as ColorSpaceId[]) {
      const source = value(createColorValue({ space, channels: [-0, -0, -0], alpha: -0 }));
      const observed = value(represent(source, space));
      for (const channel of representationDefinitions[space].channels) {
        expect(Object.is(observed.channels[channel.index], -0)).toBe(true);
      }
      expect(Object.is(observed.alpha, -0)).toBe(true);
      expect(
        definingEquals(source, value(createColorValue({ space, channels: [0, 0, 0], alpha: -0 }))),
      ).toBe(false);
      expect(definitionOf(source)).toEqual(observed);
    }
  });

  it("freezes the shared definitions, ordered channels and nested fact data", () => {
    expect(Object.isFrozen(representationDefinitions)).toBe(true);
    for (const definition of Object.values(representationDefinitions)) {
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Object.isFrozen(definition.encoding)).toBe(true);
      expect(Object.isFrozen(definition.channels)).toBe(true);
      for (const channel of definition.channels) {
        expect(Object.isFrozen(channel)).toBe(true);
        expect(Object.isFrozen(channel.domain)).toBe(true);
        if (channel.nominalRange) expect(Object.isFrozen(channel.nominalRange)).toBe(true);
        if (channel.cyclic) expect(Object.isFrozen(channel.cyclic)).toBe(true);
      }
    }
  });
});
