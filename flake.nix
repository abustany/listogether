{
  description = "Listogether";

  inputs = {
    nixpkgs.url      = "github:NixOS/nixpkgs/nixos-26.05";
    flake-utils.url  = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs = {
        nixpkgs.follows = "nixpkgs";
      };
    };
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    rust-overlay,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [
          (import rust-overlay)
        ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };
        playwright-browsers = pkgs.playwright-driver.browsers.override {
          withChromium = false;
          withFirefox = false;
          withWebkit = false;
          withFfmpeg = false;
        };
        rust = pkgs.rust-bin.fromRustupToolchainFile ./server/rust-toolchain.toml;
        rev = if (self ? shortRev) then self.shortRev else "dev";

        pnpmManifests = [
          ./package.json
          ./pnpm-lock.yaml
          ./pnpm-workspace.yaml
          ./e2e/package.json
          ./server/package.json
          ./ui/package.json
        ];

        ui = pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
          pname = "listogether-ui";
          version = rev;

          src = pkgs.lib.fileset.toSource {
            root = ./.;
            fileset = pkgs.lib.fileset.unions (pnpmManifests ++ [ ./ui ]);
          };

          pnpmWorkspaces = [ "listogether" ];

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname pnpmWorkspaces;
            # only the manifests, so that UI source changes do not invalidate the dependencies
            src = pkgs.lib.fileset.toSource {
              root = ./.;
              fileset = pkgs.lib.fileset.unions pnpmManifests;
            };
            fetcherVersion = 5;
            # update when pnpm-lock.yaml changes: set to "" and copy the hash from the build error
            hash = "sha256-XUL4Fimj5lJLQORf0F0b6tjkgMsUx11brBVeOkZ2p2k=";
          };

          nativeBuildInputs = [
            pkgs.nodejs
            pkgs.pnpm
            pkgs.pnpmConfigHook
          ];

          buildPhase = ''
            runHook preBuild
            pnpm --filter listogether build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            cp -r ui/dist $out
            runHook postInstall
          '';
        });
      in
      with pkgs;
      {
        packages = {
          inherit ui;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.nodejs
            pkgs.pnpm
            playwright-browsers
            rust
          ];

          PLAYWRIGHT_BROWSERS_PATH = playwright-browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
        };
      }
    );
}
