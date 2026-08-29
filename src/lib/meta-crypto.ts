import crypto from 'crypto'

/**
 * Parsea y verifica la firma de un signed_request de Meta.
 * @param signedRequest El payload firmado enviado por Meta (ej. "xxxxx.yyyyy")
 * @param secret El App Secret de tu aplicación de Meta
 * @returns El objeto JSON decodificado si la firma es válida, o null si falla.
 */
export function parseSignedRequest(signedRequest: string, secret: string): Record<string, any> | null {
  try {
    const parts = signedRequest.split('.')
    if (parts.length !== 2) {
      return null
    }

    const encodedSig = parts[0]
    const payload = parts[1]

    // Decodificar Base64-URL a Buffer
    const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    const dataJSON = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const data = JSON.parse(dataJSON)

    // Validar algoritmo
    if (!data.algorithm || data.algorithm.toUpperCase() !== 'HMAC-SHA256') {
      console.error('Algoritmo desconocido en signed_request:', data.algorithm)
      return null
    }

    // Generar la firma esperada usando HMAC SHA-256
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest()

    // Usar timingSafeEqual para prevenir ataques de timing
    if (!crypto.timingSafeEqual(sig, expectedSig)) {
      console.error('La firma del signed_request no coincide')
      return null
    }

    return data
  } catch (error) {
    console.error('Error al parsear signed_request:', error)
    return null
  }
}
