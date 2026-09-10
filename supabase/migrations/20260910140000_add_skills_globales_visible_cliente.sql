-- Migration: añadir columna de visibilidad a skills_globales
--
-- Permite ocultar una skill del panel de cliente (y del onboarding)
-- sin borrarla del catálogo ni afectar su gestión desde /superadmin,
-- para casos como "Hacer presupuestos" (ver docs/estado/motor-ia.md):
-- la skill existe en el panel de superadmin y sigue en el catálogo,
-- pero no tiene ninguna herramienta real detrás todavía, así que no
-- debe verla ni activarla un cliente hasta que esté lista de verdad.
--
-- Default true para no ocultar nada de lo que ya existe salvo lo que
-- se desactiva explícitamente a continuación.

ALTER TABLE skills_globales
  ADD COLUMN IF NOT EXISTS visible_cliente boolean NOT NULL DEFAULT true;

UPDATE skills_globales
SET visible_cliente = false
WHERE slug = 'presupuestos';
