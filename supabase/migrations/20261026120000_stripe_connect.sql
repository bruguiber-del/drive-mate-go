-- Cuenta conectada de Stripe de cada conductor — hace falta antes de poder
-- repartirle ningún pago. Nullable: no todos los conductores la tendrán
-- todavía, y seguir sin ella no debe romper nada que no dependa de cobrar.
alter table public.profiles
  add column stripe_connect_account_id text,
  add column stripe_connect_onboarded boolean not null default false;

comment on column public.profiles.stripe_connect_account_id is
  'Id de la cuenta Express de Stripe Connect de este conductor (acct_...), para poder transferirle su parte de cada cobro.';
comment on column public.profiles.stripe_connect_onboarded is
  'true solo cuando Stripe confirma que el conductor completó el alta (identidad + cuenta bancaria) y puede recibir pagos de verdad.';
