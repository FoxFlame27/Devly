# Devly

Describe what you want, click **Build**, watch it appear in a live preview, ask for changes, publish.

Under the hood: Next.js 16, React 19, TypeScript, Tailwind 4, PostgreSQL + Prisma, Monaco, Zod,
a real multi-step Claude coding agent with 12 tools, streaming over Server-Sent Events, and per-project sandboxes.

## Run it

Requirements: Node 20+ and PostgreSQL. No Docker or Homebrew needed: `npm run db:start` boots a local
PostgreSQL (downloaded binaries, data in `.data/pg`).

```bash
cp .env.example .env          # then fill in ANTHROPIC_API_KEY and random SESSION_SECRET / ENCRYPTION_KEY
npm install
npm run db:start              # terminal 1: local PostgreSQL on 127.0.0.1:5433
npm run setup                 # terminal 2: prisma generate + db push + seed (admin user + access code)
npm run dev                   # http://localhost:3000
```

Seeded by `npm run db:seed` (values from `.env`):

- Admin account: `ADMIN_EMAIL` / `ADMIN_PASSWORD` (default `admin@example.com` / `admin12345`) — change it.
- Access code `SEED_ACCESS_CODE` (default `270513`) unlocks unlimited prompts.

## How it works

| Piece | Where | Notes |
| --- | --- | --- |
| AI provider | `src/lib/ai/` | `AIProvider` interface; `AnthropicProvider` uses the official SDK with prompt caching and server-side refusal fallbacks. `AI_PROVIDER=mock` runs a scripted provider for tests. Models come from `AI_MODELS` in `.env` (`id:Label,...`); nothing hard-codes a model id. |
| Agent loop | `src/lib/agent/runner.ts` | Understand → inspect → edit → run → check errors → fix → summarise. Limits: 40 model calls, 120 tool calls, 12 minutes. Stop cancels via `AbortController`. Only activity labels are streamed, never reasoning. |
| Tools | `src/lib/agent/tools.ts` | `list_files`, `read_file`, `write_file`, `edit_file`, `delete_file`, `search_files`, `get_project_structure`, `run_command`, `install_package`, `get_project_errors`, `start_preview`, `restart_preview`. Every input is validated with Zod; paths go through `resolveInProject` (no traversal, no absolute paths, no symlink escapes). |
| Sandbox | `src/lib/sandbox/` | `SandboxProvider` interface. `DockerSandbox` (1 CPU, 1 GB, 256 pids, read-only root, only the project mounted) is used when Docker is available; otherwise `LocalSandbox` uses macOS Seatbelt (`sandbox-exec`) with a deny-by-default profile: it can read only the OS, Node and its own workspace, and can write only its workspace, a private HOME and the shared npm cache. The platform checkout (`.env`), the user's home and other projects are explicitly denied. Environment is scrubbed; only the project's own variables are passed. Commands are allow-listed (`commands.ts`). |
| Files | `src/lib/projects/files.ts` | PostgreSQL is the source of truth; the workspace on disk is materialised from it and synced back after commands (hash-based, only changed files). |
| Preview | `src/lib/projects/preview.ts` | Runs the template's dev server (Vite / Next) in the sandbox on a random port bound to 127.0.0.1, waits for it, tails logs, collects errors. Templates inject a tiny script that reports runtime and compile errors to the workspace via `postMessage`. |
| Publishing | `src/lib/hosting/` | `HostingProvider` interface; `LocalHosting` builds in the sandbox and serves the static output under `/site/<slug>/` on a separate origin (`127.0.0.1` vs `localhost`) so published user code never shares the app's cookies. Set `SITE_URL` for a real second domain. |
| Auth | `src/lib/auth/` | Scrypt password hashes, HMAC-hashed session tokens in an httpOnly SameSite cookie, Origin check on every mutating request (CSRF), rate limits on auth, chat, publish and code redemption. Ownership is checked server-side on every project route. |
| Prompt limits | `src/lib/usage.ts` | 10 free prompts, enforced atomically in the database. A prompt is refunded if the AI provider fails before doing work. Access codes are stored as HMAC hashes; each code can add prompts, unlock unlimited use, expire, and cap redemptions. |
| Email codes | `src/lib/auth/challenge.ts`, `src/lib/email/` | Signup and login send a 6-digit code (Resend when `RESEND_API_KEY` is set; otherwise the code is printed to the server log and shown on screen in development). Codes are stored hashed, expire after 10 minutes, and allow 5 attempts. Set `EMAIL_VERIFY=false` to turn this off. |
| Admin | `/admin` | Users, projects, usage, access codes, system status. Role is enforced by `requireAdmin()` on every admin API. |

## Modes

- **Normal**: Chat, Preview (Refresh / Open / Publish), Save, Sync, History, Settings (name, secret keys, delete).
- **Advanced** (Settings → Advanced Mode): Files + Monaco editor (auto-save, conflict dialog with *Keep mine / Use latest / Let AI fix it*), sandbox Terminal, dev-server Logs, technical error details.

## Checks

```bash
npm run typecheck && npm run lint && npm test
```

## Known limitations

- Rate limiting and preview state are in-memory (single instance). Swap `ratelimit.ts` and the preview registry for Redis when scaling out.
- The npm cache is shared between sandboxes for speed (content-addressed, integrity-checked); use `SANDBOX_PROVIDER=docker` for the strongest isolation.
- Monaco loads from a CDN (default `@monaco-editor/react` behaviour).
