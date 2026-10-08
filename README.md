# Gituser

Local web app to view, save and switch global git identities (`user.name` / `user.email`) and credentials on this machine.

- **server/** – Express API (TypeScript run natively by Node 24) on `127.0.0.1:4311`
- **client/** – React + Vite UI on `127.0.0.1:5311` (proxies `/api` to the server)

## Usage

```sh
npm install
npm run dev      # API + Vite, open http://localhost:5311
```

Single process (serves the built UI from the API server):

```sh
npm run build
npm start        # open http://localhost:4311
```

## Desktop app (Electron)

```sh
npm run desktop  # build UI + bundle, open in an Electron window
npm run dist     # build the Windows installer: release/Gituser-Setup-<version>.exe
```

`desktop/main.ts` starts the same API in-process on a random free port and opens a window on it. esbuild bundles the main process and the server into `desktop/dist/main.mjs`, so the installed app ships without `node_modules`. The PowerShell scripts and the built UI are copied next to `app.asar` as plain files (`resources/scripts`, `resources/client`).

`desktop/run.mjs` drops `ELECTRON_RUN_AS_NODE`, which VS Code sets in its terminals and which would make Electron run as plain Node. To regenerate the icon, run `desktop/make-icon.ps1`.

The installer is unsigned, so Windows SmartScreen warns on first run ("More info" → "Run anyway").

## What "Use this profile" does

1. `git config --global user.name` / `user.email`
2. `git config --global credential.<protocol>://<host>.username <username>` so the credential helper (Git Credential Manager) picks that account
3. If the profile has a token: `git credential approve` to store it in the configured helper

Repositories with a local `user.name` / `user.email` still override the global values.

## Storage

Profiles live in `~/.gituser/profiles.json` (override with `GITUSER_HOME`). Tokens are encrypted with AES-256-GCM; on Windows the key in `~/.gituser/key` is protected with DPAPI, so it only works for the current Windows user.

The "Credentials in Windows" list reads git entries from Windows Credential Manager (usernames only); tokens are only fetched on demand through `git credential fill`.

The API only accepts requests to `localhost` carrying the `x-gituser: 1` header, so other websites can't drive it.
