-- Antes no quedaba ningún registro de que alguien hubiera aceptado los
-- Términos/Privacidad al crear la cuenta — ni checkbox en el registro, ni
-- columna donde guardarlo. Guarda CUÁNDO aceptó, no solo un true/false, por
-- si algún día cambian los términos y hace falta saber si aceptó la
-- versión vigente en ese momento.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
