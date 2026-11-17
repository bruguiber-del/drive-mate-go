alter table public.recurring_trips add column if not exists last_reminded_date date;
alter table public.trips add column if not exists reminder_sent_at timestamptz;