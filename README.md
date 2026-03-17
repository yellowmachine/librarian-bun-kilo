# The Svelte Librarian

> Tu biblioteca particular. Escanea, organiza y comparte tus libros.

A personal book library manager built as a PWA. Scan ISBNs with your phone camera, search the OpenLibrary catalogue, track loans, and share your collection with reading groups.

Built with [Kilo](https://kilo.ai) and [Claude Sonnet 4.6](https://www.anthropic.com/claude).

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
- **GitHub OAuth** — Optional social login, activated when the relevant env vars are present.
- **First-run setup** — `/setup` bootstraps the first admin account; unavailable once any user exists.

---

## Tech Stack

| Layer                | Technology                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- |
| Runtime (dev/build)  | [Bun](https://bun.sh)                                                               |
| Runtime (production) | Node.js 22 (adapter-node)                                                           |
| Framework            | [SvelteKit 2](https://kit.svelte.dev) + [Svelte 5](https://svelte.dev) (Runes mode) |
| Styling              | [Tailwind CSS v4](https://tailwindcss.com)                                          |
| Icons                | [Phosphor Svelte](https://github.com/haruaki07/phosphor-svelte)                     |
| Database             | PostgreSQL 16                                                                       |
| ORM                  | [Drizzle ORM](https://orm.drizzle.team)                                             |
| Auth                 | [Better Auth](https://www.better-auth.com)                                          |
| DB Security          | PostgreSQL Row-Level Security (RLS)                                                 |
| i18n                 | [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)            |
| PWA                  | [@vite-pwa/sveltekit](https://vite-pwa-org.netlify.app/frameworks/sveltekit)        |
| Barcode scanning     | [Quagga2](https://github.com/ericblade/quagga2)                                     |
| QR codes             | [@paulmillr/qr](https://github.com/paulmillr/qr)                                    |
| Deployment           | [Coolify](https://coolify.io) via Docker                                            |

---

## Architecture

### Row-Level Security

Every table has PostgreSQL RLS policies. The app connects as a dedicated `app_user` role (no superuser, no `BYPASSRLS`). Before any query the server sets a session variable:

```ts
// src/lib/server/db/rls.ts
await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
```

Policies reference `current_setting('app.current_user_id', true)` to filter rows. A bug in application logic cannot leak another user's data — the database enforces isolation.

Better Auth (which manages sessions) runs as the superuser and bypasses RLS by design. Application queries always go through `withRLS(userId, tx => …)`.

### `app_user` role

The role is created by `scripts/init.sql` at database initialisation (via `docker-entrypoint-initdb.d`), not by Drizzle migrations. The schema declares it as `.existing()` so `drizzle-kit generate` never emits `CREATE ROLE`. Default privileges are configured once so every table created by future migrations is immediately accessible to `app_user`.

### Loan state machine

```
requested ──► accepted ──► active ──► return_requested ──► returned
    │              │
    ▼              ▼
cancelled      cancelled

any active state ──► rejected (owner only)
```

### Group membership and RLS recursion

The `group_members` RLS policy needs to check whether the current user belongs to a group — by querying `group_members` itself. PostgreSQL's query planner handles this via an internal _RLS barrier_ that prevents infinite recursion. In [PGlite](https://pglite.dev) (used for unit tests, compiled to WASM) this optimisation is absent, so the test helper replaces recursive policies with `SECURITY DEFINER` functions that bypass RLS for the inner lookup only. The production schema is unchanged.

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
│   │   │   ├── auth.ts                  # Better Auth configuration
│   │   │   ├── books.ts                 # book / userBook queries
│   │   │   ├── groups.ts                # group queries + invite logic
│   │   │   └── loans.ts                 # loan state machine
│   │   └── loanStatus.ts                # status labels + colours
│   ├── routes/
│   │   ├── (auth)/                      # login, register
│   │   ├── (app)/                       # auth-guarded shell
│   │   │   ├── library/                 # personal library, add, detail
│   │   │   ├── loans/                   # loan dashboard, detail
│   │   │   └── groups/                  # groups, new, join, detail, search
│   │   ├── api/                         # JSON API (books, loans, tags)
│   │   ├── setup/                       # first-run admin bootstrap
│   │   └── logout/
│   └── stories/                         # Storybook stories
├── drizzle/                             # SQL migration files
├── scripts/
│   ├── init.sql                         # DB init: app_user role + privileges
│   ├── migrate.mjs                      # runs at container startup
│   └── entrypoint.sh                    # Docker entrypoint
├── compose.yaml                         # local dev (Postgres only)
├── compose.prod.yaml                    # production (app + Postgres)
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

Minimum required values:

```env
DATABASE_URL=postgres://root:mysecretpassword@localhost:5432/local
ORIGIN=http://localhost:5173
BETTER_AUTH_SECRET=<generate: openssl rand -base64 32>
```

Optional GitHub OAuth:

```env
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

### 3. Start the database

```bash
bun run db:start        # starts Postgres, runs init.sql automatically
```

### 4. Run migrations

```bash
bun run db:migrate
```

### 5. Start the dev server

```bash
bun run dev
```

Open [http://localhost:5173/setup](http://localhost:5173/setup) to create the first account.

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
rm -rf drizzle/                 # delete migration history
docker compose up -d            # fresh Postgres — init.sql runs automatically
bun run db:generate
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

| File                 | Coverage                                |
| -------------------- | --------------------------------------- |
| `rls.books.test.ts`  | books catalogue, user_books, tags       |
| `rls.groups.test.ts` | groups, group_members                   |
| `rls.loans.test.ts`  | loan visibility, insert, update, delete |

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

Pushes to `main` trigger a GitHub Actions workflow:

1. **CI** — `bun run check` (typecheck) + `bun run build`
2. **Deploy** — Coolify deploy webhook is called; Coolify builds the Docker image and starts `compose.prod.yaml`
3. **Container startup** — `entrypoint.sh` runs `migrate.mjs` (applies pending migrations) then starts the Node server

### Required GitHub secrets

| Secret                  | Description                     |
| ----------------------- | ------------------------------- |
| `COOLIFY_WEBHOOK_URL`   | Coolify deploy webhook endpoint |
| `COOLIFY_WEBHOOK_TOKEN` | Coolify deploy webhook token    |

### Coolify environment variables

| Variable               | Required | Description                               |
| ---------------------- | -------- | ----------------------------------------- |
| `DATABASE_URL`         | ✅       | Postgres connection string                |
| `POSTGRES_USER`        | ✅       | Postgres superuser                        |
| `POSTGRES_PASSWORD`    | ✅       | Postgres password                         |
| `POSTGRES_DB`          | ✅       | Postgres database name                    |
| `ORIGIN`               | ✅       | Public app URL, no trailing slash         |
| `BETTER_AUTH_SECRET`   | ✅       | Random secret (`openssl rand -base64 32`) |
| `GITHUB_CLIENT_ID`     | optional | GitHub OAuth                              |
| `GITHUB_CLIENT_SECRET` | optional | GitHub OAuth                              |

---

## Scripts Reference

| Script                    | Description                 |
| ------------------------- | --------------------------- |
| `bun run dev`             | Dev server                  |
| `bun run build`           | Production build            |
| `bun run preview`         | Preview production build    |
| `bun run check`           | Svelte typecheck            |
| `bun run lint`            | Prettier + ESLint           |
| `bun run format`          | Prettier autofix            |
| `bun run test:unit`       | All Vitest projects         |
| `bun run test:e2e`        | Playwright E2E              |
| `bun run db:start`        | Start local Postgres        |
| `bun run db:generate`     | Generate Drizzle migrations |
| `bun run db:migrate`      | Apply migrations            |
| `bun run db:push`         | Push schema directly (dev)  |
| `bun run db:studio`       | Drizzle Studio UI           |
| `bun run storybook`       | Storybook dev server        |
| `bun run build-storybook` | Storybook static build      |
