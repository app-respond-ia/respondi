-- Piezas para las automatizaciones que quedan (12-09-2026). Todo añade.
--
-- 1. Intereses de producto: quién ha preguntado por qué producto, y a qué
--    precio lo vio. Lo alimentan la IA (al buscar en la tienda) y la lista
--    de espera; lo consumen "Te aviso cuando vuelva" y "Bajó de precio".
CREATE TABLE IF NOT EXISTS public.intereses_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  -- El producto en la tienda (gid de Shopify) y cómo se llamaba
  producto_id text NOT NULL,
  producto_nombre text NOT NULL,
  producto_enlace text,
  -- 'espera': quiere que se le avise cuando vuelva · 'consulta': preguntó por él
  tipo text NOT NULL CHECK (tipo IN ('espera', 'consulta')),
  precio_visto numeric,
  moneda text,
  avisado_en timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intereses_producto_contacto_fk FOREIGN KEY (contact_id)
    REFERENCES public.contacts (id) ON DELETE CASCADE,
  CONSTRAINT intereses_producto_sucursal_fk FOREIGN KEY (branch_id)
    REFERENCES public.sucursales (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS intereses_producto_unicos
  ON public.intereses_producto (branch_id, contact_id, producto_id, tipo);
CREATE INDEX IF NOT EXISTS idx_intereses_producto_pendientes
  ON public.intereses_producto (branch_id, tipo) WHERE avisado_en IS NULL;

ALTER TABLE public.intereses_producto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intereses_producto_ver ON public.intereses_producto;
CREATE POLICY intereses_producto_ver ON public.intereses_producto FOR SELECT USING (
  (SELECT is_super_admin())
  OR (tenant_id = (SELECT auth_tenant_id()) AND branch_id IN (SELECT auth_sucursales()))
);

COMMENT ON TABLE public.intereses_producto IS
  'Productos por los que ha preguntado cada cliente (para avisar cuando vuelva el stock o baje el precio).';

-- 2. Baja de promociones: el cliente responde "BAJA" y no se le manda más
--    marketing, diga lo que diga Shopify.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS no_promociones boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.contacts.no_promociones IS
  'true = el cliente pidió no recibir promociones (respondió BAJA). Manda sobre el consentimiento de Shopify.';

-- 3. Origen externo en la lista de precios: para que "Importar el catálogo"
--    actualice cada producto de Shopify sin duplicarlo ni pisar los que el
--    negocio añadió a mano.
ALTER TABLE public.price_list ADD COLUMN IF NOT EXISTS origen_externo text;
CREATE INDEX IF NOT EXISTS idx_price_list_origen_externo
  ON public.price_list (branch_id, origen_externo) WHERE origen_externo IS NOT NULL;
COMMENT ON COLUMN public.price_list.origen_externo IS
  'Identificador del producto en la tienda online (gid de Shopify) si vino de la importación; vacío si lo creó el negocio.';
