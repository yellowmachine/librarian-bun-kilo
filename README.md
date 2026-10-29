# The Svelte Librarian

> Tu biblioteca particular. Escanea, organiza y comparte tus libros.

A personal book library manager built as a PWA. Scan ISBNs with your phone camera, search the OpenLibrary catalogue, track loans, and share your collection with reading groups.

Built with [Claude Sonnet 4.6](https://www.anthropic.com/claude).

---

## Security

Your data is yours. The Svelte Librarian enforces data isolation at the database level using **PostgreSQL Row-Level Security (RLS)** — not just in application code.

Every table has RLS policies that restrict what each user can read or write. The application connects to the database as a dedicated low-privilege role (`app_user`) with no superuser rights. Before executing any query, the server sets the current user's identity as a PostgreSQL session variable. The database then enforces the policies automatically for every single query — even if a bug in application logic attempted to access another user's data, the database would silently block it.

In practice this means:

- **Your library is private.** No other user can read, modify, or delete your books, tags, or notes.
- **Loans are visible only to the two parties involved.** Neither a group member nor an admin can see a loan between two other users.
- **Groups are scoped.** You only see groups you belong to. You cannot read the membership list of a group you have not joined.
- **No application-level trust.** Security does not depend on the server remembering to add a `WHERE user_id = ?` clause. The database rejects any query that violates the policy, regardless of how it was constructed.

This approach follows the same security model used by platforms like Supabase and is validated by an automated test suite that runs RLS policies against a real PostgreSQL engine on every change.

---

## Features

- **Personal library** — Add books by scanning their ISBN barcode or searching by title, author, or ISBN. Each copy tracks availability and optional notes.
- **Loan lifecycle** — Full state machine: `requested → accepted → active → return_requested → returned`, with `rejected` and `cancelled` terminal states. Availability updates automatically.
- **Reading groups** — Create groups and invite members via a unique code or QR code shown directly in the app. Owners and admins manage membership.
- **Shared tags** — Share your personal tags into a group so members can filter and browse books by them.
- **Group book search** — Search all available books within a group, filter by shared tag, and request a loan in one action.
- **Pending loan badge** — The navigation always shows how many loans are waiting for your action.
- **PWA / installable** — Works offline, installable on mobile. OpenLibrary cover images are cached for 30 days.
- **Invitation-only accounts** — Anyone already in can invite someone by email from **Tu cuenta** (`/account`); the link lasts 7 days. See [Accounts](#accounts).
- **Sign in with Seilide** — Optional OpenID Connect login, shown when the `SEILIDE_*` env vars are present. See [Seilide](#seilide).
- **AI with your own OpenRouter key** — Shelf scanning, tag suggestions and cover search use the key each user connects in `/account`, stored encrypted.

---

## Tech Stack

| Layer                | Technology                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- |
| Runtime (dev/build)  | [Bun](https://bun.sh)                                                               |
| Runtime (production) | Node.js 22 (adapter-node)                                                           |
| Framework            | [SvelteKit 2](https://kit.svelte.dev) + [Svelte 5](https://svelte.dev) (Runes mode) |
| Styling              | [Tailwind CSS v4](https://tailwindcss.com)                                          |
| Icons                | [Phosphor Svelte](https://github.com/haruaki07/phosphor-svelte)                     |
| Database             | PostgreSQL 17                                                                       |
| ORM                  | [Drizzle ORM](https://orm.drizzle.team)                                             |
| Auth                 | [Better Auth](https://www.better-auth.com)                                          |
| DB Security          | PostgreSQL Row-Level Security (RLS)                                                 |
| i18n                 | [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)            |
| PWA                  | [@vite-pwa/sveltekit](https://vite-pwa-org.netlify.app/frameworks/sveltekit)        |
| Barcode scanning     | [Quagga2](https://github.com/ericblade/quagga2)                                     |
| QR codes             | [@paulmillr/qr](https://github.com/paulmillr/qr)                                    |
| Deployment           | [Dokploy](https://dokploy.com) via Docker                                           |

---

## Architecture

### Row-Level Security

Every table has PostgreSQL RLS policies. The app connects as a dedicated `app_user` role (no superuser, no `BYPASSRLS`). Before any query the server sets a session variable:

```ts
// src/lib/server/db/rls.ts
await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
```

Policies reference `current_setting('app.current_user_id', true)` to filter rows. A bug in application logic cannot leak another user's data — the database enforces isolation.

Better Auth's tables (`user`, `session`, `account`, `verification`) and `invitations` have no RLS: only the auth layer and `invitation-store.ts` touch them. Application queries always go through `withRLS(userId, tx => …)`.

### `app_user` role

Librarian has its own database. Everything lives in the `public` schema: Better Auth's tables (`src/lib/server/db/auth.schema.ts`, generated by `bun run auth:schema`) and the app's (`schema.ts`, which re-exports them), all created by the same Drizzle migrations. `drizzle/0000_rls_functions.sql` is hand-written: the `SECURITY DEFINER` functions the policies call.

The app connects as `app_user` (`DATABASE_URL`); migrations run as the database owner (`MIGRATION_DATABASE_URL`). The role is created by `scripts/init.sh` when the Postgres volume is initialised (via `docker-entrypoint-initdb.d`), not by Drizzle migrations. The schema declares it as `.existing()` so `drizzle-kit generate` never emits `CREATE ROLE`. Default privileges are configured once so every table created by future migrations is immediately accessible to `app_user`. Its name is fixed (the policies name it); its password is `APP_DB_PASSWORD`. `init.sh` only runs on an empty volume: changing the password later needs `ALTER ROLE app_user PASSWORD '…'`.

### Loan state machine

```
requested ──► accepted ──► active ──► return_requested ──► returned
    │              │
    ▼              ▼
cancelled      cancelled

any active state ──► rejected (owner only)
```

### Group membership and RLS recursion

The `group_members` RLS policy needs to check whether the current user belongs to a group — by querying `group_members` itself. PostgreSQL's query planner handles this via an internal _RLS barrier_ that prevents infinite recursion. In [PGlite](https://pglite.dev) (used for unit tests, compiled to WASM) this optimisation is absent, so the policies call `SECURITY DEFINER` functions (`is_group_member`, `is_group_admin`, `is_group_creator`, `get_group_members`) that bypass RLS for the inner lookup only.

Group invite codes are visible only to the group's members, and to whoever brings that exact code: `joinGroupByCode` sets it in `app.invite_code`, and the `group_members_insert` policy lets you add yourself as `member` only with your group's code (or as `owner` of a group you just created).

---

## Accounts

Librarian is invitation-only, but anyone in can invite:

- **Invitations** (`invitations` table, `src/lib/server/invitation-store.ts`): `/account` → _Invitar a alguien_ sends a link, `/invitacion/<token>`, valid for 7 days. If the email doesn't arrive, the link is shown there to pass on by hand. The person picks a name and a password there, and is in: the invitation verifies their email (the link reached that inbox). Inviting the same email again renews the link; someone already in can't be invited.
- **No public sign-up.** Better Auth's `POST /api/auth/sign-up/email` is closed (`disabledPaths`); the invitation page calls `auth.api.signUpEmail` server-side.
- **The first account:** on startup with no users, Librarian invites `ADMIN_EMAIL` (by email, and the link is in the log). Or by hand: `bun run invitar ana@example.com` prints a link (in the container: `bun scripts/invitar.ts ana@example.com`).
- **Password:** at least 10 characters; _He olvidado mi contraseña_ (`/forgot-password`) emails a link valid for 1 hour.
- **Seilide** users don't need an invitation (Seilide is invitation-only itself): see below.

## Seilide

«Entrar con Seilide» is Better Auth's `genericOAuth` (`src/lib/server/auth-options.ts`): providerId `seilide`, discovery at `${SEILIDE_URL}/api/auth/.well-known/openid-configuration`, PKCE, `client_secret_basic`, scopes `openid profile email`. Librarian doesn't ask for `family` or `offline_access`: it isn't a family app and doesn't call Seilide after sign-in. Without the three `SEILIDE_*` variables the button isn't shown and the route doesn't exist.

- **The client:** Seilide's administrator creates it in `/admin/apps` (not «para familias»), with the callback `https://<ORIGIN>/api/auth/oauth2/callback/seilide` — in production `https://librarian.scholio.review/api/auth/oauth2/callback/seilide`. That gives the three `.env` lines: `SEILIDE_URL`, `SEILIDE_CLIENT_ID` and `SEILIDE_CLIENT_SECRET`. No consent screen.
- **Accounts:** the first sign-in creates the account at once — but only if Seilide says the email is verified (`email_verified`); otherwise `/login` explains why. If one already exists with that email, it is linked, again only with the email verified (Seilide is not in `trustedProviders`). From then on the person is recognised by Seilide's `sub` (`account.account_id`), not by email, even if Seilide later stops vouching for it. This is what stops anyone from taking over someone else's account with an email they don't own. If the existing account's email had never been verified, its password is deleted on linking, so whoever created it with someone else's email can't keep using it.
- **Development:** Seilide only accepts `https` callbacks that aren't localhost. The fixed tunnel is `librarian-dev.scholio.review` (cloudflared tunnel `librarian-dev`, config in `~/.cloudflared/librarian-dev.yml`, pointing at port 5174, allowed in `vite.config.ts`). Register `https://librarian-dev.scholio.review/api/auth/oauth2/callback/seilide` on a test client, then `bun run tunnel` plus `bun run dev:tunnel` or, to test the compiled app (SvelteKit's CSRF check is off in `vite dev`), `bun run preview:tunnel`.

---

## Project Structure

```
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── BookCard.svelte          # grid / list / detail variants
│   │   │   ├── BookGrid.svelte          # responsive book grid wrapper
│   │   │   ├── InviteQR.svelte          # QR code for group invite links
│   │   │   ├── IsbnScanner.svelte       # camera barcode scanner (Quagga2)
│   │   │   └── LoanStatusBadge.svelte   # colour-coded loan status pill
│   │   ├── server/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts            # Drizzle schema + RLS policies
│   │   │   │   ├── auth.schema.ts       # Better Auth tables (auto-generated)
│   │   │   │   ├── rls.ts               # withRLS() helper
│   │   │   │   ├── test-db.ts           # PGlite factory for unit tests
│   │   │   │   └── __tests__/           # RLS unit tests
│   │   │   ├── auth-options.ts          # Better Auth options (Seilide, linking, sign-up closed)
│   │   │   ├── auth.ts                  # Better Auth instance for the app
│   │   │   ├── auth.cli.ts              # Better Auth instance for `bun run auth:schema`
│   │   │   ├── invitation-store.ts      # invitations (testable on PGlite)
│   │   │   ├── invitations.ts           # invitations + email, for the app
│   │   │   ├── openrouterKey.ts         # each user's encrypted OpenRouter key
│   │   │   ├── books.ts                 # book / userBook queries
│   │   │   ├── groups.ts                # group queries + invite logic
│   │   │   └── loans.ts                 # loan state machine
│   │   └── loanStatus.ts                # status labels + colours
│   ├── routes/
│   │   ├── login/                       # password + «Entrar con Seilide»
│   │   ├── invitacion/[token]/          # create the account from an invitation
│   │   ├── forgot-password/ reset-password/
│   │   ├── (app)/                       # auth-guarded shell
│   │   │   ├── account/                 # invitations, OpenRouter key
│   │   │   ├── library/                 # personal library, add, detail
│   │   │   ├── loans/                   # loan dashboard, detail
│   │   │   └── groups/                  # groups, new, join, detail, search
│   │   ├── api/                         # JSON API (books, loans, tags)
│   │   └── logout/
│   └── stories/                         # Storybook stories
├── drizzle/                             # SQL migration files
├── scripts/
│   ├── init.sh                          # DB init: app_user role + privileges
│   ├── migrate.ts                       # runs at container startup
│   ├── invitar.ts                       # invite someone by hand
│   └── entrypoint.sh                    # Docker entrypoint
├── compose.yaml                         # local dev (Postgres only, port 5436)
├── docker-compose.yml                   # production: app + its Postgres (Dokploy deploys this one)
└── Dockerfile                           # 3-stage: deps → build → prod (Node 22)
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Docker](https://www.docker.com)

### 1. Clone and install

```bash
git clone <repo-url>
cd librarian-bun-kilo
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Minimum required values (the database ones match `compose.yaml`):

```env
DATABASE_URL=postgres://app_user:app_user@localhost:5436/librarian
MIGRATION_DATABASE_URL=postgres://librarian:librarian@localhost:5436/librarian
ORIGIN=http://localhost:5173
BETTER_AUTH_SECRET=<generate: openssl rand -base64 32>
KMS_MASTER_KEY=<generate: openssl rand -base64 32>
ADMIN_EMAIL=you@example.com
```

Optional: `SEILIDE_*` (see [Seilide](#seilide)) and `SMTP_*` (without `SMTP_HOST` emails are only logged).

### 3. Start the database

```bash
bun run db:start        # starts Postgres, runs scripts/init.sh automatically
```

### 4. Run migrations

```bash
bun run db:migrate
```

### 5. Start the dev server

```bash
bun run dev
```

With no accounts yet, the server logs an invitation link for `ADMIN_EMAIL`: open it to create the first account. Or run `bun run invitar you@example.com`.

---

## Database

### Common commands

```bash
bun run db:generate     # generate SQL from schema changes
bun run db:migrate      # apply pending migrations
bun run db:push         # push schema directly (dev only, skips migration files)
bun run db:studio       # open Drizzle Studio in the browser
```

### Full reset (development)

```bash
docker compose down -v          # destroy the Postgres volume
docker compose up -d            # fresh Postgres — init.sh runs automatically
bun run db:migrate
```

### After Better Auth schema changes

```bash
bun run auth:schema             # regenerates src/lib/server/db/auth.schema.ts
bun run db:generate
```

---

## Testing

### Unit tests (RLS — no Docker required)

```bash
bun run vitest run --project server
```

Each test file creates an isolated in-memory [PGlite](https://pglite.dev) instance, applies all migrations, and runs queries as different users via `withRLS()`. Test files run in parallel across Vitest workers; tests within a file run serially against their own instance.

| File                  | Coverage                                                                   |
| --------------------- | -------------------------------------------------------------------------- |
| `rls.books.test.ts`   | books catalogue, user_books, tags                                          |
| `rls.groups.test.ts`  | groups, group_members, creating a group, joining with its code             |
| `rls.loans.test.ts`   | loan visibility, insert, update, delete                                    |
| `auth.test.ts`        | password sign-in, closed sign-up, «Entrar con Seilide» and account linking |
| `invitations.test.ts` | inviting, renewing, accepting, expiry and cancelling                       |

`auth.test.ts` runs Better Auth against the real migrations with a fake Seilide (discovery, token, userinfo). SvelteKit's CSRF check doesn't act in `vite dev`: test server-to-server POSTs against the compiled app (`bun run build`, then `bun build/index.js`).

### All test projects

```bash
bun run test:unit               # unit (server + client + storybook)
bun run test:e2e                # Playwright E2E
```

---

## Storybook

```bash
bun run storybook               # http://localhost:6006
bun run build-storybook
```

Stories live in `src/stories/`. The `storybook` Vitest project runs them headlessly as accessibility and interaction tests.

---

## Deployment

Pushes to `main` trigger `.github/workflows/build-ghcr.yml`:

1. **Build & push** — builds the Docker image and pushes `ghcr.io/yellowmachine/librarian-bun-kilo:latest` to GHCR
2. **Deploy** — waits for `:latest` on GHCR to resolve to the digest just pushed, then calls the Dokploy webhook to redeploy `docker-compose.yml` (`librarian` pulls the new image via `pull_policy: always`)
3. **Container startup** — `entrypoint.sh` runs `migrate.ts` (applies pending migrations) then starts the Node server

⚠️ **The Dokploy webhook is the same endpoint Dokploy's native "deploy on GitHub push" trigger calls** (`/api/deploy/compose/<refreshToken>`, see [source](https://github.com/Dokploy/dokploy/blob/main/apps/dokploy/pages/api/deploy/compose/%5BrefreshToken%5D.ts)). It only counts as a real deploy if the request carries an `x-github-event` header and a matching `ref` in the body — otherwise it responds `301 "Branch Not Match"` without deploying (not caught by a plain `curl --fail`, since 301 isn't ≥400). The workflow's `curl` sends `-H "x-github-event: push" -d '{"ref": "refs/heads/main", "commits": []}'` and checks for `HTTP 200` explicitly. It also needs the **Auto Deploy** toggle on in Dokploy's General tab — turning it off returns `400` and blocks this webhook too (same flag as the native trigger, can't be split). Because the native trigger also fires the instant it sees the push, expect two deploys per push to `main`; the workflow's one always runs last (after the image is confirmed ready) and wins thanks to `pull_policy: always`.

### Required GitHub secrets

| Secret                       | Description                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `DOKPLOY_DEPLOY_WEBHOOK_URL` | Dashboard Dokploy → app → **General** → **Deployments** → "Copy Webhook" |
| `SLACK_WEBHOOK_URL`          | Slack incoming webhook, used for build/deploy notifications              |

### Dokploy environment variables

`docker-compose.yml` is the compose file Dokploy actually deploys: the app and its own Postgres (`db`, volume `pgdata`, initialised by `scripts/init.sh`). Nothing is shared with other apps. **Back up `pgdata`.**

| Variable                                                                             | Required | Description                                                                              |
| ------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------- |
| `ORIGIN`                                                                             | ✅       | Public app URL, no trailing slash: `https://librarian.scholio.review`                    |
| `BETTER_AUTH_SECRET`                                                                 | ✅       | Random secret (`openssl rand -base64 32`)                                                |
| `POSTGRES_PASSWORD`                                                                  | ✅       | Password of the database owner (`librarian`), used for migrations                        |
| `APP_DB_PASSWORD`                                                                    | ✅       | Password of `app_user`, the role the app connects as                                     |
| `KMS_MASTER_KEY`                                                                     | ✅       | Encrypts users' OpenRouter keys (`openssl rand -base64 32`); changing it loses them      |
| `ADMIN_EMAIL`                                                                        | ✅       | Invited on startup while there are no accounts                                           |
| `SEILIDE_URL` / `SEILIDE_CLIENT_ID` / `SEILIDE_CLIENT_SECRET`                        | optional | «Entrar con Seilide», see [Seilide](#seilide)                                            |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | optional | SMTP config (Proton: `smtp.protonmail.ch`, `no-reply@scholio.review` and its SMTP token) |
| `GOOGLE_BOOKS_API_KEY`                                                               | optional | Own quota for cover search                                                               |
| `SENTRY_DSN` / `PUBLIC_SENTRY_DSN`                                                   | optional | Error tracking                                                                           |

`DATABASE_URL` and `MIGRATION_DATABASE_URL` are built by `docker-compose.yml` from those passwords.

---

## Scripts Reference

| Script                    | Description                  |
| ------------------------- | ---------------------------- |
| `bun run dev`             | Dev server                   |
| `bun run build`           | Production build             |
| `bun run preview`         | Preview production build     |
| `bun run check`           | Svelte typecheck             |
| `bun run lint`            | Prettier + ESLint            |
| `bun run format`          | Prettier autofix             |
| `bun run test:unit`       | All Vitest projects          |
| `bun run test:e2e`        | Playwright E2E               |
| `bun run db:start`        | Start local Postgres         |
| `bun run invitar <email>` | Invite someone, print link   |
| `bun run auth:schema`     | Regenerate auth.schema.ts    |
| `bun run tunnel`          | cloudflared dev tunnel       |
| `bun run dev:tunnel`      | Dev server behind the tunnel |
| `bun run preview:tunnel`  | Built app behind the tunnel  |
| `bun run db:generate`     | Generate Drizzle migrations  |
| `bun run db:migrate`      | Apply migrations             |
| `bun run db:push`         | Push schema directly (dev)   |
| `bun run db:studio`       | Drizzle Studio UI            |
| `bun run storybook`       | Storybook dev server         |
| `bun run build-storybook` | Storybook static build       |
