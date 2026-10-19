{
  description = "ハサミウチ 〜刻むか、跳ぶか〜 — チーム対抗の数字当てゲーム進行サイト";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_22
            pkgs.pnpm
          ];

          shellHook = ''
            echo "hasamiuchi dev shell — node $(node --version), pnpm $(pnpm --version)"
            echo "  pnpm install   依存をインストール"
            echo "  pnpm dev       開発サーバ"
            echo "  pnpm test      得点ロジックのテスト (vitest)"
            echo "  pnpm build     dist/ へ静的ビルド"
          '';
        };
      });
    };
}
