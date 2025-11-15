import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('=== Update Barber Auth - Start ===')
    
    // Verificar autenticação
    const authHeader = req.headers.get('Authorization')
    console.log('Auth header present:', !!authHeader)
    
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
    console.log('User authenticated:', !!user)
    
    if (userError || !user) {
      console.error('Failed to get user')
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

    console.log('User role:', userRole?.role)

    if (roleError || userRole?.role !== 'manager') {
      console.error('Access denied - not manager')
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas gerentes podem atualizar dados de autenticação.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Obter dados da requisição
    const { barber_id, email, password } = await req.json()
    console.log('Barber ID provided:', !!barber_id)
    console.log('Email update:', email ? 'yes' : 'no')
    console.log('Password update:', password ? 'yes' : 'no')

    if (!barber_id) {
      console.error('Barber ID not provided')
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

    console.log('Barber found:', !!barber)

    if (barberError || !barber?.user_id) {
      console.error('Barber not found')
      return new Response(
        JSON.stringify({ error: 'Barbeiro não encontrado ou sem usuário vinculado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate password if provided (8+ characters with complexity)
    if (password) {
      const passwordStr = String(password);
      if (passwordStr.length < 8) {
        console.error('Password too short');
        return new Response(
          JSON.stringify({ error: 'Senha deve ter no mínimo 8 caracteres' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Check password complexity (must have uppercase and lowercase or numbers)
      const hasComplexity = /^(?=.*[a-z])(?=.*[A-Z\d])/.test(passwordStr);
      if (!hasComplexity) {
        console.error('Password lacks complexity');
        return new Response(
          JSON.stringify({ error: 'Senha deve conter letras maiúsculas e minúsculas ou números' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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
    console.log('Updating user auth data')
    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      barber.user_id,
      updateData
    )

    if (updateError) {
      console.error('Update failed:', updateError.message)
      return new Response(
        JSON.stringify({ error: 'Falha ao atualizar dados de autenticação. Tente novamente.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User auth updated successfully')
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Dados de autenticação atualizados com sucesso',
        user: updatedUser 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown')
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
