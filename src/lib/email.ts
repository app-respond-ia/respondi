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
        <p style="color: #475569; font-size: 15px;">Se ha creado una cuenta para ti como <strong>${rolLabel}</strong> en Respondi.</p>
        <a href="${params.actionLink}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px;">Activar mi cuenta</a>
      </div>
    `
  })
}
