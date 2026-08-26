# Supabase Migrations

This project uses Supabase CLI migrations as the source of truth for database schema changes.

## Files

- `supabase/config.toml`: Local Supabase CLI configuration. It does not contain credentials.
- `supabase/migrations/`: Version-controlled SQL migrations applied in timestamp order.
- `.github/workflows/deploy.yml`: Production deployment workflow. It applies pending Supabase migrations before deploying to Vercel.
- `supabase_schema.sql`: Deprecated reference file. Do not run it during deployment.

## Required GitHub Values

Create these as GitHub Actions secrets in the `production` environment:

- `SUPABASE_ACCESS_TOKEN`: Supabase personal access token for the CLI.
- `SUPABASE_DB_PASSWORD`: Production database password.
- `VERCEL_TOKEN`: Vercel token with access to this project.

Create these as GitHub Actions variables in the `production` environment:

- `SUPABASE_PROJECT_ID`: Production Supabase project ref, for example the `<project-ref>` in `https://<project-ref>.supabase.co`.
- `VERCEL_ORG_ID`: Vercel team/user ID.
- `VERCEL_PROJECT_ID`: Vercel project ID.
- `VITE_SUPABASE_URL`: Production Supabase URL injected into the Vite build.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Production Supabase publishable key injected into the Vite build.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are browser-exposed Vite build variables. They are not private once deployed, but they still must be configured in GitHub Actions because the production build runs in the GitHub runner before the prebuilt output is uploaded to Vercel.

## Production Flow

1. Push to `main`.
2. GitHub Actions starts the `Deploy` workflow.
3. The `migrate-production` job installs the Supabase CLI.
4. The job links to `SUPABASE_PROJECT_ID`.
5. `supabase db push --dry-run` prints pending migrations.
6. `supabase db push` applies only pending migrations.
7. If migration fails, the workflow stops and Vercel is not deployed.
8. If migration succeeds, the `deploy-production` job builds and deploys the frontend with Vercel.

Disable Vercel's automatic Git deployments for this project when using this workflow. Otherwise Vercel can start a deployment directly from the Git push before the migration job finishes.

## Local Development

Install the Supabase CLI and make sure Docker is running.

Initialize the local Supabase stack:

```bash
supabase start
```

Apply all local migrations from scratch:

```bash
supabase db reset
```

Create a new migration:

```bash
supabase migration new add_example_column
```

Edit the generated file in `supabase/migrations/`, then test it locally:

```bash
supabase db reset
```

Review local and remote migration status:

```bash
supabase migration list
```

Link your local checkout to a remote project when you need to inspect or push migrations manually:

```bash
supabase login
supabase link --project-ref <project-ref>
```

Preview pending remote migrations:

```bash
supabase db push --dry-run
```

Apply pending remote migrations manually:

```bash
supabase db push
```

Generate a migration from local database changes:

```bash
supabase db diff -f describe_change_here
```

Use `db diff` for local development only. Do not make production schema edits directly in the Supabase dashboard and then expect production deployment to infer them safely.

## How Pending Migrations Are Determined

`supabase db push` does not perform a general schema diff on every deployment. It compares the timestamped files in `supabase/migrations/` with rows in the remote `supabase_migrations.schema_migrations` table. Migrations already recorded there are skipped. Missing migration timestamps are applied in order.

## Schema Drift

Schema drift happens when the live database changes outside version-controlled migrations.

To handle drift safely:

1. Stop making direct production schema changes.
2. Run `supabase migration list` to compare local and remote migration history.
3. If a legitimate remote schema change exists outside migrations, capture it with `supabase db pull` or recreate it as a new migration.
4. Test locally with `supabase db reset`.
5. Commit the migration.
6. Let CI apply it with `supabase db push`.

Use `supabase migration repair` only when the migration history table is wrong and the actual schema state is already known. It changes migration tracking records; it does not run or undo SQL.

## Environments

Development should use the local Supabase stack.

Staging and production should use separate Supabase projects, separate Vercel projects or environments, and separate GitHub environment secrets. Do not reuse production secrets in development or staging workflows.

If staging is added, create a separate workflow or job that targets staging secrets, for example `STAGING_SUPABASE_PROJECT_ID` and `STAGING_SUPABASE_DB_PASSWORD`, and trigger it from a non-production branch.

## Failed Migrations

If a migration fails in CI:

1. The Vercel deploy job will not run.
2. Read the failing SQL error in the GitHub Actions logs.
3. If the migration was not recorded as applied, fix the migration file on the branch and push again.
4. If some SQL ran before the failure, inspect the database manually and write a forward-fix migration if needed.
5. Avoid editing migrations that have already been successfully applied to shared or production databases.
6. Avoid `supabase db reset --linked` on production. It is destructive.

Rollbacks should usually be explicit forward migrations that restore the previous behavior, because Supabase migration history is append-only in normal deployments.
