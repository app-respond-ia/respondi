'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveBranchId } from '@/lib/active-branch'
import { registrarAuditoria } from '@/lib/auditoria'

import { getAuthContext } from '@/lib/auth-context'
import crypto from 'crypto'
import { supabaseAdmin } from '@/utils/supabase/admin'
import { sinPermiso } from '@/lib/permisos-servidor'
import { comprobarNumero, numeroEsDeLaCuenta, guardarCredencialesMeta, caducidadDelToken, ErrorMeta } from '@/lib/canales/meta'
import { sincronizarPlantillas } from '@/lib/canales/plantillas'
import { comprobarCorreo, guardarContrasenaCorreo, leerContrasenaCorreo, ErrorCorreo, type ConfigCorreo } from '@/lib/canales/correo'
import { proveedorCorreo, esServidorMicrosoft, esDireccionMicrosoft, AVISO_MICROSOFT } from '@/lib/canales/proveedores-correo'
import { promises as dns } from 'dns'
import { after } from 'next/server'

// Dirección a la que Meta avisa de los mensajes de un canal
function urlDelAviso(channelId: string) {
  return `${process.env.NEXT_PUBLIC_SITE_URL || 'https://respondi.vercel.app'}/api/whatsapp/meta/${channelId}`
}

// Los canales que permite el plan son para toda la organización, repartidos
// entre sus sucursales como quiera (igual que el límite de sucursales y el de
// usuarios): el plan Pro trae 3 canales y 2 sucursales, y como cada sucursal
// puede tener como mucho uno de cada tipo, "3 por sucursal" no limitaría nada.
// Cuenta todo canal que no esté desconectado (activo, pendiente de que Meta lo
// verifique, o con error), de todas las sucursales. Se cuenta con el cliente
// del sistema porque cada usuario solo ve los canales de sus sucursales y
// contaría de menos. `excepto`: el canal que se está cambiando (reconectar el
// mismo no ocupa un hueco más).
const ESTADOS_EN_USO = ['activo', 'pendiente', 'error']

async function usoDeCanales(tenantId: string, excepto?: { branchId: string; tipo: string }) {
  const [{ data: filas }, { data: org }] = await Promise.all([
    supabaseAdmin.from('channels').select('branch_id, tipo').eq('tenant_id', tenantId).in('estado', ESTADOS_EN_USO),
    supabaseAdmin.from('organizaciones').select('plans!plan_id(canales_max)').eq('id', tenantId).single()
  ])
  const plan: any = Array.isArray(org?.plans) ? org?.plans[0] : org?.plans
  const enUso = (filas || []).filter((f: any) => !(excepto && f.branch_id === excepto.branchId && f.tipo === excepto.tipo)).length
  return { enUso, max: (plan?.canales_max ?? null) as number | null }
}

async function fueraDelPlan(tenantId: string, branchId: string, tipo: string) {
  const { enUso, max } = await usoDeCanales(tenantId, { branchId, tipo })
  if (max === null || enUso < max) return null
  return `Tu plan incluye ${max} ${max === 1 ? 'canal' : 'canales'} entre todas tus sucursales y ya ${max === 1 ? 'está en uso' : 'están en uso'}. Desconecta uno o cambia de plan para conectar otro.`
}

export async function getCanales() {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const { data: filas, error } = await supabase
    .from('channels')
    .select('id, tipo, metodo, estado, identificador_externo, calidad_mensajeria, calidad_actualizada_en, fecha_conexion, ultima_actividad, verify_token, meta_phone_number_id, meta_waba_id, token_caduca_en, numero_visible, nombre_verificado, ultimo_error, configuracion')
    .eq('branch_id', auth.branch_id)
    .order('created_at', { ascending: true })

  if (error) return { success: false, error: error.message }

  // Los datos que el cliente tiene que pegar en su app de Meta para que avise
  // a Respondi de los mensajes (las claves nunca salen de la caja fuerte)
  const canales = (filas || []).map((c: any) => {
    // Del correo, solo los ajustes que se pueden cambiar (servidores, nombre,
    // firma): hasta dónde se ha leído el buzón no le importa a la pantalla
    const { lectura, ...configuracion } = c.configuracion || {}
    return {
      ...c,
      configuracion: c.configuracion ? configuracion : null,
      webhook_url: c.metodo === 'meta_oficial' ? urlDelAviso(c.id) : null
    }
  })

  const { data: organizacion } = await supabase
    .from('organizaciones')
    .select('plan_id, plans!plan_id(canales_max)')
    .eq('id', auth.tenant_id)
    .single()
  const plan = Array.isArray(organizacion?.plans) ? organizacion.plans[0] : organizacion?.plans
  const canales_max = plan?.canales_max ?? null
  // Los que ocupan hueco en el plan: los de toda la organización, no solo los
  // de esta sucursal (antes contaba solo los activos de la sucursal abierta)
  const { enUso: canales_en_uso } = await usoDeCanales(auth.tenant_id!)

  return { success: true, data: { canales, canales_max, canales_en_uso } }
}

import { getMisPermisos } from '@/app/actions/permisos'

export async function conectarCanal(dataOrTipo: any, argMetodo?: any) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // 1. Verificamos permisos (solo escritura puede conectar canales)
  const misPermisos = await getMisPermisos()
  if (!misPermisos.success) return { success: false, error: 'Error verificando permisos.' }
  
  const tienePermiso = (misPermisos as any).esAdmin || 
                       (misPermisos.data || []).some((p: any) => p.seccion === 'canales' && p.nivel === 'escritura')

  if (!tienePermiso) {
    return { success: false, error: 'No tienes permiso de escritura en canales.' }
  }

  const data = typeof dataOrTipo === 'string'
    ? { tipo: dataOrTipo, metodo: argMetodo }
    : dataOrTipo

  const sinHueco = await fueraDelPlan(auth.tenant_id!, auth.branch_id!, data.tipo)
  if (sinHueco) return { success: false, error: sinHueco }

  const { data: newCanal, error: canalError } = await supabase
    .from('channels')
    .upsert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      tipo: data.tipo,
      metodo: data.metodo || argMetodo || 'whaticket',
      estado: data.estado || 'pendiente'
    }, {
      onConflict: 'tenant_id, branch_id, tipo'
    })
    .select()
    .single()

  if (canalError || !newCanal) {
    return { success: false, error: canalError?.message || 'Error al conectar el canal. Inténtalo de nuevo.' }
  }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `solicitó conectar el canal "${newCanal.tipo}" (método: ${newCanal.metodo})`,
    tabla_afectada: 'canales',
    registro_id: newCanal.id,
    valor_nuevo: newCanal
  })

  return { success: true, canal: newCanal, data: newCanal }
}

export async function desconectarCanal(id: string) {
  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  // 1. Verificamos permisos (solo escritura puede desconectar canales)
  const misPermisos = await getMisPermisos()
  if (!misPermisos.success) return { success: false, error: 'Error verificando permisos.' }
  
  const tienePermiso = (misPermisos as any).esAdmin || 
                       (misPermisos.data || []).some((p: any) => p.seccion === 'canales' && p.nivel === 'escritura')

  if (!tienePermiso) {
    return { success: false, error: 'No tienes permiso de escritura en canales.' }
  }

  // Prevención IDOR: Confirmamos que el canal pertenece a este tenant y branch
  const { data: anterior, error: authError } = await supabase
    .from('channels')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .single()

  if (authError || !anterior) {
    return { success: false, error: 'Canal no encontrado o no autorizado.' }
  }

  const { data, error } = await supabase
    .from('channels')
    // Al desconectar, el número queda libre (se puede conectar en otro sitio)
    .update({ estado: 'desconectado', meta_phone_number_id: null })
    .eq('id', id)
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .select()
    .single()

  if (error) return { success: false, error: error.message }

  // Las claves del cliente no se quedan guardadas en un canal que ya no usa
  await supabaseAdmin.rpc('borrar_credenciales_canal', { p_channel_id: id })

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `desconectó el canal "${data.tipo}"`,
    tabla_afectada: 'canales',
    registro_id: id,
    valor_anterior: { estado: anterior.estado, metodo: anterior.metodo, numero: anterior.numero_visible || anterior.identificador_externo },
    valor_nuevo: { estado: 'desconectado' }
  })

  return { success: true, data: { id: data.id, tipo: data.tipo, estado: data.estado } }
}

// Conectar el WhatsApp del cliente con su propia app de Meta (Cloud API). El
// cliente pega tres datos de su app; se comprueban con Meta ANTES de
// guardarlos, las claves van a la caja fuerte (Vault) y se le devuelve lo que
// tiene que pegar en Meta para que avise a Respondi de los mensajes. El canal
// se queda "pendiente" hasta que Meta verifica esa dirección; entonces pasa a
// "activo" solo.
export async function conectarWhatsAppMeta(datos: { phoneNumberId: string; accessToken: string; appSecret: string; wabaId: string }) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const phoneNumberId = (datos.phoneNumberId || '').trim()
  const accessToken = (datos.accessToken || '').trim()
  const appSecret = (datos.appSecret || '').trim()
  const wabaId = (datos.wabaId || '').trim()

  if (!/^\d{6,25}$/.test(phoneNumberId)) {
    return { success: false, error: 'El "Identificador del número de teléfono" son solo cifras (lo encuentras en tu app de Meta → WhatsApp → Configuración de la API).' }
  }
  if (accessToken.length < 30) return { success: false, error: 'El token de acceso no parece completo. Cópialo entero desde tu app de Meta.' }
  if (!/^[0-9a-f]{32}$/i.test(appSecret)) {
    return { success: false, error: 'La clave secreta de la app tiene 32 caracteres (en tu app de Meta → Configuración de la app → Básica → Clave secreta de la app).' }
  }
  if (!/^\d{6,25}$/.test(wabaId)) {
    return { success: false, error: 'El "Identificador de la cuenta de WhatsApp Business" son solo cifras (está en la misma página que el identificador del número: WhatsApp → Configuración de la API).' }
  }

  // Cambiar las claves del WhatsApp que ya tiene esta sucursal no ocupa otro
  // canal; conectar uno nuevo, sí
  const sinHueco = await fueraDelPlan(auth.tenant_id!, auth.branch_id!, 'whatsapp')
  if (sinHueco) return { success: false, error: sinHueco }

  // 1. ¿Son buenos? Se pregunta a Meta por el número con ese token
  let numero
  try {
    numero = await comprobarNumero(phoneNumberId, accessToken)
  } catch (e: any) {
    const detalle = e instanceof ErrorMeta && e.clavesInvalidas ? 'el token no es válido o ha caducado' : e?.message
    return { success: false, error: `Meta no ha aceptado estos datos: ${detalle}.` }
  }

  // La cuenta de WhatsApp Business (hace falta para las plantillas): que el
  // token llega a ella y que el número es suyo
  try {
    if (!(await numeroEsDeLaCuenta(wabaId, accessToken, phoneNumberId))) {
      return { success: false, error: 'Ese número no pertenece a esa cuenta de WhatsApp Business. Revisa los dos identificadores en tu app de Meta.' }
    }
  } catch (e: any) {
    return { success: false, error: `Meta no ha aceptado el identificador de la cuenta de WhatsApp Business: ${e?.message}.` }
  }

  // Si el token caduca (el de prueba dura 24 h), Canales lo avisará con la
  // fecha. Si Meta no lo dice, no se avisa de nada.
  const caduca = await caducidadDelToken(accessToken)

  // 2. Un número solo puede estar conectado a un canal (en toda Respondi)
  const { data: yaUsado } = await supabaseAdmin
    .from('channels')
    .select('id, tenant_id, branch_id')
    .eq('meta_phone_number_id', phoneNumberId)
    .maybeSingle()
  if (yaUsado && (yaUsado.tenant_id !== auth.tenant_id || yaUsado.branch_id !== auth.branch_id)) {
    return { success: false, error: 'Este número de WhatsApp ya está conectado en otra sucursal u organización.' }
  }

  // 3. El canal de WhatsApp de esta sucursal (se crea o se actualiza)
  const { data: existente } = await supabase
    .from('channels')
    .select('id, estado, verify_token, meta_phone_number_id')
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .eq('tipo', 'whatsapp')
    .maybeSingle()

  // Si solo cambian las claves de un número que ya funcionaba, sigue activo
  const sigueActivo = existente?.estado === 'activo' && existente?.meta_phone_number_id === phoneNumberId
  const cambios: any = {
    tenant_id: auth.tenant_id,
    branch_id: auth.branch_id,
    tipo: 'whatsapp',
    metodo: 'meta_oficial',
    estado: sigueActivo ? 'activo' : 'pendiente',
    identificador_externo: phoneNumberId,
    meta_phone_number_id: phoneNumberId,
    meta_waba_id: wabaId,
    token_caduca_en: caduca ? caduca.toISOString() : null,
    numero_visible: numero.numeroVisible || null,
    nombre_verificado: numero.nombreVerificado || null,
    calidad_mensajeria: numero.calidad || null,
    calidad_actualizada_en: new Date().toISOString(),
    verify_token: existente?.verify_token || crypto.randomBytes(24).toString('hex'),
    ultimo_error: null
  }

  const { data: canal, error } = await supabase
    .from('channels')
    .upsert(cambios, { onConflict: 'tenant_id, branch_id, tipo' })
    .select('id, verify_token, estado, numero_visible')
    .single()

  if (error || !canal) return { success: false, error: error?.message || 'No se ha podido guardar el canal.' }

  // 4. Las claves, a la caja fuerte
  try {
    await guardarCredencialesMeta(canal.id, { access_token: accessToken, app_secret: appSecret })
  } catch (e: any) {
    return { success: false, error: `No se han podido guardar las claves: ${e?.message}` }
  }

  // Las plantillas que la cuenta ya tenga en Meta aparecen en Respondi
  after(() => sincronizarPlantillas({ id: canal.id, tenant_id: auth.tenant_id!, branch_id: auth.branch_id!, meta_waba_id: wabaId }).catch(() => {}))

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: `conectó WhatsApp con Meta (${numero.numeroVisible || phoneNumberId})`,
    tabla_afectada: 'canales',
    registro_id: canal.id,
    // Nunca las claves: solo qué número
    valor_nuevo: { numero: numero.numeroVisible, nombre_verificado: numero.nombreVerificado }
  })

  return {
    success: true,
    data: {
      id: canal.id,
      estado: canal.estado,
      numero_visible: canal.numero_visible,
      webhook_url: urlDelAviso(canal.id),
      verify_token: canal.verify_token
    }
  }
}

// ---------- Correo ----------

// Adivina el proveedor por la dirección (a qué servidores le llega el correo
// a ese dominio), para que el cliente no tenga que saberlo
export async function detectarProveedorCorreo(direccion: string): Promise<{ proveedor: string | null; microsoft?: boolean; imap?: any; smtp?: any }> {
  const dominio = (direccion || '').trim().toLowerCase().split('@')[1]
  if (!dominio || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio)) return { proveedor: null }
  if (esDireccionMicrosoft(direccion)) return { proveedor: null, microsoft: true }
  if (['gmail.com', 'googlemail.com'].includes(dominio)) return { proveedor: 'gmail' }
  if (/^(yahoo|ymail)\./.test(dominio)) return { proveedor: 'yahoo' }
  if (['icloud.com', 'me.com', 'mac.com'].includes(dominio)) return { proveedor: 'icloud' }
  let mx: string[] = []
  try {
    mx = (await Promise.race([
      dns.resolveMx(dominio),
      new Promise<never>((_, no) => setTimeout(() => no(new Error('tiempo')), 4000))
    ])).map(r => r.exchange.toLowerCase())
  } catch {
    return { proveedor: null }
  }
  const hay = (re: RegExp) => mx.some(m => re.test(m))
  if (hay(/(google|googlemail)\.com$/)) return { proveedor: 'gmail' }
  if (hay(/outlook\.com$/)) return { proveedor: null, microsoft: true }
  if (hay(/(ionos\.[a-z]+|kundenserver\.de|1and1\.[a-z]+)$/)) return { proveedor: 'ionos' }
  if (hay(/hostinger\.[a-z]+$/)) return { proveedor: 'hostinger' }
  if (hay(/ovh\.net$/)) return { proveedor: 'ovh' }
  if (hay(/zoho\.[a-z]+$/)) {
    // Zoho tiene servidores por región (el de Europa es el que viene puesto)
    const region = mx.find(m => /zoho\.[a-z]+$/.test(m))!.split('.').pop()
    return region === 'eu' ? { proveedor: 'zoho' } : {
      proveedor: 'zoho',
      imap: { host: `imappro.zoho.${region}`, puerto: 993, seguro: true },
      smtp: { host: `smtppro.zoho.${region}`, puerto: 465, seguro: true }
    }
  }
  if (hay(/yahoodns\.net$/)) return { proveedor: 'yahoo' }
  if (hay(/icloud\.com$/)) return { proveedor: 'icloud' }
  return { proveedor: null }
}

const DIRECCION_VALIDA = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const SERVIDOR_VALIDO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

function servidorDe(s: any): { host: string; puerto: number; seguro: boolean } | null {
  const host = String(s?.host || '').trim().toLowerCase()
  const puerto = Number(s?.puerto)
  if (!SERVIDOR_VALIDO.test(host) || !Number.isInteger(puerto) || puerto < 1 || puerto > 65535) return null
  return { host, puerto, seguro: !!s?.seguro }
}

// Conectar el buzón de correo del negocio (opción A: su propio buzón). Se
// entra en él con esos datos ANTES de guardarlos; la contraseña va a la caja
// fuerte. Desde ese momento, la IA contesta los correos que lleguen (no los
// antiguos). Sirve también para cambiar los datos de uno ya conectado: si la
// contraseña se deja vacía, se mantiene la que había.
export async function conectarCorreo(datos: {
  direccion: string
  contrasena?: string
  proveedor?: string
  usuario?: string
  imap?: { host: string; puerto: number; seguro: boolean }
  smtp?: { host: string; puerto: number; seguro: boolean }
  nombreRemitente?: string
  firma?: string
}) {
  const denegado = await sinPermiso('canales')
  if (denegado) return { success: false, error: denegado }

  const supabase = await createClient()
  const auth = await getAuthContext(supabase)
  if (auth.error) return { success: false, error: auth.error }

  const direccion = (datos.direccion || '').trim().toLowerCase()
  if (!DIRECCION_VALIDA.test(direccion)) return { success: false, error: 'Escribe la dirección de correo completa (por ejemplo, hola@tunegocio.com).' }

  // Los servidores: los del proveedor elegido, o los que haya escrito
  const base = datos.proveedor && datos.proveedor !== 'otro' ? proveedorCorreo(datos.proveedor) : null
  const imap = servidorDe(datos.imap || base?.imap)
  const smtp = servidorDe(datos.smtp || base?.smtp)
  if (!imap) return { success: false, error: 'Falta el servidor de entrada (IMAP) o su puerto no es válido.' }
  if (!smtp) return { success: false, error: 'Falta el servidor de salida (SMTP) o su puerto no es válido.' }
  if (esDireccionMicrosoft(direccion) || esServidorMicrosoft(imap.host) || esServidorMicrosoft(smtp.host)) {
    return { success: false, error: AVISO_MICROSOFT }
  }
  const usuario = (datos.usuario || '').trim() || direccion
  const nombreRemitente = (datos.nombreRemitente || '').trim().slice(0, 80) || null
  const firma = (datos.firma || '').trim().slice(0, 1000) || null

  const sinHueco = await fueraDelPlan(auth.tenant_id!, auth.branch_id!, 'email')
  if (sinHueco) return { success: false, error: sinHueco }

  // Un buzón solo puede estar conectado a un canal (en toda Respondi): si no,
  // dos sucursales contestarían el mismo correo
  const { data: usados } = await supabaseAdmin
    .from('channels')
    .select('tenant_id, branch_id')
    .eq('tipo', 'email')
    .eq('identificador_externo', direccion)
    .neq('estado', 'desconectado')
  if ((usados || []).some((u: any) => u.tenant_id !== auth.tenant_id || u.branch_id !== auth.branch_id)) {
    return { success: false, error: 'Este correo ya está conectado en otra sucursal u organización.' }
  }

  const { data: existente } = await supabase
    .from('channels')
    .select('id, estado, configuracion, fecha_conexion')
    .eq('tenant_id', auth.tenant_id)
    .eq('branch_id', auth.branch_id)
    .eq('tipo', 'email')
    .maybeSingle()

  // Sin contraseña nueva, la guardada (solo si es el mismo buzón)
  const anterior = (existente?.configuracion || null) as ConfigCorreo | null
  const mismoBuzon = !!anterior && existente?.estado !== 'desconectado' && anterior.direccion === direccion && anterior.imap?.host === imap.host
  let contrasena = datos.contrasena || ''
  if (!contrasena && mismoBuzon && existente) contrasena = (await leerContrasenaCorreo(existente.id)) || ''
  if (!contrasena) return { success: false, error: 'Escribe la contraseña del buzón.' }

  const config: ConfigCorreo = { imap, smtp, usuario, direccion, nombre_remitente: nombreRemitente, firma, lectura: null }

  // 1. ¿Funcionan? Se entra en el buzón y en el servidor de salida
  let lectura
  try {
    lectura = await comprobarCorreo(config, contrasena)
  } catch (e: any) {
    return { success: false, error: e instanceof ErrorCorreo ? e.message : 'No se ha podido comprobar el buzón. Revisa los datos.' }
  }
  // Si es el mismo buzón que ya se leía, se sigue por donde iba (así no se
  // pierde ningún correo que haya llegado mientras se cambiaban los datos)
  if (mismoBuzon && anterior?.lectura && anterior.lectura.uidvalidity === lectura.uidvalidity) lectura = anterior.lectura

  // 2. El canal de correo de esta sucursal (se crea o se actualiza). Si no
  //    estaba funcionando, se queda "pendiente" hasta tener la contraseña
  //    guardada: si no, la revisión de cada minuto podría encontrarlo activo y
  //    sin contraseña y marcarlo con error nada más conectarlo
  const yaFuncionaba = existente?.estado === 'activo' && mismoBuzon
  const { data: canal, error } = await supabase
    .from('channels')
    .upsert({
      tenant_id: auth.tenant_id,
      branch_id: auth.branch_id,
      tipo: 'email',
      metodo: 'imap_smtp',
      estado: yaFuncionaba ? 'activo' : 'pendiente',
      identificador_externo: direccion,
      configuracion: { ...config, lectura },
      fecha_conexion: existente?.estado === 'activo' && existente.fecha_conexion ? existente.fecha_conexion : new Date().toISOString(),
      ultimo_error: null
    }, { onConflict: 'tenant_id, branch_id, tipo' })
    .select('id, estado, identificador_externo')
    .single()
  if (error || !canal) return { success: false, error: error?.message || 'No se ha podido guardar el canal.' }

  // 3. La contraseña, a la caja fuerte, y entonces sí: activo
  try {
    await guardarContrasenaCorreo(canal.id, contrasena)
  } catch (e: any) {
    await supabaseAdmin.from('channels').update({ estado: 'error', ultimo_error: 'No se ha podido guardar la contraseña. Vuelve a conectar el correo.' }).eq('id', canal.id)
    return { success: false, error: `No se ha podido guardar la contraseña: ${e?.message}` }
  }
  if (!yaFuncionaba) {
    const { error: errActivar } = await supabase.from('channels').update({ estado: 'activo' }).eq('id', canal.id)
    if (errActivar) return { success: false, error: errActivar.message }
  }

  await registrarAuditoria({
    tenant_id: auth.tenant_id,
    user_id: auth.user_id,
    accion: existente && existente.estado !== 'desconectado' ? `cambió los datos del correo ${direccion}` : `conectó el correo ${direccion}`,
    tabla_afectada: 'canales',
    registro_id: canal.id,
    // Nunca la contraseña
    valor_anterior: anterior ? { direccion: anterior.direccion, imap: anterior.imap?.host, smtp: anterior.smtp?.host } : null,
    valor_nuevo: { direccion, imap: imap.host, smtp: smtp.host, nombre_remitente: nombreRemitente }
  })

  return { success: true, data: { id: canal.id, direccion } }
}
