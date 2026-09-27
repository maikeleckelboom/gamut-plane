import type { ColorResult } from "../result.js";
import {
  isColorSpaceId,
  type ChannelsBySpace,
  type ColorRepresentation,
  type ColorSpaceId,
} from "./representation.js";
import { createColorValue, definitionOf, type ColorValue } from "./value.js";

export type SnapshotNumberV1 = number | "-0";
export type ColorSnapshotV1 = {
  [K in ColorSpaceId]: Readonly<{
    type: "gamut-plane/color";
    version: 1;
    space: K;
    channels: readonly [
      SnapshotNumberV1,
      SnapshotNumberV1,
      K extends "oklch" ? SnapshotNumberV1 | null : SnapshotNumberV1,
    ];
    alpha: SnapshotNumberV1;
  }>;
}[ColorSpaceId];
export type SnapshotError = Readonly<{
  code: "invalid-snapshot" | "unsupported-snapshot-version";
}>;

function encode(number: number): SnapshotNumberV1 {
  return Object.is(number, -0) ? "-0" : number;
}

function decode(input: unknown): number | null | undefined {
  if (input === null) return null;
  if (input === "-0") return -0;
  return typeof input === "number" && Number.isFinite(input) ? input : undefined;
}

function plainFields(input: unknown, fields: readonly string[]): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== fields.length ||
    !keys.every((key) => typeof key === "string" && fields.includes(key))
  )
    return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    return descriptor !== undefined && Object.hasOwn(descriptor, "value");
  });
}

export function snapshotColor(value: ColorValue): ColorSnapshotV1 {
  const definition = definitionOf(value);
  return {
    type: "gamut-plane/color",
    version: 1,
    space: definition.space,
    channels: definition.channels.map((part) =>
      part === null ? null : encode(part),
    ) as unknown as ColorSnapshotV1["channels"],
    alpha: encode(definition.alpha),
  } as ColorSnapshotV1;
}

export function restoreColor(snapshot: unknown): ColorResult<ColorValue, SnapshotError> {
  const invalid = { ok: false as const, error: { code: "invalid-snapshot" as const } };
  if (!plainFields(snapshot, ["type", "version", "space", "channels", "alpha"])) return invalid;
  if (snapshot.type !== "gamut-plane/color") return invalid;
  if (snapshot.version !== 1) {
    return typeof snapshot.version === "number" &&
      Number.isInteger(snapshot.version) &&
      snapshot.version > 1
      ? { ok: false, error: { code: "unsupported-snapshot-version" } }
      : invalid;
  }
  if (!isColorSpaceId(snapshot.space) || !Array.isArray(snapshot.channels)) return invalid;
  const channels: unknown[] = snapshot.channels;
  if (channels.length !== 3 || ![0, 1, 2].every((index) => Object.hasOwn(channels, index)))
    return invalid;
  if (Reflect.ownKeys(channels).length !== 4) return invalid;
  if (
    [0, 1, 2].some(
      (index) => !Object.hasOwn(Object.getOwnPropertyDescriptor(channels, index) ?? {}, "value"),
    )
  )
    return invalid;
  const decoded = channels.map(decode);
  const alpha = decode(snapshot.alpha);
  if (decoded.includes(undefined) || alpha === undefined || alpha === null) return invalid;
  const definition = {
    space: snapshot.space,
    channels: decoded as unknown as ChannelsBySpace[typeof snapshot.space],
    alpha,
  } as ColorRepresentation;
  const created = createColorValue(definition);
  return created.ok ? created : invalid;
}
