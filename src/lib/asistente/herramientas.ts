import { getEtiquetas, crearEtiqueta, actualizarEtiqueta, eliminarEtiqueta } from '@/app/actions/etiquetas'
import { getReglas, crearRegla, actualizarRegla, eliminarRegla } from '@/app/actions/reglas'
import { getPrecios, crearPrecio, actualizarPrecio, eliminarPrecio } from '@/app/actions/precios'
import { getHorarios, saveHorarios } from '@/app/actions/horarios'
import { getAgenda, guardarAjustesAgenda, guardarRecurso, borrarRecurso } from '@/app/actions/agenda'
import { getAutomatizaciones, cambiarAutomatizacion } from '@/app/actions/automatizaciones'
import { getUsuarios, invitarUsuario, actualizarUsuario } from '@/app/actions/usuarios'
import { getRolesPersonalizados } from '@/app/actions/roles'
import { getCanales } from '@/app/actions/canales'
import { getDatosPerfilSucursal, savePerfilSucursal } from '@/app/actions/perfil'
import { createClient } from '@/utils/supabase/server'
import { getAuthContext } from '@/lib/auth-context'
import type { HorarioDia } from '@/lib/horarios'

// LAS HERRAMIENTAS DEL ASISTENTE DEL PANEL (14-09-2026).
//
// Cada herramienta llama a la MISMA acción que usa la pantalla. Eso no es
// casualidad: así el asistente hereda gratis los permisos, las validaciones
// y la auditoría, y nunca puede hacer algo que el usuario no pudiera hacer
// a mano. Aquí no se escribe en la base de datos directamente.
//
// Las de mirar se ejecutan al momento. Las de cambiar NO: devuelven una
// propuesta que se guarda en el servidor y solo corre cuando el cliente
// pulsa Confirmar (ver `src/app/actions/asistente.ts`).

export interface Herramienta {
  nombre: string
  // Sección de permisos que toca, para volver a comprobarla al confirmar
  seccion: string | null
  escribe: boolean
  destructiva?: boolean
  definicion: any
  // Texto de la tarjeta de confirmación, en cristiano
  resumen?: (args: any) => Promise<string>
  ejecutar: (args: any) => Promise<{ ok: boolean; mensaje: string; datos?: any }>
}

// --------------------------------------------------------------------------
// Ayudas
// --------------------------------------------------------------------------
const texto = (v: any, max = 200) => String(v ?? '').trim().slice(0, max)
const ok = (mensaje: string, datos?: any) => ({ ok: true, mensaje, datos })
const mal = (mensaje: string) => ({ ok: false, mensaje })

// Un fallo de la acción se le cuenta a la IA tal cual, para que lo explique.
function resultado(r: any, bien: string) {
  if (r?.success) return ok(bien, r.data)
  return mal(r?.error || 'No se ha podido hacer.')
}

// La IA trabaja con nombres, no con identificadores: nadie dice "borra la
// etiqueta 8f3a-...". Se busca por nombre, sin distinguir mayúsculas ni
// acentos, y si hay más de una coincidencia se pide que concrete.
function limpiar(s: string) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function buscarPorNombre<T extends { id: string; nombre?: string | null }>(lista: T[], nombre: string): { fila?: T; error?: string } {
  const buscado = limpiar(nombre)
  if (!buscado) return { error: 'Dime cuál.' }
  const exactas = lista.filter(x => limpiar(x.nombre || '') === buscado)
  if (exactas.length === 1) return { fila: exactas[0] }
  if (exactas.length > 1) return { error: `Hay varias con el nombre "${nombre}". Concreta un poco más.` }
  const parciales = lista.filter(x => limpiar(x.nombre || '').includes(buscado))
  if (parciales.length === 1) return { fila: parciales[0] }
  if (parciales.length > 1) return { error: `No sé a cuál te refieres. Puede ser: ${parciales.slice(0, 6).map(x => x.nombre).join(', ')}.` }
  const nombres = lista.map(x => x.nombre).filter(Boolean).slice(0, 10).join(', ')
  return { error: `No encuentro "${nombre}".${nombres ? ` Los que hay son: ${nombres}.` : ''}` }
}

// Colores: la IA puede decir "rojo" o dar un hexadecimal
const COLORES: Record<string, string> = {
  rojo: '#ef4444', naranja: '#f97316', ambar: '#f59e0b', amarillo: '#eab308',
  verde: '#22c55e', esmeralda: '#10b981', turquesa: '#14b8a6', azul: '#3b82f6',
  indigo: '#6366f1', morado: '#8b5cf6', violeta: '#a855f7', rosa: '#ec4899',
  gris: '#64748b', negro: '#0f172a'
}
function color(v: any, porDefecto = '#64748b') {
  const s = limpiar(v)
  if (/^#[0-9a-f]{6}$/i.test(String(v || '').trim())) return String(v).trim()
  return COLORES[s] || porDefecto
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// --------------------------------------------------------------------------
// Definiciones de herramienta, en el formato que entiende OpenAI
// --------------------------------------------------------------------------
const f = (name: string, description: string, properties: any, required: string[] = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } }
})

const S = { type: 'string' as const }
const B = { type: 'boolean' as const }
const N = { type: 'number' as const }

export const HERRAMIENTAS: Herramienta[] = [
  // ------------------------------------------------------------------ MIRAR
  {
    nombre: 'ver_etiquetas', seccion: 'etiquetas', escribe: false,
    definicion: f('ver_etiquetas', 'Lista las etiquetas con las que la IA clasifica las conversaciones de esta sucursal.', {}),
    ejecutar: async () => {
      const r = await getEtiquetas()
      if (!r.success) return mal(r.error || 'No se han podido leer.')
      const lista = (r.data as any[]) || []
      return ok(lista.length ? `${lista.length} etiquetas.` : 'No hay ninguna etiqueta todavía.',
        lista.map(e => ({ nombre: e.nombre, cuando: e.descripcion_intencion, activa: e.activa, color: e.color, usada_este_mes: e.aplicadas_este_mes })))
    }
  },
  {
    nombre: 'ver_reglas', seccion: 'reglas', escribe: false,
    definicion: f('ver_reglas', 'Lista las reglas de escalado: cuándo la IA abre un caso para que lo atienda una persona.', {}),
    ejecutar: async () => {
      const r = await getReglas()
      if (!r.success) return mal(r.error || 'No se han podido leer.')
      const lista = (r.data as any[]) || []
      return ok(lista.length ? `${lista.length} reglas.` : 'No hay ninguna regla todavía.',
        lista.map(x => ({ nombre: x.nombre, cuando: x.descripcion_intencion, tipo_caso: x.tipo_caso, prioridad: x.prioridad_default, activa: x.activa })))
    }
  },
  {
    nombre: 'ver_precios', seccion: 'precios', escribe: false,
    definicion: f('ver_precios', 'Lista los productos y servicios del negocio con su precio, si la IA los puede contar y si se pueden reservar.', {}),
    ejecutar: async () => {
      const r = await getPrecios()
      if (!r.success) return mal(r.error || 'No se han podido leer.')
      const lista = (r.data as any[]) || []
      return ok(lista.length ? `${lista.length} artículos.` : 'La lista de precios está vacía.',
        lista.map(p => ({ nombre: p.nombre, tipo: p.tipo, precio: p.precio, moneda: p.moneda, precio_tipo: p.precio_tipo, disponible: p.disponible, la_ve_la_ia: p.visible_ia, reservable: p.reservable, duracion_minutos: p.duracion_minutos })))
    }
  },
  {
    nombre: 'ver_horarios', seccion: 'perfil', escribe: false,
    definicion: f('ver_horarios', 'El horario de apertura del negocio, o el horario en el que contesta la IA.', { tipo: { ...S, enum: ['negocio', 'ia'] } }),
    ejecutar: async (a) => {
      const tipo = a?.tipo === 'ia' ? 'ia' : 'negocio'
      const r = await getHorarios(tipo)
      if (!r.success) return mal(r.error || 'No se ha podido leer.')
      return ok(`Horario de ${tipo === 'ia' ? 'la IA' : 'apertura'}.`,
        ((r.data as any[]) || []).map(d => ({ dia: DIAS[d.dia_semana], cerrado: d.cerrado, franjas: (d.franjas || []).map((x: any) => `${x.apertura}-${x.cierre}`) })))
    }
  },
  {
    nombre: 'ver_agenda', seccion: 'agenda', escribe: false,
    definicion: f('ver_agenda', 'Cómo está configurada la agenda de reservas: si está activa, sus reglas, y qué recursos (personas, mesas, salas) hay.', {}),
    ejecutar: async () => {
      const r: any = await getAgenda()
      if (!r.success) return mal(r.error || 'No se ha podido leer.')
      const a = r.data?.ajustes || {}
      return ok(a.activa ? 'La agenda está activa.' : 'La agenda está apagada.', {
        activa: a.activa, modo: a.modo, confirmacion: a.confirmacion,
        antelacion_minima_minutos: a.antelacion_minima_minutos, antelacion_maxima_dias: a.antelacion_maxima_dias,
        cancelacion_horas: a.cancelacion_horas, grupo_grande_desde: a.grupo_grande_desde,
        enlace_publico: a.enlace_publico, enlace_activo: a.enlace_activo,
        recursos: (r.data?.recursos || []).map((x: any) => ({ nombre: x.nombre, tipo: x.tipo, activo: x.activo }))
      })
    }
  },
  {
    nombre: 'ver_automatizaciones', seccion: null, escribe: false,
    definicion: f('ver_automatizaciones', 'Las automatizaciones disponibles y cuáles están encendidas.', {}),
    ejecutar: async () => {
      const r: any = await getAutomatizaciones()
      if (!r.success) return mal(r.error || 'No se han podido leer.')
      const lista = r.data?.automatizaciones || []
      return ok(`${lista.filter((x: any) => x.activa).length} encendidas de ${lista.length}.`,
        lista.map((x: any) => ({ nombre: x.nombre, clave: x.clave, activa: x.activa, estado: x.estado, descripcion: x.descripcion })))
    }
  },
  {
    nombre: 'ver_usuarios', seccion: 'usuarios', escribe: false,
    definicion: f('ver_usuarios', 'Las personas que tienen acceso a esta cuenta de Respondi y con qué rol.', {}),
    ejecutar: async () => {
      const r: any = await getUsuarios()
      if (!r.success) return mal(r.error || 'No se han podido leer.')
      const lista = r.data || []
      return ok(`${lista.length} personas.`, lista.map((u: any) => ({ nombre: u.nombre, email: u.email, rol: u.rol_personalizado?.nombre || u.rol, activo: u.activo })))
    }
  },
  {
    nombre: 'ver_canales', seccion: 'canales', escribe: false,
    definicion: f('ver_canales', 'Los canales conectados (WhatsApp, Instagram, Facebook, correo) y su estado. Nunca enseña claves ni tokens.', {}),
    ejecutar: async () => {
      const r: any = await getCanales()
      if (!r.success) return mal(r.error || 'No se han podido leer.')
      const lista = r.data?.canales || []
      return ok(lista.length ? `${lista.length} canales.` : 'No hay ningún canal conectado.',
        lista.map((c: any) => ({ tipo: c.tipo, estado: c.estado, numero_o_cuenta: c.numero_visible, problema: c.ultimo_error })))
    }
  },
  {
    nombre: 'ver_negocio', seccion: 'perfil', escribe: false,
    definicion: f('ver_negocio', 'La ficha del negocio: nombre, dirección, idioma, tono de la IA y qué hace fuera de horario.', {}),
    ejecutar: async () => {
      const r: any = await getDatosPerfilSucursal()
      if (!r.success) return mal(r.error || 'No se ha podido leer.')
      const d = r.data || {}
      return ok('Ficha del negocio.', {
        nombre: d.nombreSucursal, direccion: d.direccion, pais: d.pais, zona_horaria: d.timezone, moneda: d.moneda,
        informacion: d.servicios, idioma: d.idioma_base, tono: d.tono,
        mensaje_fuera_de_horario: d.msg_fuera_horario, abre_caso_fuera_de_horario: d.abrir_caso_fuera_horario,
        cuando_contesta_la_ia: d.modo_horario_ia
      })
    }
  },

  // ---------------------------------------------------------------- CAMBIAR
  {
    nombre: 'crear_etiqueta', seccion: 'etiquetas', escribe: true,
    definicion: f('crear_etiqueta', 'Crea una etiqueta nueva para clasificar conversaciones.', {
      nombre: S,
      cuando_usarla: { ...S, description: 'Con qué palabras o intención del cliente debe aplicarla la IA.' },
      color: { ...S, description: 'Nombre de color en español o hexadecimal.' },
      activa: B
    }, ['nombre']),
    resumen: async (a) => `Crear la etiqueta "${texto(a.nombre, 60)}"${a.cuando_usarla ? `, que la IA aplicará cuando ${texto(a.cuando_usarla, 160)}` : ''}.`,
    ejecutar: async (a) => resultado(
      await crearEtiqueta({ nombre: texto(a.nombre, 60), descripcion_intencion: texto(a.cuando_usarla, 400), color: color(a.color), activa: a.activa !== false }),
      `Etiqueta "${texto(a.nombre, 60)}" creada.`)
  },
  {
    nombre: 'cambiar_etiqueta', seccion: 'etiquetas', escribe: true,
    definicion: f('cambiar_etiqueta', 'Cambia una etiqueta que ya existe: su nombre, cuándo se aplica, su color o si está activa.', {
      etiqueta: { ...S, description: 'Nombre actual de la etiqueta.' },
      nombre: { ...S, description: 'Nombre nuevo, si se cambia.' },
      cuando_usarla: S, color: S, activa: B
    }, ['etiqueta']),
    resumen: async (a) => {
      const cambios = [
        a.nombre ? `pasará a llamarse "${texto(a.nombre, 60)}"` : '',
        a.cuando_usarla ? 'cambiará cuándo se aplica' : '',
        a.color ? 'cambiará de color' : '',
        a.activa === true ? 'se activará' : a.activa === false ? 'se desactivará' : ''
      ].filter(Boolean)
      return `La etiqueta "${texto(a.etiqueta, 60)}" ${cambios.length ? cambios.join(', ') : 'no cambia nada'}.`
    },
    ejecutar: async (a) => {
      const r = await getEtiquetas()
      if (!r.success) return mal(r.error || 'No se han podido leer las etiquetas.')
      const { fila, error } = buscarPorNombre((r.data as any[]) || [], a.etiqueta)
      if (!fila) return mal(error!)
      const cambios: any = {}
      if (a.nombre) cambios.nombre = texto(a.nombre, 60)
      if (a.cuando_usarla !== undefined) cambios.descripcion_intencion = texto(a.cuando_usarla, 400)
      if (a.color) cambios.color = color(a.color, fila.color)
      if (a.activa !== undefined) cambios.activa = !!a.activa
      if (!Object.keys(cambios).length) return mal('No me has dicho qué cambiar.')
      return resultado(await actualizarEtiqueta(fila.id, cambios), `Etiqueta "${fila.nombre}" actualizada.`)
    }
  },
  {
    nombre: 'borrar_etiqueta', seccion: 'etiquetas', escribe: true, destructiva: true,
    definicion: f('borrar_etiqueta', 'Borra una etiqueta. Las conversaciones que la tuvieran la pierden.', { etiqueta: S }, ['etiqueta']),
    resumen: async (a) => `Borrar la etiqueta "${texto(a.etiqueta, 60)}". Las conversaciones que la tengan puesta la perderán.`,
    ejecutar: async (a) => {
      const r = await getEtiquetas()
      if (!r.success) return mal(r.error || 'No se han podido leer las etiquetas.')
      const { fila, error } = buscarPorNombre((r.data as any[]) || [], a.etiqueta)
      if (!fila) return mal(error!)
      return resultado(await eliminarEtiqueta(fila.id), `Etiqueta "${fila.nombre}" borrada.`)
    }
  },
  {
    nombre: 'crear_regla', seccion: 'reglas', escribe: true,
    definicion: f('crear_regla', 'Crea una regla de escalado: cuándo la IA deja de contestar y abre un caso para una persona.', {
      nombre: S,
      cuando_escalar: { ...S, description: 'Qué tiene que pasar o pedir el cliente para que se abra el caso.' },
      tipo_caso: S,
      prioridad: { ...S, enum: ['baja', 'media', 'alta', 'urgente'] },
      activa: B
    }, ['nombre', 'cuando_escalar']),
    resumen: async (a) => `Crear la regla "${texto(a.nombre, 60)}": abrir un caso cuando ${texto(a.cuando_escalar, 200)}.`,
    ejecutar: async (a) => resultado(
      await crearRegla({ nombre: texto(a.nombre, 60), descripcion_intencion: texto(a.cuando_escalar, 400), tipo_caso: texto(a.tipo_caso, 60) || undefined, prioridad_default: a.prioridad || 'media', activa: a.activa !== false }),
      `Regla "${texto(a.nombre, 60)}" creada.`)
  },
  {
    nombre: 'cambiar_regla', seccion: 'reglas', escribe: true,
    definicion: f('cambiar_regla', 'Cambia una regla de escalado que ya existe.', {
      regla: { ...S, description: 'Nombre actual de la regla.' },
      nombre: S, cuando_escalar: S, tipo_caso: S,
      prioridad: { ...S, enum: ['baja', 'media', 'alta', 'urgente'] }, activa: B
    }, ['regla']),
    resumen: async (a) => {
      const cambios = [
        a.nombre ? `pasará a llamarse "${texto(a.nombre, 60)}"` : '',
        a.cuando_escalar ? 'cambiará cuándo escala' : '',
        a.prioridad ? `tendrá prioridad ${a.prioridad}` : '',
        a.activa === true ? 'se activará' : a.activa === false ? 'se desactivará' : ''
      ].filter(Boolean)
      return `La regla "${texto(a.regla, 60)}" ${cambios.length ? cambios.join(', ') : 'no cambia nada'}.`
    },
    ejecutar: async (a) => {
      const r = await getReglas()
      if (!r.success) return mal(r.error || 'No se han podido leer las reglas.')
      const { fila, error } = buscarPorNombre((r.data as any[]) || [], a.regla)
      if (!fila) return mal(error!)
      const cambios: any = {}
      if (a.nombre) cambios.nombre = texto(a.nombre, 60)
      if (a.cuando_escalar !== undefined) cambios.descripcion_intencion = texto(a.cuando_escalar, 400)
      if (a.tipo_caso !== undefined) cambios.tipo_caso = texto(a.tipo_caso, 60)
      if (a.prioridad) cambios.prioridad_default = a.prioridad
      if (a.activa !== undefined) cambios.activa = !!a.activa
      if (!Object.keys(cambios).length) return mal('No me has dicho qué cambiar.')
      return resultado(await actualizarRegla(fila.id, cambios), `Regla "${fila.nombre}" actualizada.`)
    }
  },
  {
    nombre: 'borrar_regla', seccion: 'reglas', escribe: true, destructiva: true,
    definicion: f('borrar_regla', 'Borra una regla de escalado.', { regla: S }, ['regla']),
    resumen: async (a) => `Borrar la regla de escalado "${texto(a.regla, 60)}". La IA dejará de abrir casos por ese motivo.`,
    ejecutar: async (a) => {
      const r = await getReglas()
      if (!r.success) return mal(r.error || 'No se han podido leer las reglas.')
      const { fila, error } = buscarPorNombre((r.data as any[]) || [], a.regla)
      if (!fila) return mal(error!)
      return resultado(await eliminarRegla(fila.id), `Regla "${fila.nombre}" borrada.`)
    }
  },
  {
    nombre: 'crear_articulo', seccion: 'precios', escribe: true,
    definicion: f('crear_articulo', 'Añade un producto o un servicio a la lista de precios. Si es un servicio que se reserva con cita, pon reservable y su duración.', {
      nombre: S,
      tipo: { ...S, enum: ['producto', 'servicio'] },
      precio: N,
      precio_tipo: { ...S, enum: ['exacto', 'desde', 'consultar'] },
      descripcion: S,
      la_ve_la_ia: { ...B, description: 'Si la IA puede contárselo a los clientes. Por defecto sí.' },
      reservable: B,
      duracion_minutos: N
    }, ['nombre', 'tipo']),
    resumen: async (a) => {
      const precio = a.precio_tipo === 'consultar' || a.precio === undefined || a.precio === null ? 'precio a consultar' : `${a.precio}${a.precio_tipo === 'desde' ? ' (desde)' : ''}`
      return `Añadir el ${a.tipo === 'servicio' ? 'servicio' : 'producto'} "${texto(a.nombre, 80)}" a ${precio}${a.reservable ? `, reservable con cita de ${Math.round(Number(a.duracion_minutos) || 30)} minutos` : ''}.`
    },
    ejecutar: async (a) => {
      const reservable = !!a.reservable
      return resultado(await crearPrecio({
        nombre: texto(a.nombre, 120),
        tipo: a.tipo === 'producto' ? 'producto' : 'servicio',
        precio: a.precio === undefined || a.precio === null ? null : Number(a.precio),
        precio_tipo: a.precio_tipo === 'desde' ? 'desde' : a.precio_tipo === 'consultar' ? 'consultar' : 'exacto',
        descripcion: texto(a.descripcion, 400) || null,
        disponible: true,
        categoria_id: null,
        etiquetas: [],
        visible_ia: a.la_ve_la_ia !== false,
        ...(reservable ? { reservable: true, duracion_minutos: Math.round(Number(a.duracion_minutos) || 30), tipo_recurso: 'persona' } : {})
      }), `"${texto(a.nombre, 80)}" añadido a la lista de precios.`)
    }
  },
  {
    nombre: 'cambiar_articulo', seccion: 'precios', escribe: true,
    definicion: f('cambiar_articulo', 'Cambia un producto o servicio que ya está en la lista de precios.', {
      articulo: { ...S, description: 'Nombre actual del producto o servicio.' },
      nombre: S, precio: N,
      precio_tipo: { ...S, enum: ['exacto', 'desde', 'consultar'] },
      descripcion: S, disponible: B, la_ve_la_ia: B, reservable: B, duracion_minutos: N
    }, ['articulo']),
    resumen: async (a) => {
      const cambios = [
        a.nombre ? `pasará a llamarse "${texto(a.nombre, 80)}"` : '',
        a.precio !== undefined && a.precio !== null ? `costará ${a.precio}` : '',
        a.precio_tipo === 'consultar' ? 'pasará a precio a consultar' : '',
        a.disponible === true ? 'se marcará como disponible' : a.disponible === false ? 'se marcará como no disponible' : '',
        a.la_ve_la_ia === true ? 'la IA podrá contarlo' : a.la_ve_la_ia === false ? 'la IA dejará de contarlo' : '',
        a.reservable === true ? 'se podrá reservar con cita' : a.reservable === false ? 'dejará de poder reservarse' : '',
        a.duracion_minutos ? `durará ${Math.round(Number(a.duracion_minutos))} minutos` : ''
      ].filter(Boolean)
      return `"${texto(a.articulo, 80)}" ${cambios.length ? cambios.join(', ') : 'no cambia nada'}.`
    },
    ejecutar: async (a) => {
      const r = await getPrecios()
      if (!r.success) return mal(r.error || 'No se ha podido leer la lista de precios.')
      const { fila, error } = buscarPorNombre((r.data as any[]) || [], a.articulo)
      if (!fila) return mal(error!)
      const cambios: any = {}
      if (a.nombre) cambios.nombre = texto(a.nombre, 120)
      if (a.precio !== undefined && a.precio !== null) cambios.precio = Number(a.precio)
      if (a.precio_tipo) cambios.precio_tipo = a.precio_tipo
      if (a.descripcion !== undefined) cambios.descripcion = texto(a.descripcion, 400) || null
      if (a.disponible !== undefined) cambios.disponible = !!a.disponible
      if (a.la_ve_la_ia !== undefined) cambios.visible_ia = !!a.la_ve_la_ia
      if (a.reservable !== undefined) cambios.reservable = !!a.reservable
      if (a.duracion_minutos !== undefined) cambios.duracion_minutos = Math.round(Number(a.duracion_minutos) || 30)
      if (!Object.keys(cambios).length) return mal('No me has dicho qué cambiar.')
      return resultado(await actualizarPrecio(fila.id, cambios), `"${fila.nombre}" actualizado.`)
    }
  },
  {
    nombre: 'borrar_articulo', seccion: 'precios', escribe: true, destructiva: true,
    definicion: f('borrar_articulo', 'Quita un producto o servicio de la lista de precios.', { articulo: S }, ['articulo']),
    resumen: async (a) => `Quitar "${texto(a.articulo, 80)}" de la lista de precios. La IA dejará de poder ofrecerlo.`,
    ejecutar: async (a) => {
      const r = await getPrecios()
      if (!r.success) return mal(r.error || 'No se ha podido leer la lista de precios.')
      const { fila, error } = buscarPorNombre((r.data as any[]) || [], a.articulo)
      if (!fila) return mal(error!)
      return resultado(await eliminarPrecio(fila.id), `"${fila.nombre}" quitado de la lista.`)
    }
  },
  {
    nombre: 'cambiar_horarios', seccion: 'perfil', escribe: true,
    definicion: f('cambiar_horarios', 'Cambia el horario de apertura del negocio o el horario en que contesta la IA. Hay que mandar la semana ENTERA: los días que no se manden quedan cerrados. Mira antes el horario actual con ver_horarios.', {
      tipo: { ...S, enum: ['negocio', 'ia'] },
      dias: {
        type: 'array',
        description: 'Los siete días. dia_semana: 0 domingo, 1 lunes ... 6 sábado.',
        items: {
          type: 'object',
          properties: {
            dia_semana: N, cerrado: B,
            franjas: { type: 'array', items: { type: 'object', properties: { apertura: S, cierre: S }, required: ['apertura', 'cierre'], additionalProperties: false } }
          },
          required: ['dia_semana', 'cerrado'], additionalProperties: false
        }
      }
    }, ['dias']),
    resumen: async (a) => {
      const lineas = (a.dias || []).slice(0, 7).map((d: any) =>
        `${DIAS[Number(d.dia_semana)] || '?'}: ${d.cerrado ? 'cerrado' : (d.franjas || []).map((x: any) => `${x.apertura}-${x.cierre}`).join(' y ') || 'cerrado'}`)
      return `Dejar el horario ${a.tipo === 'ia' ? 'en el que contesta la IA' : 'de apertura'} así:\n${lineas.join('\n')}`
    },
    ejecutar: async (a) => {
      const horarios: HorarioDia[] = (a.dias || []).map((d: any) => ({
        dia_semana: Number(d.dia_semana),
        cerrado: !!d.cerrado,
        franjas: (d.franjas || []).map((x: any, i: number) => ({ apertura: texto(x.apertura, 5), cierre: texto(x.cierre, 5), orden: i }))
      }))
      if (horarios.length !== 7) return mal('Necesito los siete días de la semana, del 0 (domingo) al 6 (sábado).')
      return resultado(await saveHorarios(horarios, a.tipo === 'ia' ? 'ia' : 'negocio'), 'Horario guardado.')
    }
  },
  {
    nombre: 'cambiar_negocio', seccion: 'perfil', escribe: true,
    definicion: f('cambiar_negocio', 'Cambia la ficha del negocio: su nombre, dirección, el tono con el que habla la IA, el idioma, o qué dice fuera de horario. Mira antes lo que hay con ver_negocio.', {
      nombre: S, direccion: S,
      informacion: { ...S, description: 'Qué hace el negocio, para que la IA lo sepa. Máximo 500 caracteres.' },
      idioma: S, tono: S, mensaje_fuera_de_horario: S,
      abre_caso_fuera_de_horario: B
    }),
    resumen: async (a) => {
      const cambios = [
        a.nombre ? `el nombre pasará a "${texto(a.nombre, 80)}"` : '',
        a.direccion ? 'cambiará la dirección' : '',
        a.informacion ? 'cambiará la información que la IA sabe del negocio' : '',
        a.idioma ? `el idioma pasará a ${texto(a.idioma, 30)}` : '',
        a.tono ? `el tono de la IA pasará a ${texto(a.tono, 30)}` : '',
        a.mensaje_fuera_de_horario ? 'cambiará el mensaje de fuera de horario' : '',
        a.abre_caso_fuera_de_horario === true ? 'fuera de horario se abrirá un caso' : a.abre_caso_fuera_de_horario === false ? 'fuera de horario ya no se abrirá caso' : ''
      ].filter(Boolean)
      return cambios.length ? `En la ficha del negocio: ${cambios.join(', ')}.` : 'No cambia nada en la ficha del negocio.'
    },
    ejecutar: async (a) => {
      const r: any = await getDatosPerfilSucursal()
      if (!r.success) return mal(r.error || 'No se ha podido leer la ficha del negocio.')
      const d = r.data || {}
      if (a.informacion && String(a.informacion).length > 500) return mal('La información del negocio no puede pasar de 500 caracteres.')
      return resultado(await savePerfilSucursal({
        nombreSucursal: a.nombre ? texto(a.nombre, 120) : d.nombreSucursal,
        direccion: a.direccion !== undefined ? texto(a.direccion, 200) : d.direccion,
        pais: d.pais,
        timezone: d.timezone,
        moneda: d.moneda,
        servicios: a.informacion !== undefined ? texto(a.informacion, 500) : d.servicios,
        politicas: d.politicas || [],
        idioma_base: a.idioma ? texto(a.idioma, 30) : d.idioma_base,
        tono: a.tono ? texto(a.tono, 40) : d.tono,
        msg_fuera_horario: a.mensaje_fuera_de_horario !== undefined ? texto(a.mensaje_fuera_de_horario, 500) : d.msg_fuera_horario,
        abrir_caso_fuera_horario: a.abre_caso_fuera_de_horario !== undefined ? !!a.abre_caso_fuera_de_horario : d.abrir_caso_fuera_horario,
        modo_horario_ia: d.modo_horario_ia
      }), 'Ficha del negocio guardada.')
    }
  },
  {
    nombre: 'cambiar_automatizacion', seccion: null, escribe: true,
    definicion: f('cambiar_automatizacion', 'Enciende o apaga una automatización. Mira antes cuáles hay con ver_automatizaciones.', {
      automatizacion: { ...S, description: 'Nombre de la automatización.' },
      encender: B
    }, ['automatizacion', 'encender']),
    resumen: async (a) => `${a.encender ? 'Encender' : 'Apagar'} la automatización "${texto(a.automatizacion, 80)}".`,
    ejecutar: async (a) => {
      const r: any = await getAutomatizaciones()
      if (!r.success) return mal(r.error || 'No se han podido leer las automatizaciones.')
      const { fila, error } = buscarPorNombre(r.data?.automatizaciones || [], a.automatizacion)
      if (!fila) return mal(error!)
      return resultado(await cambiarAutomatizacion((fila as any).clave, { activa: !!a.encender }), `"${fila.nombre}" ${a.encender ? 'encendida' : 'apagada'}.`)
    }
  },
  {
    nombre: 'cambiar_ajustes_agenda', seccion: 'agenda', escribe: true,
    definicion: f('cambiar_ajustes_agenda', 'Cambia las reglas de la agenda de reservas. Mira antes lo que hay con ver_agenda.', {
      activa: { ...B, description: 'Encender o apagar la agenda entera.' },
      confirmacion: { ...S, enum: ['automatica', 'manual'] },
      antelacion_minima_minutos: N,
      antelacion_maxima_dias: N,
      cancelacion_horas: N,
      grupo_grande_desde: N,
      max_citas_activas_por_cliente: N,
      enlace_activo: { ...B, description: 'Si la página pública de reservas está abierta.' },
      instrucciones_ia: S
    }),
    resumen: async (a) => {
      const cambios = [
        a.activa === true ? 'se encenderá la agenda' : a.activa === false ? 'se apagará la agenda' : '',
        a.confirmacion === 'manual' ? 'las reservas quedarán pendientes de confirmar a mano' : a.confirmacion === 'automatica' ? 'las reservas quedarán confirmadas al momento' : '',
        a.antelacion_minima_minutos !== undefined ? `habrá que reservar con ${Math.round(Number(a.antelacion_minima_minutos))} minutos de antelación` : '',
        a.antelacion_maxima_dias !== undefined ? `se podrá reservar hasta ${Math.round(Number(a.antelacion_maxima_dias))} días antes` : '',
        a.cancelacion_horas !== undefined ? `se podrá cancelar hasta ${Math.round(Number(a.cancelacion_horas))} horas antes` : '',
        a.grupo_grande_desde !== undefined ? `a partir de ${Math.round(Number(a.grupo_grande_desde))} personas lo llevará una persona del equipo` : '',
        a.max_citas_activas_por_cliente !== undefined ? `cada cliente podrá tener ${Math.round(Number(a.max_citas_activas_por_cliente))} reservas a la vez` : '',
        a.enlace_activo === true ? 'se abrirá la página pública de reservas' : a.enlace_activo === false ? 'se cerrará la página pública de reservas' : '',
        a.instrucciones_ia !== undefined ? 'cambiarán las indicaciones para la IA' : ''
      ].filter(Boolean)
      return cambios.length ? `En la agenda: ${cambios.join(', ')}.` : 'No cambia nada en la agenda.'
    },
    ejecutar: async (a) => {
      const cambios: any = {}
      const entero = (v: any, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v))))
      if (a.activa !== undefined) cambios.activa = !!a.activa
      if (a.confirmacion) cambios.confirmacion = a.confirmacion
      if (a.antelacion_minima_minutos !== undefined) cambios.antelacion_minima_minutos = entero(a.antelacion_minima_minutos, 0, 20160)
      if (a.antelacion_maxima_dias !== undefined) cambios.antelacion_maxima_dias = entero(a.antelacion_maxima_dias, 1, 365)
      if (a.cancelacion_horas !== undefined) cambios.cancelacion_horas = entero(a.cancelacion_horas, 0, 720)
      if (a.grupo_grande_desde !== undefined) cambios.grupo_grande_desde = entero(a.grupo_grande_desde, 2, 100)
      if (a.max_citas_activas_por_cliente !== undefined) cambios.max_citas_activas_por_cliente = entero(a.max_citas_activas_por_cliente, 1, 50)
      if (a.enlace_activo !== undefined) cambios.enlace_activo = !!a.enlace_activo
      if (a.instrucciones_ia !== undefined) cambios.instrucciones_ia = texto(a.instrucciones_ia, 1000) || null
      if (!Object.keys(cambios).length) return mal('No me has dicho qué cambiar.')
      return resultado(await guardarAjustesAgenda(cambios), 'Ajustes de la agenda guardados.')
    }
  },
  {
    nombre: 'crear_recurso_agenda', seccion: 'agenda', escribe: true,
    definicion: f('crear_recurso_agenda', 'Añade a la agenda una persona, mesa, sala o equipo con la que se pueden reservar citas.', {
      nombre: S,
      tipo: { ...S, enum: ['persona', 'mesa', 'sala', 'equipo', 'otro'] }
    }, ['nombre']),
    resumen: async (a) => `Añadir a la agenda ${a.tipo === 'mesa' ? 'la mesa' : a.tipo === 'sala' ? 'la sala' : a.tipo === 'equipo' ? 'el equipo' : 'a'} "${texto(a.nombre, 60)}".`,
    ejecutar: async (a) => resultado(
      await guardarRecurso({ nombre: texto(a.nombre, 60), tipo: ['persona', 'mesa', 'sala', 'equipo', 'otro'].includes(a.tipo) ? a.tipo : 'persona', activo: true }),
      `"${texto(a.nombre, 60)}" añadido a la agenda.`)
  },
  {
    nombre: 'borrar_recurso_agenda', seccion: 'agenda', escribe: true, destructiva: true,
    definicion: f('borrar_recurso_agenda', 'Quita de la agenda una persona, mesa, sala o equipo.', { recurso: S }, ['recurso']),
    resumen: async (a) => `Quitar "${texto(a.recurso, 60)}" de la agenda. Sus citas futuras se quedan sin quien las atienda.`,
    ejecutar: async (a) => {
      const r: any = await getAgenda()
      if (!r.success) return mal(r.error || 'No se ha podido leer la agenda.')
      const { fila, error } = buscarPorNombre(r.data?.recursos || [], a.recurso)
      if (!fila) return mal(error!)
      return resultado(await borrarRecurso(fila.id), `"${fila.nombre}" quitado de la agenda.`)
    }
  },
  {
    nombre: 'invitar_usuario', seccion: 'usuarios', escribe: true,
    definicion: f('invitar_usuario', 'Invita a una persona a esta cuenta de Respondi con un rol. Le llega un correo para crear su contraseña.', {
      email: S, nombre: S,
      rol: { ...S, description: 'Nombre del rol. Si no sabes cuáles hay, mira antes con ver_usuarios.' }
    }, ['email', 'rol']),
    resumen: async (a) => `Invitar a ${texto(a.email, 120)}${a.nombre ? ` (${texto(a.nombre, 60)})` : ''} con el rol "${texto(a.rol, 60)}", en esta sucursal. Recibirá un correo para entrar.`,
    ejecutar: async (a) => {
      const roles: any = await getRolesPersonalizados()
      if (!roles.success) return mal(roles.error || 'No se han podido leer los roles.')
      const { fila, error } = buscarPorNombre(roles.data || [], a.rol)
      if (!fila) return mal(error!)
      // Solo a la sucursal en la que se está trabajando. Dar acceso a todas
      // desde un chat es demasiado: el resto se añade a mano en Usuarios.
      const auth = await getAuthContext(await createClient())
      if (auth.error || !auth.branch_id) return mal('No encuentro la sucursal en la que estás.')
      return resultado(
        await invitarUsuario({ email: texto(a.email, 160).toLowerCase(), nombre: texto(a.nombre, 80) || null, branch_ids: [auth.branch_id], rol_personalizado_id: fila.id }),
        `Invitación enviada a ${texto(a.email, 160)}.`)
    }
  },
  {
    nombre: 'cambiar_usuario', seccion: 'usuarios', escribe: true,
    definicion: f('cambiar_usuario', 'Cambia el rol de una persona o le quita o devuelve el acceso.', {
      usuario: { ...S, description: 'Su nombre o su correo.' },
      rol: S,
      activo: { ...B, description: 'false le quita el acceso sin borrar nada.' }
    }, ['usuario']),
    resumen: async (a) => {
      const cambios = [
        a.rol ? `pasará a tener el rol "${texto(a.rol, 60)}"` : '',
        a.activo === false ? 'perderá el acceso' : a.activo === true ? 'recuperará el acceso' : ''
      ].filter(Boolean)
      return `${texto(a.usuario, 80)} ${cambios.length ? cambios.join(' y ') : 'no cambia nada'}.`
    },
    ejecutar: async (a) => {
      const r: any = await getUsuarios()
      if (!r.success) return mal(r.error || 'No se han podido leer los usuarios.')
      const lista = (r.data || []).map((u: any) => ({ ...u, nombre: u.nombre || u.email }))
      let { fila, error } = buscarPorNombre(lista, a.usuario)
      if (!fila) {
        const porCorreo = lista.filter((u: any) => limpiar(u.email) === limpiar(a.usuario))
        if (porCorreo.length === 1) fila = porCorreo[0]
      }
      if (!fila) return mal(error || `No encuentro a "${texto(a.usuario, 80)}".`)
      const cambios: any = {}
      if (a.rol) {
        const roles: any = await getRolesPersonalizados()
        if (!roles.success) return mal(roles.error || 'No se han podido leer los roles.')
        const rol = buscarPorNombre(roles.data || [], a.rol)
        if (!rol.fila) return mal(rol.error!)
        cambios.rol_personalizado_id = rol.fila.id
      }
      if (a.activo !== undefined) cambios.activo = !!a.activo
      if (!Object.keys(cambios).length) return mal('No me has dicho qué cambiar.')
      return resultado(await actualizarUsuario((fila as any).id, cambios), `${(fila as any).nombre} actualizado.`)
    }
  }
]

export const PorNombre: Record<string, Herramienta> = Object.fromEntries(HERRAMIENTAS.map(h => [h.nombre, h]))

export const DEFINICIONES = HERRAMIENTAS.map(h => h.definicion)
