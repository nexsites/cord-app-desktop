# Cord Desktop

Native desktop app for [Cord](https://cord-app.com) — private, self-hosted chat.

Windows for now (macOS + Linux may return later). Auto-updates via GitHub
releases; users don't have to reinstall to get new versions.

## Download

The latest installer is on the [releases page](https://github.com/nexsites/cord-app-desktop/releases/latest)
and mirrored at <https://cord-app.com/download>.

Windows may warn "Windows protected your PC — Unrecognized app" the first time
you run the installer. The app isn't code-signed (would cost ~$100/yr).
Click **More info → Run anyway** and it installs normally; the warning goes
away as SmartScreen accumulates trust from downloads.

## Build (from source)

```bash
git clone https://github.com/nexsites/cord-app-desktop
cd cord-app-desktop
pnpm install
pnpm start          # dev — launches Electron pointing at cord-app.com
pnpm make           # produces installer + portable ZIP under out/make/
```

Requirements on the build host: Node 20+, pnpm, and (for producing the Squirrel
installer on Linux) Mono. On Windows the Squirrel path is native.

## What this is

A thin Electron wrapper around the Cord web client at cord-app.com. Everything
users actually interact with — auth, messaging, uploads, voice — is the same
code that runs in a browser. The wrapper adds:

- Windows Start Menu entry, taskbar identity, custom uninstaller
- Autostart-on-login (opt-in via Settings → Native)
- System tray with quick-open
- Auto-updates from GitHub releases (no reinstall)
- Native notifications, mic/screen-share access without per-tab prompts
- Discord Rich Presence (disabled until Cord has a registered Discord app id)

## Fork lineage

Forked from [`stoatchat/for-desktop`](https://github.com/stoatchat/for-desktop),
which is itself a Stoat rebrand of [`revoltchat/desktop`](https://github.com/revoltchat/desktop).
Preserves the upstream AGPL-3.0 license.

Cord-specific changes recorded in commit history — the substantive ones are
rebranding, Windows-only makers, and the auto-update repository target.
