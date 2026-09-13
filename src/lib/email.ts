import { Resend } from 'resend'

// Fallback para evitar que el build de Next.js casque si falta la variable de entorno
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key')

export async function enviarEmailInvitacion(params: {
  email: string
  actionLink: string
  rol: string
}) {
  const roleLabels: Record<string, string> = {
    super_admin: 'Super Administrador',
    vendedor: 'Vendedor/Partner',
    admin: 'Administrador de la Tienda',
    tenant_user: 'Administrador',
    agente: 'Agente de Atención',
    operario: 'Operario',
  }
  const rolLabel = roleLabels[params.rol] || 'Colaborador'

  return await resend.emails.send({
    from: 'Respondi <onboarding@resend.dev>',
    to: params.email,
    subject: 'Has sido invitado a Respondi',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h1 style="color: #1e1b4b; font-size: 24px;">Has sido invitado</h1>
        <p style="color: #475569; font-size: 15px;">Has sido invitado a formar parte de Respondi como <strong>${rolLabel}</strong>.</p>
        <p style="color: #475569; font-size: 15px;">Para activar tu acceso, crea tu cuenta usando <strong>este mismo correo (${params.email})</strong>. En cuanto lo hagas, quedará vinculada automáticamente a tu rol.</p>
        <a href="${params.actionLink}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">Crear mi cuenta</a>
      </div>
    `
  })
}

// Aviso a los propietarios de una organización cuando quedan pocos créditos
// (20 %) o se han agotado. Hasta que haya dominio propio en Resend sale
// desde su remitente de pruebas, que solo entrega al dueño de la cuenta.
export async function enviarEmailCreditos(params: { para: string[]; organizacion: string; saldo: number; max: number; agotado: boolean }) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://respondi.vercel.app'
  const asunto = params.agotado
    ? `Respondi: se han agotado los créditos de IA de ${params.organizacion}`
    : `Respondi: quedan pocos créditos de IA en ${params.organizacion}`
  const texto = params.agotado
    ? 'La IA ha dejado de contestar a tus clientes porque no quedan créditos. Amplía tu plan para que siga atendiendo.'
    : `Te quedan <strong>${params.saldo.toLocaleString('es-ES')}</strong> de ${params.max.toLocaleString('es-ES')} créditos. Cuando se agoten, la IA dejará de contestar a tus clientes.`
  return await resend.emails.send({
    from: 'Respondi <onboarding@resend.dev>',
    to: params.para,
    subject: asunto,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h1 style="color: #1e1b4b; font-size: 22px;">${params.agotado ? 'Sin créditos de IA' : 'Quedan pocos créditos de IA'}</h1>
        <p style="color: #475569; font-size: 15px;">${texto}</p>
        <a href="${base}/dashboard/facturacion#planes" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">Ampliar el plan</a>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">Cada respuesta de la IA gasta un crédito. Puedes ver el consumo en Facturación.</p>
      </div>
    `
  })
}
