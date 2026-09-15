-- 15-09-2026. La calculadora de totales pasa a formar parte de la skill de
-- precios (Jorge: "no son presupuestos, es un total y ya"). La skill aparte
-- «Hacer presupuestos» se retira: estaba oculta para clientes y solo la tenía
-- encendida la sucursal de pruebas.

update skills_globales
set nombre = 'Precios y totales',
    descripcion = 'La IA responde precios de tu lista y suma el total de varios artículos, servicios o cantidades.'
where slug = 'consultar_catalogo';

delete from skills where skill_global_id in (select id from skills_globales where slug = 'presupuestos');
delete from skills_globales where slug = 'presupuestos';
