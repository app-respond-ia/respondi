export function formatChannelId(canal: string, identificador: string): string {
  let cleaned = identificador.trim()
  
  if (canal === 'whatsapp') {
    // Remove all non-digit and non-plus characters
    cleaned = cleaned.replace(/[^\d+]/g, '')
    // Ensure it starts with + if it has digits
    if (cleaned.length > 0 && !cleaned.startsWith('+')) {
      cleaned = '+' + cleaned
    }
    return cleaned
  } else if (canal === 'instagram' || canal === 'facebook') {
    // Allow only alphanumeric, dots, and underscores
    cleaned = cleaned.replace(/[^a-zA-Z0-9._]/g, '')
    // Ensure it starts with @
    if (cleaned.length > 0 && !cleaned.startsWith('@')) {
      cleaned = '@' + cleaned
    }
    return cleaned
  }
  
  return cleaned
}
