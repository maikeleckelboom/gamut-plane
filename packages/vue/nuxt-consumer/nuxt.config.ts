export default defineNuxtConfig({
  css: ["@gamut-plane/vue/style.css"],
  devtools: { enabled: false },
  nitro: {
    preset: "node-server",
    prerender: {
      routes:
        process.env.npm_lifecycle_event === "generate"
          ? ["/", "/away", "/prerendered"]
          : ["/prerendered"],
    },
  },
});
