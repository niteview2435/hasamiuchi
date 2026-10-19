import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages のプロジェクトページ (/<repo>/) でもローカルでも
  // 動くよう相対パスで出力する。
  base: "./",
  test: {
    globals: true,
    environment: "node",
  },
});
