-- País del perfil, junto a la ciudad que ya existía — para que el
-- desplegable de ciudad sepa de qué país buscar (de momento solo hay
-- lista curada de ciudades para España; el resto de países usan texto
-- libre en el cliente, pero el campo país sigue siendo útil igual).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;
