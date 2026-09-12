import { defineConfig } from "vite";

// host: true binds the dev server to the LAN (not just localhost) so Scott can
// open it from his phone on the same WiFi while building/testing, ahead of a
// real deploy.
export default defineConfig({
  server: {
    host: true,
  },
});
