import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
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
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar se o usuário é gerente
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'manager') {
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas gerentes podem atualizar dados de autenticação.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Obter dados da requisição
    const { barber_id, email, password } = await req.json()

    if (!barber_id) {
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

    if (barberError || !barber?.user_id) {
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
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      barber.user_id,
      updateData
    )

    if (updateError) {
      console.error('Erro ao atualizar usuário:', updateError)
      return new Response(
        JSON.stringify({ error: `Erro ao atualizar: ${updateError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Dados de autenticação atualizados com sucesso',
        user: updatedUser 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Erro na função:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
