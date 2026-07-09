export interface ScaleDisplayStep {
  step: string;
  css: string;
  fallbackCss: string;
  l: number;
  c: number;
  h: number;
  alpha: number;
  inSrgb: boolean;
  inDisplayP3: boolean;
  deltaC: number;
  wcagOnWhite: number;
  wcagOnBlack: number;
  apcaOnWhite: number;
  apcaOnBlack: number;
  provenance: "anchor" | "generated" | "pinned";
}

export interface ExportPayloads {
  css: string;
  tailwind: string;
  json: string;
  issues: string[];
  hash: string;
  policy: "srgb-safe" | "p3-expressive" | "dual";
}
