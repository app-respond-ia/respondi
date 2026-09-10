-- Migration: añadir skill "Novedades del día" y backfill a sucursales existentes
--
-- "Novedades del día" ya existía en la práctica: generarRespuesta.ts
-- inyecta daily_updates en el prompt de la IA de forma incondicional,
-- sin pasar por el sistema de skills (a diferencia de escalar_humano/
-- etiquetar_conversacion, que sí están gateadas por activeSkills). Este
-- cambio la convierte en una skill togglable de verdad.
--
-- El código de generarRespuesta.ts se actualiza para condicionar esa
-- inyección a activeSkills.has('novedades_dia'). Como activeSkills se
-- calcula solo a partir de filas EXPLÍCITAS en la tabla skills (sin
-- fallback a activa_por_defecto, a diferencia de la pantalla de
-- cliente), sin este backfill todas las sucursales existentes dejarían
-- de recibir novedades en el prompt de golpe. Este backfill preserva el
-- comportamiento actual activándola explícitamente en todas.

-- 1. Registrar la skill en el catálogo global
INSERT INTO skills_globales (nombre, descripcion, slug, cliente_puede_toggle, activa_por_defecto, orden)
VALUES (
  'Novedades del día',
  'La IA tiene en cuenta avisos y novedades temporales de la sucursal (promociones, cierres, incidencias) al responder.',
  'novedades_dia',
  true,
  true,
  7
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Backfill: activarla explícitamente en todas las sucursales existentes
INSERT INTO skills (tenant_id, branch_id, skill_global_id, nombre, activo, orden)
SELECT
  s.tenant_id,
  s.id,
  sg.id,
  sg.nombre,
  true,
  0
FROM sucursales s
CROSS JOIN (SELECT id, nombre FROM skills_globales WHERE slug = 'novedades_dia') sg
ON CONFLICT (branch_id, skill_global_id) DO NOTHING;
