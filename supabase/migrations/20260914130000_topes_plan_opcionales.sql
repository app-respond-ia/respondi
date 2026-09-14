-- ---------------------------------------------------------------------------
-- LOS TOPES DE UN PLAN PUEDEN QUEDAR EN BLANCO (14-09-2026)
--
-- Decidido con Jorge: los planes se diferencian por sucursales, usuarios y
-- créditos, NO por canales. El motivo es que el tope de canales no separa
-- nada: solo hay cuatro tipos (WhatsApp, Instagram, Facebook y correo) y la
-- tabla `channels` ya tiene UNIQUE (tenant_id, branch_id, tipo), así que una
-- sucursal nunca puede tener más de cuatro. Poner "1 canal" en Starter no
-- hacía al plan más pequeño, solo obligaba a una peluquería con WhatsApp e
-- Instagram a saltar de 29 $ a 59 $.
--
-- El código ya entiende NULL como "sin tope" (`fueraDelPlan` en
-- src/app/actions/canales.ts, y las pantallas de Facturación y Canales), pero
-- la columna no admitía nulos, así que esa rama no se podía usar.
--
-- Reversible y sin tocar datos: solo se quita la obligación de tener valor.
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans ALTER COLUMN canales_max DROP NOT NULL;
ALTER TABLE public.plans ALTER COLUMN sucursales_max DROP NOT NULL;

COMMENT ON COLUMN public.plans.canales_max IS
  'Tope de canales de toda la organización. NULL = sin tope, que es lo normal: los planes se diferencian por sucursales, usuarios y créditos.';
COMMENT ON COLUMN public.plans.sucursales_max IS
  'Tope de sucursales activas. NULL = sin tope. Es el diferenciador principal entre planes.';
