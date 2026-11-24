# AGENTS.md

Aperio is a French-language Next.js 16 (App Router, RSC, Turbopack) marketplace: free stock photos plus limited-edition prints. React 19, TypeScript strict, Tailwind 4, Drizzle ORM/Postgres, custom JWT auth (no NextAuth).

## Commands

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # authoritative app-wide TS/build gate
npm run start
npm run db:push        # drizzle-kit push; no db:migrate script exists
npm run db:import      # Unsplash import, needs UNSPLASH_ACCESS_KEY
npx tsx scripts/seed.ts   # seed has no npm script
```

`npm run lint` and `npm run typecheck` scan the untracked vendored `ECC/`, `skills/`, and `.opencode/` tooling and currently fail there. For app code use:

```bash
npx eslint app components lib db scripts proxy.ts drizzle.config.ts next.config.ts
```

Treat `ECC/`, `skills/`, and `.opencode/` as vendored agent tooling: do not edit them to fix app issues.

## Verification scripts (no test framework)

Regression checks are standalone `scripts/verify-*.ts` files. Most import `server-only`, which is not a project dependency; point `NODE_PATH` at Next's bundled shim and enable the `react-server` condition:

```powershell
$env:NODE_PATH = "node_modules/next/dist/compiled"
$env:DATABASE_URL = "postgresql://user:pass@localhost:5432/app_db"
npx tsx --conditions react-server scripts/verify-finalize.ts
```

- Run one verification script at a time; they snapshot/restore row counts and concurrent runs cause false failures.
- `verify-idempotency` and `verify-edition-input` require a running dev server on `:3000` plus the seeded demo accounts. The others hit the DB or import handlers directly.
- `verify-images` is read-only; the others create and clean up test rows. All DB-touching scripts refuse non-local databases.

## Database / environment safety

- `.env` and `.env.local` exist and currently point at a hosted Neon database. Never print, edit, or commit them.
- `scripts/lib/assert-local-db.ts` makes seed, import, repair, and destructive verify scripts exit unless `DATABASE_URL` is `localhost`/`127.0.0.1`/`::1` and `NODE_ENV` is not `production`. Override `DATABASE_URL` for local DB work.
- Env loading differs: `drizzle.config.ts` loads only `.env.local`; Next prefers `.env.local` over `.env`; some scripts load only `.env`. Confirm the target database before any write. `db:push` against the checked-in `.env.local` targets that hosted DB.
- Uploads write to `public/uploads` (and private HD sources to `storage/hd`); this is local-filesystem storage, not serverless-safe.

## Layout and conventions

- `app/api/**/route.ts` = REST backend, `app/**` = pages, `components/` = client components, `lib/` = business logic, `db/schema.ts` = Drizzle schema, `proxy.ts` = Next 16 edge proxy (replaces middleware) for JWT/RBAC.
- Imports resolve from the repo root (`baseUrl`): both `@/...` and bare `lib/...`, `db/...`, `components/...`.
- `lib/session.ts` is edge-safe; most other `lib/*` modules import `server-only`.
- Roles are `buyer`, `photographer`, `admin`. `proxy.ts` is only a coarse route guard; API routes must re-check auth and ownership server-side.
- Payment/webhook invariants live in `lib/payments/`, `lib/orders.ts`, and `lib/webhookAuth.ts`: webhooks fail closed without a configured secret, are idempotent via `webhook_events`, and order finalization is transactional/idempotent. Do not bypass these.
- Keep user-facing copy, API error messages, docs, and comments in French. Currency base is MGA (`lib/money.ts`).
- `README.md` and `ANALYSE.md` are historical and have stale counts (migrations now go through `0014`, schema defines 25 tables). Trust `db/schema.ts`, `drizzle/`, and scripts over prose.

## Anti-Slop Writing Constraints (Unslop)
- Maintain a direct, technical, and highly concise tone. Eliminate corporate fluff or robotic intros/conclusions.
- Avoid overuse of bullet points or unnecessary lists in technical explanations or file documentation.
- **Banned Words List**: Never use words like *delve, tapestry, testament, bustling, paradigm, furthermore, moreover, crucial, vital, essential* in PR descriptions, code comments, or code explanations unless strictly forced by technical conditions.
- **Comment Policy**: Keep inline comments to code strictly functional. They must answer *Why* something is written a certain way, never *What* it does.
