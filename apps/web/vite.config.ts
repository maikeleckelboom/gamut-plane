import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin, type UserConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

function resolvePublicSiteUrl(value: string | undefined): URL | null {
  if (!value) return null;

  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new TypeError("VITE_PUBLIC_SITE_URL must use http or https");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError(
      "VITE_PUBLIC_SITE_URL must not contain credentials, a query string, or a fragment",
    );
  }
  return url;
}

function publicMetadata(publicSiteUrl: URL | null): Plugin {
  return {
    name: "gamut-plane-public-metadata",
    transformIndexHtml() {
      if (!publicSiteUrl) return [];

      const siteUrl = publicSiteUrl.href.replace(/\/$/, "");
      const socialImageUrl = new URL("og/gamut-plane.png", `${siteUrl}/`).href;
      const tags: HtmlTagDescriptor[] = [
        {
          tag: "meta",
          attrs: { property: "og:url", content: siteUrl },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { property: "og:image", content: socialImageUrl },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: socialImageUrl },
          injectTo: "head",
        },
      ];
      return tags;
    },
  };
}

export function createViteConfig(mode: string): UserConfig {
  const environment = loadEnv(mode, process.cwd(), "VITE_");
  const publicSiteUrl = resolvePublicSiteUrl(environment.VITE_PUBLIC_SITE_URL);

  return {
    plugins: [vue(), publicMetadata(publicSiteUrl)],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
}

export default defineConfig(({ mode }) => createViteConfig(mode));
