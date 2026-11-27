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
    crane.url = "github:ipetkov/crane";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    rust-overlay,
    crane,
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
        craneLib = (crane.mkLib pkgs).overrideToolchain rust;
        rev = self.shortRev or self.dirtyShortRev;

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

        serverLinuxLibs = [
          pkgs.stdenv.cc.libc
          # has libgcc_s without the rest of gcc-lib (libstdc++…)
          pkgs.stdenv.cc.cc.libgcc
        ];

        serverArgs = {
          src = craneLib.cleanCargoSource ./server;
          strictDeps = true;
        };

        server = craneLib.buildPackage (
          serverArgs
          // {
            pname = "listogether-server";
            version = rev;
            cargoArtifacts = craneLib.buildDepsOnly serverArgs;
            # rust-embed reads the UI from ../ui/dist at compile time
            preBuild = ''
              mkdir -p ../ui
              cp -r ${ui} ../ui/dist
            '';
            # pnpm -r test runs the tests
            doCheck = false;
            # keeps the UI, the Rust toolchain and the vendored crates out of the closure
            allowedReferences = if pkgs.stdenv.hostPlatform.isLinux then serverLinuxLibs else [ pkgs.libiconv ];
          }
          // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
            postFixup = ''
              patchelf --set-rpath ${pkgs.lib.makeLibraryPath serverLinuxLibs} $out/bin/listogether-server
            '';
          }
        );

        nobody = "65534:65534";

        image = pkgs.dockerTools.buildLayeredImage {
          name = "listogether";
          tag = server.version;
          contents = [
            server
            # passwd and group entries for nobody
            pkgs.dockerTools.fakeNss
          ];
          fakeRootCommands = ''
            mkdir -p ./data
            chown ${nobody} ./data
          '';
          config = {
            Entrypoint = [ "/bin/listogether-server" ];
            Cmd = [
              "serve"
              "--lists-dir"
              "/data"
            ];
            User = nobody;
            WorkingDir = "/data";
            Volumes = {
              "/data" = { };
            };
            Env = [ "LISTEN_ADDRESS=0.0.0.0:8789" ];
            ExposedPorts = {
              "8789/tcp" = { };
            };
            # ghcr.io uses this to attach the package to the repository
            Labels = {
              "org.opencontainers.image.source" = "https://github.com/abustany/listogether";
            };
          };
        };
      in
      with pkgs;
      {
        packages = {
          inherit ui server;
          default = server;
        }
        # dockerTools only builds Linux images: on macOS, build packages.<linux system>.docker
        // pkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          docker = image;
        };

        apps.default = flake-utils.lib.mkApp { drv = server; };

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
