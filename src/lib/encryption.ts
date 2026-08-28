import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

const getKey = (): Buffer => {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) {
    throw new Error('ENCRYPTION_KEY environment variable is not set')
  }
  // Usamos SHA-256 para garantizar que la clave resultante tenga exactamente 32 bytes (256 bits),
  // independientemente de la longitud de la cadena proporcionada en la variable de entorno.
  return crypto.createHash('sha256').update(String(secret)).digest()
}

export const cifrar = (texto: string): string => {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(texto, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()

  // Formato: iv:auth_tag:texto_cifrado
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

export const descifrar = (textoCifrado: string): string => {
  const key = getKey()
  const parts = textoCifrado.split(':')
  
  if (parts.length !== 3) {
    throw new Error('Formato de texto cifrado inválido')
  }

  const iv = Buffer.from(parts[0], 'hex')
  const tag = Buffer.from(parts[1], 'hex')
  const encrypted = parts[2]

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}
