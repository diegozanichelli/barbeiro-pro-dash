import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { maskEmail, maskId, generateCorrelationId } from '../_shared/privacy.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const correlationId = generateCorrelationId()
  
  try {
    console.log(`[${correlationId}] Update Barber Auth - Start`)
    
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization')
    console.log(`[${correlationId}] Auth header present:`, !!authHeader)
    
    if (!authHeader) {
      console.error('Sem header de autorização')
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Criar cliente Supabase com a chave de serviço para operações administrativas
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Criar cliente Supabase regular para verificar o usuário que está fazendo a requisição
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    )

    // Verificar se o usuário logado é gerente
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    console.log(`[${correlationId}] User ID:`, maskId(user?.id))
    
    if (userError || !user) {
      console.error(`[${correlationId}] Failed to get user`)
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar se o usuário é gerente através da tabela user_roles
    const { data: userRole, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    console.log(`[${correlationId}] User role:`, userRole?.role)

    if (roleError || userRole?.role !== 'manager') {
      console.error(`[${correlationId}] Access denied - not manager`)
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas gerentes podem atualizar dados de autenticação.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Obter dados da requisição
    const { barber_id, email, password } = await req.json()
    console.log(`[${correlationId}] Barber ID:`, maskId(barber_id))
    console.log(`[${correlationId}] Email update:`, email ? maskEmail(email) : 'not provided')
    console.log(`[${correlationId}] Password update:`, password ? 'provided' : 'not provided')

    if (!barber_id) {
      console.error(`[${correlationId}] Barber ID not provided`)
      return new Response(
        JSON.stringify({ error: 'ID do barbeiro é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar o user_id do barbeiro
    const { data: barber, error: barberError } = await supabaseClient
      .from('barbers')
      .select('user_id')
      .eq('id', barber_id)
      .single()

    console.log(`[${correlationId}] Barber found:`, !!barber)
    console.log(`[${correlationId}] Barber user_id:`, maskId(barber?.user_id))

    if (barberError || !barber?.user_id) {
      console.error(`[${correlationId}] Barber not found`)
      return new Response(
        JSON.stringify({ error: 'Barbeiro não encontrado ou sem usuário vinculado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Preparar dados de atualização
    const updateData: any = {}
    
    if (email) {
      updateData.email = email
    }
    
    if (password) {
      updateData.password = password
    }

    // Se não há nada para atualizar
    if (Object.keys(updateData).length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhuma alteração necessária' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Atualizar dados de autenticação usando o Admin client
    console.log(`[${correlationId}] Updating user auth data`)
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      barber.user_id,
      updateData
    )

    if (updateError) {
      console.error(`[${correlationId}] Update failed:`, updateError.message)
      return new Response(
        JSON.stringify({ error: `Erro ao atualizar: ${updateError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[${correlationId}] User auth updated successfully`)
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Dados de autenticação atualizados com sucesso',
        user: updatedUser 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error(`[${correlationId}] Error:`, error instanceof Error ? error.message : 'Unknown')
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
