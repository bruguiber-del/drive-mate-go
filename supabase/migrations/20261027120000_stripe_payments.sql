-- Columnas para el lado "pasajero" del cobro (cualquier usuario puede tener
-- ambas: una cuenta Connect para cobrar como conductor y una tarjeta
-- guardada para pagar como pasajero, son roles, no cuentas distintas).
alter table public.profiles
  add column stripe_customer_id text;

comment on column public.profiles.stripe_customer_id is
  'Id del Customer de Stripe de este usuario (cus_...), para poder cobrarle con la tarjeta que haya guardado cuando viaje como pasajero.';

-- Guarda qué PaymentIntent retiene el dinero de este tramo concreto, para
-- poder capturar el importe final exacto al bajarse (y para no crear dos
-- retenciones si la pantalla se refresca).
alter table public.trip_passengers
  add column stripe_payment_intent_id text;

comment on column public.trip_passengers.stripe_payment_intent_id is
  'PaymentIntent (modo retención manual) creado al aceptar a este pasajero — se captura por el importe final real al bajarse.';
