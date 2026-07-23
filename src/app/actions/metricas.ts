'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'

export async function getMetricas(periodo: 'hoy' | 'semana' | 'mes' | 'total' = 'mes') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado' }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, rol')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) return { success: false, error: 'Sin organización' }

  const branchId = await resolveBranchId(supabase, user.id)
  if (!branchId) return { success: false, error: 'Sin sucursal' }

  const now = new Date()
  let desde: string
  if (periodo === 'hoy') {
    desde = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  } else if (periodo === 'semana') {
    const d = new Date(now); d.setDate(d.getDate() - 7); desde = d.toISOString()
  } else if (periodo === 'mes') {
    desde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  } else {
    desde = '2000-01-01T00:00:00.000Z'
  }

  // ── CONVERSACIONES ──────────────────────────────────────────
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, status, channel_id, created_at, updated_at, channels(tipo)')
    .eq('branch_id', branchId)
    .gte('created_at', desde)

  const totalConvs = convs?.length || 0
  const convsActivas = convs?.filter(c => c.status === 'activa').length || 0
  const convsCerradas = convs?.filter(c => c.status === 'cerrada').length || 0
  const tasaCierre = totalConvs > 0 ? Math.round((convsCerradas / totalConvs) * 100) : 0

  const porCanal: Record<string, number> = {}
  convs?.forEach(c => {
    const tipo = (c.channels as any)?.tipo || 'desconocido'
    porCanal[tipo] = (porCanal[tipo] || 0) + 1
  })

  // Duración media (ms entre created_at y updated_at para cerradas)
  const cerradas = convs?.filter(c => c.status === 'cerrada') || []
  const duracionMedia = cerradas.length > 0
    ? Math.round(cerradas.reduce((acc, c) => {
        const dur = new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()
        return acc + dur
      }, 0) / cerradas.length / 60000) // en minutos
    : 0

  // Hora pico
  const porHora: Record<number, number> = {}
  for (let i = 0; i < 24; i++) porHora[i] = 0
  convs?.forEach(c => {
    const h = new Date(c.created_at).getHours()
    porHora[h] = (porHora[h] || 0) + 1
  })
  const horaPico = Object.entries(porHora).sort((a, b) => b[1] - a[1])[0]?.[0] || '0'

  // ── MENSAJES ─────────────────────────────────────────────────
  const { data: msgs } = await supabase
    .from('messages')
    .select('id, role, created_at, conversation_id')
    .eq('branch_id', branchId)
    .gte('created_at', desde)

  const totalMsgs = msgs?.length || 0
  const msgsIA = msgs?.filter(m => m.role === 'assistant').length || 0
  const msgsCliente = msgs?.filter(m => m.role === 'user').length || 0
  const ratioIA = totalMsgs > 0 ? Math.round((msgsIA / totalMsgs) * 100) : 0
  const promedioMsgsPorConv = totalConvs > 0 ? Math.round(totalMsgs / totalConvs) : 0

  // ── CASOS ────────────────────────────────────────────────────
  const { data: casosData } = await supabase
    .from('cases')
    .select('id, status, created_at, updated_at, assigned_to, source, conversation_id, conversation_tags(nombre)')
    .eq('branch_id', branchId)
    .gte('created_at', desde)

  const totalCasos = casosData?.length || 0
  const casosAbiertos = casosData?.filter(c => c.status === 'abierto').length || 0
  const casosCerrados = casosData?.filter(c => c.status === 'cerrado').length || 0
  const tasaResolucion = totalCasos > 0 ? Math.round((casosCerrados / totalCasos) * 100) : 0

  // Tiempo medio resolución casos cerrados (minutos)
  const casosCerradosData = casosData?.filter(c => c.status === 'cerrado') || []
  const tiempoMedioResolucion = casosCerradosData.length > 0
    ? Math.round(casosCerradosData.reduce((acc, c) => {
        return acc + (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime())
      }, 0) / casosCerradosData.length / 60000)
    : 0

  // Casos escalados por IA vs manual
  const casosEscaladosIA = casosData?.filter(c => c.source === 'ia').length || 0
  const casosEscaladosManuales = totalCasos - casosEscaladosIA

  // Tasa de escalado (% convs que generaron un caso)
  const tasaEscalado = totalConvs > 0 ? Math.round((totalCasos / totalConvs) * 100) : 0

  // ── CONTACTOS ────────────────────────────────────────────────
  const { data: contactosData } = await supabase
    .from('contacts')
    .select('id, created_at, channel_id, channels(tipo)')
    .eq('branch_id', branchId)

  const totalContactos = contactosData?.length || 0
  const nuevosContactos = contactosData?.filter(c => c.created_at >= desde).length || 0

  // Contactos por canal
  const contactosPorCanal: Record<string, number> = {}
  contactosData?.forEach(c => {
    const tipo = (c.channels as any)?.tipo || 'desconocido'
    contactosPorCanal[tipo] = (contactosPorCanal[tipo] || 0) + 1
  })

  // Contactos recurrentes (más de 1 conversación)
  const convsAllTime = await supabase
    .from('conversations')
    .select('contact_id')
    .eq('branch_id', branchId)

  const convsPerContact: Record<string, number> = {}
  convsAllTime.data?.forEach(c => {
    if (c.contact_id) convsPerContact[c.contact_id] = (convsPerContact[c.contact_id] || 0) + 1
  })
  const contactosRecurrentes = Object.values(convsPerContact).filter(v => v > 1).length

  // ── CRÉDITOS ─────────────────────────────────────────────────
  const { data: quotaData } = await supabase
    .from('message_quotas')
    .select('cantidad, tipo, created_at')
    .eq('branch_id', branchId)

  const creditosDisponibles = quotaData
    ?.filter(q => q.tipo === 'credito')
    .reduce((acc, q) => acc + q.cantidad, 0) || 0

  const creditosConsumidos = quotaData
    ?.filter(q => q.tipo === 'consumo')
    .reduce((acc, q) => acc + q.cantidad, 0) || 0

  // Consumo diario promedio (últimos 30 días)
  const hace30dias = new Date(now); hace30dias.setDate(hace30dias.getDate() - 30)
  const consumoReciente = quotaData
    ?.filter(q => q.tipo === 'consumo' && q.created_at >= hace30dias.toISOString())
    .reduce((acc, q) => acc + q.cantidad, 0) || 0
  const consumoDiarioPromedio = Math.round(consumoReciente / 30)

  // Proyección días restantes
  const diasRestantes = consumoDiarioPromedio > 0
    ? Math.round(creditosDisponibles / consumoDiarioPromedio)
    : null

  // ── USUARIOS ─────────────────────────────────────────────────
  const { data: usuariosData } = await supabase
    .from('users')
    .select('id, nombre, email, activo')
    .eq('tenant_id', userData.tenant_id)
    .eq('activo', true)

  const totalUsuarios = usuariosData?.length || 0

  // Actividad por usuario (casos gestionados)
  const actividadPorUsuario: { nombre: string, email: string, casos: number }[] = []
  if (usuariosData) {
    for (const u of usuariosData) {
      const { count } = await supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', branchId)
        .eq('assigned_to', u.id)
        .gte('created_at', desde)
      actividadPorUsuario.push({
        nombre: u.nombre || u.email,
        email: u.email,
        casos: count || 0
      })
    }
  }
  actividadPorUsuario.sort((a, b) => b.casos - a.casos)

  // ── RENDIMIENTO IA ───────────────────────────────────────────
  // Convs resueltas sin intervención humana = cerradas sin casos asociados
  const convsConCaso = new Set(casosData?.map(c => c.conversation_id) || [])
  const convsSinEscalado = convsCerradas - [...convsConCaso].filter(id =>
    convs?.some(c => c.id === id && c.status === 'cerrada')
  ).length
  const tasaResolucionIA = convsCerradas > 0
    ? Math.round((convsSinEscalado / convsCerradas) * 100)
    : 0

  // ── NOVEDADES ────────────────────────────────────────────────
  const { count: totalNovedades } = await supabase
    .from('daily_updates')
    .select('*', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .gte('created_at', desde)

  // ── GRÁFICOS ─────────────────────────────────────────────────
  // Conversaciones por día (últimos 30 días)
  const hace30 = new Date(now); hace30.setDate(hace30.getDate() - 29)
  const { data: convsGrafico } = await supabase
    .from('conversations')
    .select('created_at')
    .eq('branch_id', branchId)
    .gte('created_at', hace30.toISOString())

  const porDia: Record<string, number> = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date(hace30); d.setDate(d.getDate() + i)
    porDia[d.toISOString().split('T')[0]] = 0
  }
  convsGrafico?.forEach(c => {
    const key = c.created_at.split('T')[0]
    if (porDia[key] !== undefined) porDia[key]++
  })
  const graficoConvs = Object.entries(porDia).map(([fecha, total]) => ({ fecha, total }))

  // Mensajes por día (últimos 30 días)
  const { data: msgsGrafico } = await supabase
    .from('messages')
    .select('created_at, role')
    .eq('branch_id', branchId)
    .gte('created_at', hace30.toISOString())

  const msgsPorDia: Record<string, { ia: number, cliente: number }> = {}
  for (let i = 0; i < 30; i++) {
    const d = new Date(hace30); d.setDate(d.getDate() + i)
    msgsPorDia[d.toISOString().split('T')[0]] = { ia: 0, cliente: 0 }
  }
  msgsGrafico?.forEach(m => {
    const key = m.created_at.split('T')[0]
    if (msgsPorDia[key]) {
      if (m.role === 'assistant') msgsPorDia[key].ia++
      else msgsPorDia[key].cliente++
    }
  })
  const graficoMsgs = Object.entries(msgsPorDia).map(([fecha, v]) => ({ fecha, ...v }))

  // Distribución horaria
  const graficoHoras = Object.entries(porHora).map(([hora, total]) => ({
    hora: `${hora}h`, total
  }))

  return {
    success: true,
    data: {
      periodo,
      conversaciones: {
        total: totalConvs,
        activas: convsActivas,
        cerradas: convsCerradas,
        tasaCierre,
        porCanal,
        duracionMediaMinutos: duracionMedia,
        horaPico: parseInt(horaPico)
      },
      mensajes: {
        total: totalMsgs,
        ia: msgsIA,
        cliente: msgsCliente,
        ratioIA,
        promedioporConv: promedioMsgsPorConv
      },
      casos: {
        total: totalCasos,
        abiertos: casosAbiertos,
        cerrados: casosCerrados,
        tasaResolucion,
        tiempoMedioResolucionMinutos: tiempoMedioResolucion,
        escaladosIA: casosEscaladosIA,
        escaladosManuales: casosEscaladosManuales,
        tasaEscalado
      },
      contactos: {
        total: totalContactos,
        nuevos: nuevosContactos,
        recurrentes: contactosRecurrentes,
        porCanal: contactosPorCanal
      },
      creditos: {
        disponibles: creditosDisponibles,
        consumidos: creditosConsumidos,
        consumoDiarioPromedio,
        diasRestantes
      },
      usuarios: {
        total: totalUsuarios,
        actividad: actividadPorUsuario
      },
      rendimientoIA: {
        tasaResolucionSinEscalado: tasaResolucionIA,
        tasaEscalado
      },
      novedades: {
        total: totalNovedades || 0
      },
      graficos: {
        convsPorDia: graficoConvs,
        msgsPorDia: graficoMsgs,
        convsPorHora: graficoHoras
      }
    }
  }
}
