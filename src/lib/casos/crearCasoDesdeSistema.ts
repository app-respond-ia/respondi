import { supabaseAdmin } from '@/utils/supabase/admin'
import { notificarAAdminsDeOrganizacion } from '@/lib/notificaciones'
import { registrarError } from '@/lib/errores'
import { casoTerminado } from '@/lib/casos/estados'

// Abre (o reutiliza) el caso de una conversación cuando el sistema decide que
// hace falta una persona: escalado de la IA, fuera de horario con caso,
// créditos agotados, trato del contacto o tres fallos seguidos de la IA.
//
// Regla del modelo: una conversación tiene como mucho UN caso (lo impone el
// índice único `unique_active_case`). Por eso, si ya existe, no se crea otro:
//   · si está abierto, el motivo nuevo se añade como nota — antes se devolvía
//     el caso sin más y ese segundo motivo desaparecía;
//   · si estaba resuelto (porque alguien reabrió la conversación), se reabre y
//     se anota — antes el escalado quedaba escondido dentro de un caso
//     resuelto que nadie iba a mirar.
export async function crearCasoDesdeSistema(
  conversationId: string,
  tenantId: string,
  branchId: string,
  contactId: string,
  motivo: string,
  tipoCaso: string = 'normal',
  prioridad: string = 'normal'
) {
  const { data: existente } = await supabaseAdmin
    .from('cases')
    .select('id, estatus, descripcion, agente_id')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId)
    .order('fecha_apertura', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existente) {
    const estabaTerminado = casoTerminado(existente.estatus)

    if (estabaTerminado) {
      const { error: errReabrir } = await supabaseAdmin
        .from('cases')
        .update({
          // Si ya tenía agente, vuelve a él; si no, a la cola.
          estatus: existente.agente_id ? 'atendiendo' : 'pendiente',
          fecha_cierre: null
        })
        .eq('id', existente.id)

      if (errReabrir) {
        await registrarError({
          origen: 'app',
          descripcion: 'Fallo al reabrir un caso resuelto para un escalado nuevo (el cliente se queda sin atención humana)',
          stacktrace: JSON.stringify({ conversationId, casoId: existente.id, error: errReabrir }),
          tenant_id: tenantId
        })
        return null
      }
    }

    // Se anota el motivo salvo que sea exactamente el mismo con el que nació el
    // caso (evita duplicar la misma frase cuando se repite el mismo aviso).
    if (motivo && motivo !== existente.descripcion) {
      await supabaseAdmin.from('case_notes').insert({
        tenant_id: tenantId,
        case_id: existente.id,
        user_id: null,
        nota: estabaTerminado ? `Caso reabierto: ${motivo}` : `Nuevo motivo: ${motivo}`
      })
    }

    if (estabaTerminado) {
      await notificarAAdminsDeOrganizacion(supabaseAdmin, tenantId, {
        tipo: 'conversacion_escalada',
        titulo: 'Caso reabierto',
        cuerpo: 'Un caso que estaba resuelto vuelve a necesitar atención.',
        url: `/dashboard/casos/${existente.id}`,
        entidadId: existente.id
      })
    }

    return existente.id
  }

  const { data: nuevoCaso, error } = await supabaseAdmin
    .from('cases')
    .insert([{
      tenant_id: tenantId,
      branch_id: branchId,
      contact_id: contactId,
      conversation_id: conversationId,
      tipo: tipoCaso,
      prioridad: prioridad,
      descripcion: motivo,
      estatus: 'pendiente',
      agente_id: null,
      fecha_apertura: new Date().toISOString()
    }])
    .select('id')
    .single()

  if (error) {
    // Queda registrado para que quien llama pueda enterarse de que falló y no
    // prometerle al cliente una atención humana que no va a existir.
    await registrarError({
      origen: 'app',
      descripcion: 'Fallo al crear el caso derivado automáticamente (el cliente se queda sin atención humana)',
      stacktrace: JSON.stringify({ conversationId, tipoCaso, prioridad, error }),
      tenant_id: tenantId
    })
    return null
  }

  if (nuevoCaso) {
    await notificarAAdminsDeOrganizacion(supabaseAdmin, tenantId, {
      tipo: 'conversacion_escalada',
      titulo: 'Conversación derivada a soporte',
      cuerpo: 'Se ha creado un nuevo caso automáticamente que requiere atención humana.',
      url: `/dashboard/casos/${nuevoCaso.id}`,
      entidadId: nuevoCaso.id
    })
    return nuevoCaso.id
  }
  return null
}
