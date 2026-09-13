-- Stripe: cobro real de los planes (13-09-2026, decidido con Jorge: sin
-- paso provisional de aprobación). Respondi crea los productos y precios en
-- Stripe a partir de sus planes; el cliente paga con Stripe Checkout; los
-- avisos (webhooks) de Stripe activan el plan, recargan los créditos en cada
-- cobro y reflejan impagos y bajas.

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_product_id text;

ALTER TABLE public.organizaciones
  -- Estado de la suscripción en Stripe: activa, impagada, cancelada (null: sin Stripe)
  ADD COLUMN IF NOT EXISTS stripe_estado text,
  -- Fin del periodo pagado (la fecha de renovación)
  ADD COLUMN IF NOT EXISTS stripe_periodo_fin timestamptz,
  -- El cliente ha pedido la baja: el plan sigue hasta el fin del periodo
  ADD COLUMN IF NOT EXISTS stripe_cancelar_al_final boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizaciones DROP CONSTRAINT IF EXISTS organizaciones_stripe_estado_check;
ALTER TABLE public.organizaciones ADD CONSTRAINT organizaciones_stripe_estado_check
  CHECK (stripe_estado IS NULL OR stripe_estado IN ('activa', 'impagada', 'cancelada'));

CREATE INDEX IF NOT EXISTS idx_organizaciones_stripe_customer ON public.organizaciones (stripe_customer_id);

-- Cada aviso de Stripe se apunta una vez: si Stripe lo reenvía, no se aplica dos veces
CREATE TABLE IF NOT EXISTS public.stripe_eventos (
  id text PRIMARY KEY,
  tipo text NOT NULL,
  tenant_id uuid,
  recibido_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_eventos ENABLE ROW LEVEL SECURITY;
-- Solo el servidor (service_role) lee y escribe; nadie más
REVOKE ALL ON public.stripe_eventos FROM anon, authenticated, PUBLIC;
