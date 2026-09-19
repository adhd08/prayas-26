# Setup outside the codebase

The code is scaffolded locally. You still need to create/link the cloud projects
and supply their URLs and keys. Follow the sections in order.

## 1. GitHub

Create an empty repository at [GitHub](https://github.com/new), for example
`prayas`. Don't add a README, licence, or gitignore on GitHub; this folder already
contains the scaffold. Choose public or private as you prefer.

From this repository's root folder:

```bash
git add .
git commit -m "Scaffold Prayas app infrastructure"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Local Git has already been initialized. Replace the remote URL before running it.
Authenticate with GitHub CLI (`gh auth login`) or your Git credential manager if
Git asks. Never paste a token into the remote URL. Environment files are ignored;
the `.env.example` files are safe to commit.

## 2. Supabase

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard).
   Pick a region close to your users and API host. Save the database password in
   your password manager.
2. Open the project's **Connect** dialog and copy the **Project URL** and
   **Publishable key** (`sb_publishable_...`). The same two values are used below.
3. Install the repository tools with `npm ci` from the root if not already done.
4. Apply the migration with the Supabase CLI, also from the repository root:

```bash
npx supabase login
npx supabase --workdir backend/supabase link --project-ref YOUR_PROJECT_REF
npx supabase --workdir backend/supabase db push
```

The project ref is the ID in the dashboard URL. The CLI may request the database
password. This is a one-time remote migration; it enables PostGIS, creates the
reserved `jobs` table with row-level security, and creates the private
`plan-assets` storage bucket with per-user file access.

In the dashboard, confirm:

- **Database → Extensions**: `postgis` is enabled.
- **Table Editor**: `jobs` exists and RLS is enabled.
- **Storage**: `plan-assets` exists and is **private**.
- **Authentication → URL Configuration**: for local development, set Site URL to
  `http://localhost:3000` and add `http://localhost:3000/auth/callback` as an allowed
  redirect URL.

Keep the default email auth provider for now. No login/signup UI is implemented.
The code includes session refresh and a PKCE `/auth/callback` code exchange for
future OAuth or magic-link flows. When adding those flows, pass that callback as
the redirect URL. Other email confirmation flows may need their own token-hash
verification route later.

The publishable key belongs in the frontend. Do **not** put a Supabase secret key,
`service_role` key, or database password in `NEXT_PUBLIC_*`. The scaffold does not
need a service-role key. Add a server-only privileged key when implementing the
trusted job writer/worker, with ownership checks on all job endpoints.

### Optional local Supabase

You can use `npx supabase --workdir backend/supabase start` with Docker running, then `npx supabase --workdir backend/supabase db reset`
to apply migrations to that disposable local database. Use the local URL and
keys printed by the CLI in both env files. `db reset` erases local database data;
never use a linked/remote reset as a setup shortcut.

## 3. Local environment

Install Node.js 22 and [uv](https://docs.astral.sh/uv/getting-started/installation/).
On macOS with Homebrew, `brew install uv` installs uv. If you use nvm, `nvm install`
in this repository selects the version in `.nvmrc`.

```bash
npm ci
npm --prefix frontend ci
uv sync --directory backend --locked
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

Only copy the example files the first time; preserve existing filled-in files.
Edit `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_MAP_STYLE_URL=
```

Edit `backend/.env`:

```dotenv
APP_ENV=development
CORS_ORIGINS=["http://localhost:3000"]
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Start `npm run dev:api` and `npm run dev` in separate terminals from the root.
Open <http://localhost:3000> and click **Check API connection**. It should display
`prayas-api: ok`. API docs are at <http://localhost:8000/docs>.

The Supabase label reports whether env values exist, not a successful cloud test.
Before building features, use a test signed-in user to verify the policies:
user A can upload/read `A_USER_ID/example.geojson`; user B cannot access it;
signed-out users cannot read jobs or private files. These live tests need your
project and a login flow, and have not been run as part of the local scaffold.

## 4. Deploy the Python API on Render

The Dockerfile is portable to Railway or Fly.io too. Render has a ready-to-use
`render.yaml` blueprint here, so these steps use Render as the default.

1. Sign in to [Render](https://dashboard.render.com/) with GitHub access.
2. Select **New → Blueprint**, connect the repository, and review `render.yaml`.
   Choose the region and service plan you want before confirming deployment.
3. Fill in the prompted values:
   - `SUPABASE_URL`: your Supabase project URL.
   - `SUPABASE_PUBLISHABLE_KEY`: the same publishable key.
   - `CORS_ORIGINS`: initially `["http://localhost:3000"]`; add the Vercel origin
     after creating it in the next section.
4. Deploy. The API uses `backend` as its root directory and the Dockerfile
   there. It reads Render's `PORT`; the health-check path is `/health`.
5. Copy its HTTPS URL, for example `https://prayas-api-EXAMPLE.onrender.com`.
   Verify `/health` returns `status: ok` and `/docs` loads.

The Dockerfile includes the full Python dependency set and runs as a non-root
user. A Render deployment does not create or migrate a Supabase database.
Sleeping/free services may have cold starts; choose an appropriate service plan
when you need reliable availability and later, long-running workers.

## 5. Deploy Next.js on Vercel

1. Go to [Vercel New Project](https://vercel.com/new) and import the same GitHub repo.
2. Set **Root Directory** to `frontend` and **Framework Preset** to Next.js.
   Keep the standard install/build/output settings. This directory has its own
   `package.json` and `package-lock.json`.
3. Add these environment variables to the intended deployment environments:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Your Render HTTPS URL, without a trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your publishable key |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Optional map provider style URL; omit for now |

4. Deploy and copy the production `.vercel.app` origin.
5. In Render, set `CORS_ORIGINS` to a JSON array of exact permitted origins:

```json
["http://localhost:3000", "https://YOUR_PROJECT.vercel.app"]
```

6. In Supabase **Authentication → URL Configuration**, set Site URL to the Vercel
   production origin and add `https://YOUR_PROJECT.vercel.app/auth/callback` to the
   redirect allowlist. Keep the localhost callback for development.
7. On the live website, click **Check API connection** again.

Public Next.js env values are baked in at build time. **Redeploy Vercel after
changing them.** API env changes also require the Render service to redeploy.
CORS values are origins (no path and no trailing slash), while Auth redirect
entries include `/auth/callback`. For preview deployments, explicitly allow the
specific preview origin in Render and callback in Supabase when you need auth/API
testing there; preferably use a separate development Supabase project.

## 6. Connect your existing domain

In the Vercel project, open **Settings → Domains**, add your domain (and `www` if
desired), then copy the exact DNS records Vercel shows into your domain registrar's
DNS settings. Use the values shown for your project rather than a hardcoded IP.

After verification, add `https://YOUR_DOMAIN` to Render's `CORS_ORIGINS`. Set the
Supabase Site URL to your canonical domain and add
`https://YOUR_DOMAIN/auth/callback`. Add any alternate origin that actually serves
the app, or redirect it to your canonical domain. The API can keep its Render URL.

## 7. v0 and maps

For later UI work, open [v0](https://v0.app/), import the existing GitHub repository,
and work on a branch/PR. Tell v0:

> Work only in frontend. Use the existing Next.js App Router, TypeScript,
> Tailwind, shadcn/ui components, and Supabase clients. Use src/lib/api/client.ts
> for Python API calls. Keep maps client-only with MapLibre and deck.gl.
> Do not replace the backend or implement optimisation in Next.js.

Review the diff before merging; the app needs no v0 API key at runtime.

MapLibre/deck.gl are installed and integrated, but they don't provide map tiles.
The default canvas deliberately has no geographic data. Choose a compatible
basemap provider later, put its style URL in `NEXT_PUBLIC_MAP_STYLE_URL`, and
restrict any public tile token to your domains in that provider's dashboard.
Keep attribution enabled. Heatmap, GeoJSON, and marker layer packages are ready
for later use; no layers or planning data are added yet.

## What remains deliberately unimplemented

Login/signup screens, saved plans, data imports, heatmap content, facility
placement, real job submission/status persistence, and the worker.
The [Prayas pathway module](PATHWAYS.md) provides local post-zoning computation;
it is not yet wired to cloud job execution.
The jobs endpoints authenticate and then return HTTP 501; they do not enqueue
fake work. The frontend polling helper is ready for the eventual implementation.

No Upstash account, VPS, separate database host, or separate file-storage account
is needed for this foundation.

## References

- [Supabase SSR clients and token refresh](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)
- [Supabase private storage policies](https://supabase.com/docs/guides/storage/security/access-control)
- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Vercel domain setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Render Docker deployments](https://render.com/docs/docker)
- [deck.gl overlay integration](https://deck.gl/docs/api-reference/mapbox/mapbox-overlay)
