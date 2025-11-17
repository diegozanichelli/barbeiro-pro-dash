import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('=== Update Manager Auth - Start ===')
    
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

    // Verificar se o usuário logado é super admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    console.log('User authenticated:', !!user)
    
    if (userError || !user) {
      console.error('Failed to get user')
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar se o usuário é super_admin através da tabela user_roles
    const { data: userRole, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    console.log('User role:', userRole?.role)

    if (roleError || userRole?.role !== 'super_admin') {
      console.error('Access denied - not super admin')
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas super admins podem atualizar dados de gerentes.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Obter dados da requisição
    const { manager_user_id, email, password } = await req.json()
    console.log('Manager user ID provided:', !!manager_user_id)
    console.log('Email update:', email ? 'yes' : 'no')
    console.log('Password update:', password ? 'yes' : 'no')

    if (!manager_user_id) {
      console.error('Manager user ID not provided')
      return new Response(
        JSON.stringify({ error: 'ID do gerente é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar se o user_id existe e é um gerente
    const { data: managerRole, error: managerRoleError } = await supabaseAdmin
      .from('user_roles')
      .select('role, organization_id')
      .eq('user_id', manager_user_id)
      .eq('role', 'manager')
      .single()

    console.log('Manager role found:', !!managerRole)

    if (managerRoleError || !managerRole) {
      console.error('Manager not found')
      return new Response(
        JSON.stringify({ error: 'Gerente não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate password if provided (8+ characters with complexity)
    if (password) {
      const passwordStr = String(password);
      if (passwordStr.length < 8) {
        console.error('Password too short')
        return new Response(
          JSON.stringify({ error: 'Senha deve ter no mínimo 8 caracteres' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check password complexity (uppercase + lowercase or numbers)
      const hasUpperCase = /[A-Z]/.test(passwordStr)
      const hasLowerCase = /[a-z]/.test(passwordStr)
      const hasNumber = /\d/.test(passwordStr)
      
      if (!hasLowerCase || !(hasUpperCase || hasNumber)) {
        console.error('Password does not meet complexity requirements')
        return new Response(
          JSON.stringify({ 
            error: 'Senha deve conter letras maiúsculas e minúsculas ou números' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Preparar dados de atualização
    const updateData: { email?: string; password?: string } = {}
    
    if (email) {
      updateData.email = email
    }
    
    if (password) {
      updateData.password = password
    }

    if (Object.keys(updateData).length === 0) {
      console.error('No update data provided')
      return new Response(
        JSON.stringify({ error: 'Nenhum dado para atualizar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Updating manager authentication...')

    // Atualizar dados de autenticação usando o cliente admin
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      manager_user_id,
      updateData
    )

    console.log('Auth update result:', { success: !!authData, error: authError?.message })

    if (authError) {
      console.error('Error updating auth:', authError)
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar autenticação' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('=== Update Manager Auth - Success ===')

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Dados de autenticação do gerente atualizados com sucesso'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
