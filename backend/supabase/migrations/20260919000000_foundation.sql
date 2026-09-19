-- Infrastructure only. Add domain tables in later migrations.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- Reserved for the future API/worker. Clients can only read their own jobs.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  parameters jsonb not null default '{}'::jsonb,
  result_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_user_created_idx on public.jobs (user_id, created_at desc);
alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;
grant select on public.jobs to authenticated;
grant all on public.jobs to service_role;
create policy "Read own jobs" on public.jobs
  for select to authenticated using ((select auth.uid()) = user_id);

-- Private files: always use <user-id>/<filename>, including nested subfolders.
insert into storage.buckets (id, name, public, file_size_limit)
values ('plan-assets', 'plan-assets', false, 52428800)
on conflict (id) do nothing;

create policy "Read own plan assets" on storage.objects
  for select to authenticated
  using (bucket_id = 'plan-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Upload own plan assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'plan-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Update own plan assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'plan-assets' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'plan-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Delete own plan assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'plan-assets' and (storage.foldername(name))[1] = (select auth.uid()::text));
