import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { PublisherGithub } from "@electron-forge/publisher-github";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

// Cord: rebranded from stoatchat/for-desktop. Windows-only for now — the
// Linux Flatpak maker + Nix + pipewire hooks upstream ships were dropped.
// Auto-update flows through GitHub releases via `update-electron-app`
// (initialised in src/main.ts), which reads `package.json.repository`.

const STRINGS = {
  author: "NexSites",
  name: "Cord",
  execName: "cord-desktop",
  description: "Cord — private, self-hosted chat.",
};

const ASSET_DIR = "assets/desktop";

const makers: ForgeConfig["makers"] = [
  // Squirrel = the real Windows installer. Adds Start Menu entry, uninstaller,
  // and — critically — is the wire that makes update-electron-app work.
  new MakerSquirrel({
    name: STRINGS.name,
    authors: STRINGS.author,
    // Icon shown INSIDE Add/Remove Programs after install. Squirrel wants a URL;
    // we serve the same ICO the PWA uses, so app + web share one identity.
    iconUrl: "https://cord-app.com/download/icon.ico",
    setupIcon: `${ASSET_DIR}/icon.ico`,
    description: STRINGS.description,
    exe: `${STRINGS.execName}.exe`,
    setupExe: `${STRINGS.execName}-setup.exe`,
    copyright: "Copyright (C) 2026 NexSites",
  }),
  // Portable ZIP as a fallback for users who don't want / can't run an installer.
  // No auto-update in this form — Squirrel is what update-electron-app hooks.
  new MakerZIP({}, ["win32"]),
];

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: STRINGS.name,
    executableName: STRINGS.execName,
    icon: `${ASSET_DIR}/icon`, // extensionless — electron-packager picks .ico on win32
  },
  rebuildConfig: {},
  makers,
  plugins: [
    { name: "@electron-forge/plugin-auto-unpack-natives", config: {} },
    new VitePlugin({
      build: [
        { entry: "src/main.ts",    config: "vite.main.config.ts",    target: "main"    },
        { entry: "src/preload.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [],
    }),
    // Hardening fuses — compiled into the Electron binary at package time.
    // Unchanged from upstream; all sensible defaults for a chat app.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    new PublisherGithub({
      repository: { owner: "nexsites", name: "cord-app-desktop" },
      draft: false,
      prerelease: false,
    }),
  ],
};

export default config;
