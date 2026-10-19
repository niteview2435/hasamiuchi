import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages のプロジェクトページ (/<repo>/) でもローカルでも
  // 動くよう相対パスで出力する。
  base: "./",
  test: {
    globals: true,
    environment: "node",
    // .direnv(flake インプットの nixpkgs など)を拾わないよう src に限定する
    include: ["src/**/*.{test,spec}.ts"],
  },
});
