import { createRef, StrictMode, type ComponentPropsWithRef } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import { GamutPlane, type GamutPlaneProps } from "../src/index.js";
import { event, get, initial, mount } from "./helpers.js";

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
  it("initializes uncontrolled view only once and requests only actual changes", async () => {
    const changes = vi.fn(),
      commits = vi.fn(),
      views = vi.fn();
    const props = {
      value: initial,
      onValueChange: changes,
      onValueCommit: commits,
      onViewChange: views,
    };
    const ui = await mount(<GamutPlane {...props} defaultView="oklab" />);
    expect(get(ui.element, "section").dataset.activePlane).toBe("oklab");
    await ui.render(<GamutPlane {...props} defaultView="oklch" />);
    expect(get(ui.element, "section").dataset.activePlane).toBe("oklab");
    await event(get(ui.element, '[data-plane-option="oklab"]'), "click");
    expect(views).not.toHaveBeenCalled();
    await event(get(ui.element, '[data-plane-option="oklch"]'), "click");
    expect(views).toHaveBeenCalledExactlyOnceWith("oklch");
    expect(get(ui.element, "section").dataset.activePlane).toBe("oklch");
    expect(changes).not.toHaveBeenCalled();
    expect(commits).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "controlled view remains authoritative with callback %s",
    async (callback) => {
      const changes = vi.fn(),
        views = vi.fn();
      const props = {
        value: initial,
        onValueChange: changes,
        onViewChange: callback ? views : undefined,
      };
      const ui = await mount(<GamutPlane {...props} view="oklch" defaultView="oklab" />);
      await event(get(ui.element, '[data-plane-option="oklab"]'), "click");
      expect(get(ui.element, "section").dataset.activePlane).toBe("oklch");
      expect(views).toHaveBeenCalledTimes(callback ? 1 : 0);
      await ui.render(<GamutPlane {...props} view="oklab" />);
      expect(get(ui.element, "section").dataset.activePlane).toBe("oklab");
      expect(views).toHaveBeenCalledTimes(callback ? 1 : 0);
      expect(changes).not.toHaveBeenCalled();
    },
  );
  it.each(["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"])(
    "roves focus and wraps selection with %s",
    async (key) => {
      const changes = vi.fn(),
        commits = vi.fn();
      const ui = await mount(
        <GamutPlane value={initial} onValueChange={changes} onValueCommit={commits} />,
      );
      const first = get<HTMLButtonElement>(ui.element, '[data-plane-option="oklch"]'),
        second = get<HTMLButtonElement>(ui.element, '[data-plane-option="oklab"]');
      expect(first.tabIndex).toBe(0);
      expect(second.tabIndex).toBe(-1);
      await event(first, "keydown", { key });
      expect(document.activeElement).toBe(second);
      expect(second.tabIndex).toBe(0);
      expect(first.tabIndex).toBe(-1);
      await event(second, "keydown", { key });
      expect(document.activeElement).toBe(first);
      expect(first.tabIndex).toBe(0);
      expect(changes).not.toHaveBeenCalled();
      expect(commits).not.toHaveBeenCalled();
    },
  );
  it("defaults boundaries on and hides only the requested field visual and accessible path", async () => {
    const changes = vi.fn();
    const ui = await mount(<GamutPlane value={initial} onValueChange={changes} />);
    expect(ui.element.querySelectorAll("[data-gamut-boundary]")).toHaveLength(2);
    for (const showSrgbBoundary of [false, true]) {
      await ui.render(
        <GamutPlane
          value={initial}
          onValueChange={changes}
          showSrgbBoundary={showSrgbBoundary}
          showDisplayP3Boundary={false}
        />,
      );
      expect(ui.element.querySelectorAll('[data-gamut-boundary="srgb"]')).toHaveLength(
        showSrgbBoundary ? 1 : 0,
      );
      expect(ui.element.querySelectorAll('[data-gamut-boundary-hit="srgb"]')).toHaveLength(
        showSrgbBoundary ? 1 : 0,
      );
      expect(ui.element.querySelectorAll('[data-gamut-boundary="display-p3"]')).toHaveLength(0);
      expect(ui.element.querySelectorAll('[data-gamut-marker$="boundary-guide"]')).toHaveLength(0);
      expect(
        ui.element.querySelectorAll('[data-gamut-marker="srgb-boundary-projection"]'),
      ).toHaveLength(showSrgbBoundary ? 1 : 0);
      expect(ui.element.querySelectorAll("[data-boundary-guide]")).toHaveLength(2);
    }
    expect(changes).not.toHaveBeenCalled();
  });
  it("keeps target, visibility, authored color and lifecycle callbacks independent", async () => {
    const value = { l: 0.62, c: 0.42, h: 30, alpha: 1 };
    const changes = vi.fn(),
      commits = vi.fn(),
      cancels = vi.fn(),
      views = vi.fn();
    const ui = await mount(
      <GamutPlane
        value={value}
        onValueChange={changes}
        onValueCommit={commits}
        onCancel={cancels}
        onViewChange={views}
        boundaryTarget="srgb"
        showSrgbBoundary={false}
        showDisplayP3Boundary
      />,
    );
    expect(get(ui.element, "[data-boundary-target-result]").dataset.boundaryTarget).toBe("srgb");
    expect(ui.element.querySelector('[data-gamut-boundary="srgb"]')).toBeNull();
    expect(ui.element.querySelector('[data-gamut-range="srgb"]')).toBeNull();
    expect(ui.element.querySelector('[data-gamut-marker="srgb-boundary-guide"]')).toBeNull();
    expect(ui.element.querySelector('[data-gamut-marker="srgb-boundary-projection"]')).toBeNull();
    expect(ui.element.querySelector('[data-marker-role="target-boundary-projection"]')).toBeNull();
    expect(ui.element.querySelector(".gpr-color-plane-projection-connector")).toBeNull();

    await ui.render(
      <GamutPlane
        value={value}
        onValueChange={changes}
        onValueCommit={commits}
        onCancel={cancels}
        onViewChange={views}
        boundaryTarget="display-p3"
        showSrgbBoundary
        showDisplayP3Boundary={false}
      />,
    );
    expect(get(ui.element, "[data-boundary-target-result]").dataset.boundaryTarget).toBe(
      "display-p3",
    );
    expect(ui.element.querySelector('[data-gamut-boundary="display-p3"]')).toBeNull();
    expect(ui.element.querySelector('[data-gamut-range="display-p3"]')).toBeNull();
    expect(ui.element.querySelector('[data-gamut-marker="display-p3-boundary-guide"]')).toBeNull();
    expect(
      ui.element.querySelector('[data-gamut-marker="display-p3-boundary-projection"]'),
    ).toBeNull();
    expect(ui.element.querySelector('[data-marker-role="target-boundary-projection"]')).toBeNull();
    expect(ui.element.querySelector(".gpr-color-plane-projection-connector")).toBeNull();

    await ui.render(
      <GamutPlane
        value={value}
        onValueChange={changes}
        onValueCommit={commits}
        onCancel={cancels}
        onViewChange={views}
        boundaryTarget="display-p3"
        showSrgbBoundary={false}
        showDisplayP3Boundary={false}
      />,
    );
    expect(ui.element.querySelectorAll("[data-gamut-boundary]")).toHaveLength(0);
    expect(ui.element.querySelectorAll("[data-gamut-range]")).toHaveLength(0);
    expect(ui.element.querySelectorAll('[data-gamut-marker$="boundary-guide"]')).toHaveLength(0);
    expect(ui.element.querySelectorAll("[data-gamut-marker]")).toHaveLength(0);
    expect(ui.element.querySelector('[data-marker-role="target-boundary-projection"]')).toBeNull();
    expect(ui.element.querySelector(".gpr-color-plane-projection-connector")).toBeNull();
    expect(get(ui.element, "[data-boundary-target-result]").textContent).toContain(
      "Boundary guide C",
    );
    expect(value).toEqual({ l: 0.62, c: 0.42, h: 30, alpha: 1 });
    expect(changes).not.toHaveBeenCalled();
    expect(commits).not.toHaveBeenCalled();
    expect(cancels).not.toHaveBeenCalled();
    expect(views).not.toHaveBeenCalled();
  });
  it("resolves unique relationships in independent instances without lifecycle edits", async () => {
    const changes = vi.fn(),
      capability = vi.fn();
    const ui = await mount(
      <StrictMode>
        <GamutPlane value={initial} onValueChange={changes} onCanvasColorSpaceChange={capability} />
        <GamutPlane value={initial} onValueChange={changes} defaultView="oklab" />
      </StrictMode>,
    );
    const ids = [...ui.element.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const el of ui.element.querySelectorAll("*"))
      for (const attr of ["for", "aria-labelledby", "aria-describedby"])
        for (const id of (el.getAttribute(attr) ?? "").split(" ").filter(Boolean))
          expect(document.getElementById(id)).not.toBeNull();
    expect(changes).not.toHaveBeenCalled();
    expect(capability).toHaveBeenCalledExactlyOnceWith("srgb");
    await ui.unmount();
    expect(changes).not.toHaveBeenCalled();
    expect(capability).toHaveBeenCalledOnce();
  });
  it.each(["oklch", "oklab"] as const)(
    "server renders the complete %s shell without callbacks or mutation",
    (view) => {
      const callback = vi.fn();
      const value = Object.freeze({ ...initial, c: 0.52 });
      const html = renderToString(
        <GamutPlane
          value={value}
          onValueChange={callback}
          onValueCommit={callback}
          onCancel={callback}
          onCanvasColorSpaceChange={callback}
          defaultView={view}
          legend={<p>Boundary legend</p>}
        />,
      );
      expect(html).toContain('data-render-color-space="pending"');
      expect(html).toContain('data-active-plane="' + view + '"');
      expect(html).toContain("Boundary legend");
      expect(html).toContain("Boundary details");
      expect(html).toContain('type="number"');
      expect(html).toContain('type="range"');
      expect(html).toContain("data-active-marker");
      expect(html).toContain('data-gamut-boundary="srgb"');
      expect(callback).not.toHaveBeenCalled();
      expect(value).toEqual({ ...initial, c: 0.52 });
    },
  );
});
