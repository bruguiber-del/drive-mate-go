insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

create policy "usuarios suben sus documentos de verificación"
on storage.objects for insert to authenticated
with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "usuarios leen sus documentos de verificación"
on storage.objects for select to authenticated
using (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('driver_license', 'vehicle')),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'needs_review')),
  reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.verification_requests enable row level security;

create policy "usuarios ven sus solicitudes"
on public.verification_requests for select to authenticated
using (user_id = auth.uid());

create policy "usuarios crean sus solicitudes"
on public.verification_requests for insert to authenticated
with check (user_id = auth.uid() and status = 'pending');
