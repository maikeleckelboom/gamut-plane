import {
  representationDefinitions,
  type ChannelDefinition,
  type ChannelId,
  type RepresentationDefinition,
} from "../../src/capabilities/representationDefinitions.js";
import type { ChannelsBySpace } from "../../src/color/representation.js";
import type { ColorValue } from "../../src/color/value.js";

declare const color: ColorValue;
declare const definition: RepresentationDefinition;
const lch = representationDefinitions.oklch;
const observed = lch.observe(color, lch.id);
if (observed.ok) {
  const tuple: ChannelsBySpace["oklch"] = observed.value.channels;
  lch.author({ space: lch.id, channels: tuple, alpha: 1 });
}
if (definition.id === "srgb") {
  definition.author({ space: definition.id, channels: [1.2, -0.2, 0], alpha: 1 });
}
// @ts-expect-error definition authorship retains its representation
lch.author({ space: "oklab", channels: [0.5, 0.2, 0.1], alpha: 1 });
// @ts-expect-error observation is bound to the representation
lch.observe(color, "oklab");
// @ts-expect-error RGB tuples do not support missing coordinates
representationDefinitions.srgb.author({ space: "srgb", channels: [0, 0, null], alpha: 1 });
// @ts-expect-error a same-symbol channel from another representation is incompatible
const wrongChannel: ChannelDefinition<"srgb", 2> =
  representationDefinitions["display-p3"].channels[2];
// @ts-expect-error tuple index and identity are correlated
const wrongIndex: ChannelDefinition<"oklch", 0> = lch.channels[1];
const wrongTuple: RepresentationDefinition<"oklch">["channels"] = [
  // @ts-expect-error scientific tuple order cannot swap channels
  lch.channels[1],
  // @ts-expect-error scientific tuple order cannot swap channels
  lch.channels[0],
  lch.channels[2],
];
// @ts-expect-error only the twelve existing coordinates have IDs
const extraChannel: ChannelId = "oklab.h";
// @ts-expect-error internal definitions remain readonly
lch.channels[0].index = 1;
void [wrongChannel, wrongIndex, wrongTuple, extraChannel];
