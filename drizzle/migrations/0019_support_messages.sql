create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  message text not null,
  context text,
  created_at timestamptz not null default now()
);
grant all on public.support_messages to service_role;
alter table public.support_messages enable row level security;