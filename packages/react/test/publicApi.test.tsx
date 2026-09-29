import { createRef, StrictMode, type ComponentPropsWithRef } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { snapshotColor, type ColorValue } from "@gamut-plane/core";
import * as publicApi from "../src/index.js";
import { GamutPlane, type GamutPlaneProps } from "../src/index.js";
import { color, editingState, get, initial, mount } from "./helpers.js";

describe("public instrument contract", () => {
  it.each([
    ["display-p3", null],
    ["srgb", "sRGB canvas"],
    ["unavailable", "canvas unavailable"],
  ] as const)(
    "shows a Canvas badge only for the exceptional %s state",
    async (capability, badge) => {
      const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext);
      const original = getContext.getMockImplementation()!;
      const context = document.createElement("canvas").getContext("2d")!;
      if (capability === "display-p3") {
        getContext.mockImplementation(
          () =>
            ({
              ...context,
              getContextAttributes: () => ({ colorSpace: "display-p3" }),
            }) as CanvasRenderingContext2D,
        );
      } else if (capability === "unavailable") {
        getContext.mockImplementation(() => null);
      }
      try {
        const ui = await mount(<GamutPlane value={initial} onValueChange={vi.fn()} />);
        expect(
          get(ui.element, "[data-render-color-space]").getAttribute("data-render-color-space"),
        ).toBe(capability);
        expect(ui.element.querySelector(".gpr-color-plane-render-mode")?.textContent ?? null).toBe(
          badge,
        );
      } finally {
        getContext.mockImplementation(original);
      }
    },
  );

  it("exposes only the closed component and intended public types", () => {
    expect(Object.keys(publicApi)).toEqual(["GamutPlane"]);
    expectTypeOf<GamutPlaneProps>()
      .toHaveProperty("ref")
      .toEqualTypeOf<ComponentPropsWithRef<"section">["ref"]>();
    expectTypeOf<GamutPlaneProps>().not.toHaveProperty("children");
    expectTypeOf<GamutPlaneProps>().not.toHaveProperty("defaultValue");
    expectTypeOf<GamutPlaneProps>().not.toHaveProperty("onChange");
    expectTypeOf<GamutPlaneProps>().not.toHaveProperty("onCommit");
    expectTypeOf<GamutPlaneProps>().not.toHaveProperty("onCapability");
    expectTypeOf<GamutPlaneProps["value"]>().toEqualTypeOf<ColorValue>();
    expectTypeOf<GamutPlaneProps["onValueChange"]>().toEqualTypeOf<(value: ColorValue) => void>();
    expectTypeOf<NonNullable<GamutPlaneProps["onValueCommit"]>>().toEqualTypeOf<
      (value: ColorValue) => void
    >();
  });
  it("merges native root props, ref, style, accent and legend while protecting semantics", async () => {
    const ref = createRef<HTMLElement>();
    const click = vi.fn();
    const change = vi.fn();
    const props = {
      value: initial,
      onValueChange: change,
      ref,
      id: "host-id",
      title: "Host title",
      className: "host-class",
      style: {
        marginTop: 7,
        "--gamut-plane-accent": "red",
        "--picker-active": "pink",
        "--gp-surface-0": "pink",
      },
      "data-host-extension": "yes",
      "data-plane-instrument": "wrong",
      "data-active-plane": "wrong",
      "aria-labelledby": "missing",
      "aria-hidden": true,
      children: "forbidden",
      dangerouslySetInnerHTML: { __html: "forbidden" },
      role: "button",
      onClick: click,
      legend: <button>Host legend</button>,
    };
    const { element } = await mount(<GamutPlane {...props} />);
    const root = get(element, "section");
    expect(ref.current).toBe(root);
    expect(root.id).toBe("host-id");
    expect(root.className).toBe("gamut-plane-react host-class");
    expect(root.style.marginTop).toBe("7px");
    expect(root.style.getPropertyValue("--gamut-plane-accent")).toBe("red");
    expect(root.style.getPropertyValue("--picker-active")).not.toBe("pink");
    expect(root.style.getPropertyValue("--gp-surface-0")).toBe("");
    expect(root.getAttribute("data-host-extension")).toBe("yes");
    expect(root.getAttribute("data-active-plane")).toBe("oklch");
    expect(root.getAttribute("aria-labelledby")).toBe(get(element, "h2").id);
    expect(root.hasAttribute("aria-hidden")).toBe(false);
    expect(root.hasAttribute("role")).toBe(false);
    expect(root.textContent).not.toContain("forbidden");
    get<HTMLButtonElement>(root, ".gpr-plane-instrument-field > button").click();
    expect(click).toHaveBeenCalledOnce();
    expect(change).not.toHaveBeenCalled();
  });
  it("keeps IDs distinct in independent generalized instances", async () => {
    const changes = vi.fn();
    const capability = vi.fn();
    const ui = await mount(
      <StrictMode>
        <GamutPlane value={initial} onValueChange={changes} onCanvasColorSpaceChange={capability} />
        <GamutPlane
          value={initial}
          onValueChange={changes}
          defaultState={{
            selection: { representationId: "oklab", editorId: "oklab-ab" },
            checkedGamuts: [],
            visibleGuides: [],
          }}
        />
      </StrictMode>,
    );
    const ids = [...ui.element.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const element of ui.element.querySelectorAll("*"))
      for (const attribute of ["for", "aria-labelledby", "aria-describedby"])
        for (const id of (element.getAttribute(attribute) ?? "").split(" ").filter(Boolean))
          expect(document.getElementById(id)).not.toBeNull();
    expect(changes).not.toHaveBeenCalled();
    expect(capability).toHaveBeenCalledExactlyOnceWith("srgb");
  });

  it.each(["oklch", "oklab"] as const)(
    "server renders the generalized %s editor without callbacks or mutation",
    (representationId) => {
      const callback = vi.fn();
      const value = color(0.62, 0.52, 45, 0.37);
      const html = renderToString(
        <GamutPlane
          value={value}
          onValueChange={callback}
          onValueCommit={callback}
          onCancel={callback}
          onCanvasColorSpaceChange={callback}
          defaultState={{
            ...editingState(representationId),
            checkedGamuts: ["srgb-gamut"],
            visibleGuides: ["srgb-boundary"],
          }}
          legend={<p>Guide legend</p>}
        />,
      );
      expect(html).toContain('data-render-color-space="pending"');
      expect(html).toContain('data-active-plane="' + representationId + '"');
      expect(html).toContain("Guide legend");
      expect(html).toContain('type="number"');
      expect(html).toContain("data-active-marker");
      expect(html).toContain('data-gamut-boundary="srgb"');
      expect(callback).not.toHaveBeenCalled();
      expect(snapshotColor(value).channels).toEqual([0.62, 0.52, 45]);
    },
  );
});
