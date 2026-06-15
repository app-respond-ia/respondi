'use server'

import { createClient } from '@/utils/supabase/server'

async function getAuthData(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', user_id: null }

  const { data: userData } = await supabase
    .from('users')
    .select('tenant_id, branch_id')
    .eq('id', user.id)
    .single()

  if (!userData?.tenant_id) {
    return { error: 'Usuario no vinculado a un comercio', user_id: user.id }
  }

  return { tenant_id: userData.tenant_id, branch_id: userData.branch_id, user_id: user.id }
}

export async function getMisCasos(filtro: 'todos' | 'pendiente' | 'atendiendo' = 'todos') {
  const supabase = await createClient()
  const auth = await getAuthData(supabase)
  
  if (auth.error) {
    return { success: false, error: auth.error }
  }

  // Fetch all 'pendiente' and 'atendiendo' cases for this agent
  let query = supabase
    .from('cases')
    .select(`
      *,
      contacts (
        nombre,
        canal,
        identificador_canal
      ),
      conversation_tags:conversations (
        conversation_tags (
          message_categories (
            nombre,
            color
          )
        )
      )
    `)
    .eq('tenant_id', auth.tenant_id)
    .eq('agente_id', auth.user_id)
    .in('estatus', ['pendiente', 'atendiendo'])
    .order('fecha_apertura', { ascending: true })

  // Wait, the schema says cases has conversation_id. 
  // To get conversation_tags from cases:
  // cases -> conversations -> conversation_tags -> message_categories.
  // The correct syntax for Supabase JS to join through an explicit foreign key or relation is:
  // `conversations ( conversation_tags ( message_categories ( nombre, color ) ) )`
  
  const { data, error } = await query

  if (error) {
    console.error('Error fetching mis casos:', error)
    return { success: false, error: error.message }
  }

  const allCases = data || []

  const counts = {
    todos: allCases.length,
    pendiente: 0,
    atendiendo: 0
  }

  const processedCases = allCases.map(c => {
    if (c.estatus === 'pendiente') counts.pendiente++
    if (c.estatus === 'atendiendo') counts.atendiendo++

    // Extraer el primer tag si existe
    let tag = null
    if (c.conversations && c.conversations.conversation_tags) {
      const tagsArray = Array.isArray(c.conversations.conversation_tags) 
        ? c.conversations.conversation_tags 
        : [c.conversations.conversation_tags]
      
      const firstTag = tagsArray[0]
      if (firstTag?.message_categories) {
        tag = firstTag.message_categories
      }
    }

    return {
      ...c,
      primer_tag: tag
    }
  })

  // Apply the filter
  const filteredCases = filtro === 'todos' 
    ? processedCases 
    : processedCases.filter(c => c.estatus === filtro)

  return {
    success: true,
    data: {
      casos: filteredCases,
      counts
    }
  }
}
