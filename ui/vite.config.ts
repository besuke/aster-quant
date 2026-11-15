import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// R の API（server/server.R）は 127.0.0.1:8790 で待ち受ける。画面は自分のオリジンの /api/* を呼び、Vite が転送する。
const apiTarget = process.env.QUANTLET_API_URL ?? "http://127.0.0.1:8790";
const proxy = { "/api": { target: apiTarget, changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 8091, strictPort: true, proxy },
  preview: { host: "127.0.0.1", port: 8091, strictPort: true, proxy },
});
