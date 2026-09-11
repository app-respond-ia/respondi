// Los servidores de los proveedores de correo más usados, para que el cliente
// no tenga que buscarlos: elige el suyo (o se detecta por su dirección) y solo
// pone la contraseña. Sirve en el navegador y en el servidor.

export interface Servidor { host: string; puerto: number; seguro: boolean }

export interface ProveedorCorreo {
  id: string
  nombre: string
  imap: Servidor
  smtp: Servidor
  // Qué contraseña hay que poner (algunos exigen una "de aplicación")
  contrasena: string
  ayuda?: string
  enlace?: { texto: string; url: string }
}

export const PROVEEDORES_CORREO: ProveedorCorreo[] = [
  {
    id: 'gmail',
    nombre: 'Gmail o Google Workspace',
    imap: { host: 'imap.gmail.com', puerto: 993, seguro: true },
    smtp: { host: 'smtp.gmail.com', puerto: 465, seguro: true },
    contrasena: 'Contraseña de aplicación',
    ayuda: 'Google no deja usar la contraseña normal. En tu cuenta de Google → Seguridad, activa la verificación en dos pasos y crea una «contraseña de aplicación» (llámala Respondi). Son 16 letras: pégalas aquí.',
    enlace: { texto: 'Crear la contraseña de aplicación', url: 'https://myaccount.google.com/apppasswords' }
  },
  {
    id: 'ionos',
    nombre: 'IONOS',
    imap: { host: 'imap.ionos.es', puerto: 993, seguro: true },
    smtp: { host: 'smtp.ionos.es', puerto: 465, seguro: true },
    contrasena: 'Contraseña del buzón'
  },
  {
    id: 'hostinger',
    nombre: 'Hostinger',
    imap: { host: 'imap.hostinger.com', puerto: 993, seguro: true },
    smtp: { host: 'smtp.hostinger.com', puerto: 465, seguro: true },
    contrasena: 'Contraseña del buzón'
  },
  {
    id: 'ovh',
    nombre: 'OVHcloud',
    imap: { host: 'ssl0.ovh.net', puerto: 993, seguro: true },
    smtp: { host: 'ssl0.ovh.net', puerto: 465, seguro: true },
    contrasena: 'Contraseña del buzón'
  },
  {
    id: 'zoho',
    nombre: 'Zoho Mail',
    imap: { host: 'imappro.zoho.eu', puerto: 993, seguro: true },
    smtp: { host: 'smtppro.zoho.eu', puerto: 465, seguro: true },
    contrasena: 'Contraseña del buzón',
    ayuda: 'Tiene que estar activado el acceso IMAP (Zoho Mail → Configuración → Cuentas de correo → IMAP). Si tienes la verificación en dos pasos, usa una contraseña específica de aplicación.'
  },
  {
    id: 'yahoo',
    nombre: 'Yahoo',
    imap: { host: 'imap.mail.yahoo.com', puerto: 993, seguro: true },
    smtp: { host: 'smtp.mail.yahoo.com', puerto: 465, seguro: true },
    contrasena: 'Contraseña de aplicación',
    ayuda: 'Yahoo no deja usar la contraseña normal. En tu cuenta de Yahoo → Seguridad → «Generar contraseña de aplicación».',
    enlace: { texto: 'Seguridad de tu cuenta de Yahoo', url: 'https://login.yahoo.com/account/security' }
  },
  {
    id: 'icloud',
    nombre: 'iCloud',
    imap: { host: 'imap.mail.me.com', puerto: 993, seguro: true },
    smtp: { host: 'smtp.mail.me.com', puerto: 587, seguro: false },
    contrasena: 'Contraseña específica de app',
    ayuda: 'Apple no deja usar la contraseña normal. En tu cuenta de Apple → Inicio de sesión y seguridad → «Contraseñas específicas de apps».',
    enlace: { texto: 'Tu cuenta de Apple', url: 'https://account.apple.com' }
  },
  {
    id: 'otro',
    nombre: 'Otro proveedor',
    imap: { host: '', puerto: 993, seguro: true },
    smtp: { host: '', puerto: 465, seguro: true },
    contrasena: 'Contraseña del buzón',
    ayuda: 'Busca en la ayuda de tu proveedor «configurar correo IMAP y SMTP»: te dirá los dos servidores y sus puertos.'
  }
]

export function proveedorCorreo(id: string) {
  return PROVEEDORES_CORREO.find(p => p.id === id) || PROVEEDORES_CORREO[PROVEEDORES_CORREO.length - 1]
}

// Microsoft (Outlook, Hotmail, Microsoft 365) ya no deja entrar en un buzón
// con usuario y contraseña: exige su propio inicio de sesión. Todavía no está.
export const AVISO_MICROSOFT = 'Outlook, Hotmail y Microsoft 365 todavía no se pueden conectar: Microsoft ya no deja entrar en el buzón con contraseña y exige su propio inicio de sesión, que aún no tenemos. Puedes usar un buzón de otro proveedor o reenviar los correos a uno que sí se pueda conectar.'

export function esServidorMicrosoft(host: string) {
  return /(^|\.)(office365\.com|outlook\.com|hotmail\.com|live\.com)$/i.test((host || '').trim())
}

export function esDireccionMicrosoft(direccion: string) {
  return /@(outlook|hotmail|live|msn)\.[a-z.]+$/i.test((direccion || '').trim())
}
