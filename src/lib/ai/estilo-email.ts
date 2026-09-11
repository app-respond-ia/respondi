// Cómo escribe la IA cuando contesta un CORREO, no un chat. El cerebro y las
// herramientas son los mismos (catálogo, políticas, presupuestos, pasar a una
// persona...); cambia la forma: un correo se lee de una vez, con saludo,
// párrafos y despedida, y contesta todo lo que se pregunta en él. Pedido por
// Jorge el 11-09-2026 ("es diferente una respuesta por redes que un mail").

export function instruccionesEmail() {
  return [
    '',
    'ESTÁS CONTESTANDO UN CORREO ELECTRÓNICO, no un chat:',
    '- Empieza con un saludo breve con el nombre del cliente si lo sabes (por ejemplo, "Hola Carmen,").',
    '- Responde a TODO lo que pregunta en su correo, en párrafos cortos y ordenados. Puede ser más completo que un mensaje de chat, pero sin relleno.',
    '- Tono cordial y profesional. Sin emojis.',
    '- Texto normal: nada de formato con asteriscos, almohadillas ni tablas. Si hay una lista, usa guiones al principio de línea.',
    '- Termina con una despedida breve (por ejemplo, "Un saludo,"). NO pongas tu nombre ni una firma: se añade sola.',
    '- NO escribas el asunto: solo el cuerpo del correo.',
    ''
  ].join('\n')
}

// Lo que ve la IA de cada correo del cliente: el asunto y el texto
export function correoParaIA(asunto: string | null | undefined, texto: string) {
  return asunto ? `Asunto: ${asunto}\n\n${texto}` : texto
}

// Por si el modelo se salta alguna regla: sin formato de chat, sin "Asunto:"
// al principio y sin firmas de relleno ("[Tu nombre]")
export function limpiarRespuestaEmail(texto: string) {
  return (texto || '')
    .replace(/^\s*asunto\s*:.*\n+/i, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[*•]\s+/gm, '- ')
    .replace(/\n*\[(tu nombre|nombre|firma|your name)[^\]]*\]\s*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
