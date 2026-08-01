import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('=== Admin Update Manager - Start ===')
    
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

    // Verificar se o usuário é super_admin
    const { data: userRole, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    console.log('User role:', userRole?.role)

    if (roleError || userRole?.role !== 'super_admin') {
      console.error('Access denied - not super admin')
      return new Response(
        JSON.stringify({ error: 'Acesso negado. Apenas super admins podem atualizar gerentes.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Obter dados da requisição
    const { organization_id, organization_name, manager_name, email, password } = await req.json()
    console.log('Organization ID provided:', !!organization_id)
    console.log('Updates requested:', { organization_name: !!organization_name, manager_name: !!manager_name, email: !!email, password: !!password })

    if (!organization_id) {
      console.error('Organization ID not provided')
      return new Response(
        JSON.stringify({ error: 'ID da organização é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Criar cliente Admin
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

    // Validar senha se fornecida (usado tanto na atualização quanto na criação)
    const validatePassword = (value: unknown): string | null => {
      const passwordStr = String(value)
      if (passwordStr.length < 8) {
        return 'Senha deve ter no mínimo 8 caracteres'
      }
      const hasUpperCase = /[A-Z]/.test(passwordStr)
      const hasLowerCase = /[a-z]/.test(passwordStr)
      const hasNumber = /\d/.test(passwordStr)
      if (!hasLowerCase || !(hasUpperCase || hasNumber)) {
        return 'Senha deve conter letras maiúsculas e minúsculas ou números'
      }
      return null
    }

    // Buscar o gerente da organização
    const { data: managerRole } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('organization_id', organization_id)
      .eq('role', 'manager')
      .maybeSingle()

    // Organização órfã (sem gerente): provisionar o acesso
    if (!managerRole) {
      console.log('Organization has no manager - provisioning flow')

      if (!email || !password) {
        return new Response(
          JSON.stringify({
            error: 'Esta barbearia não possui gerente. Informe email e senha para criar o acesso.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const passwordError = validatePassword(password)
      if (passwordError) {
        return new Response(
          JSON.stringify({ error: passwordError }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const trimmedEmail = String(email).trim()

      // Atualizar nome da organização se fornecido
      if (organization_name) {
        const { error: orgError } = await supabaseAdmin
          .from('organizations')
          .update({ name: organization_name })
          .eq('id', organization_id)
        if (orgError) throw orgError
      }

      let newManagerId: string | null = null

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: trimmedEmail,
        password: String(password),
        email_confirm: true,
        user_metadata: { full_name: manager_name || organization_name || trimmedEmail },
      })

      if (createError) {
        if (createError.message?.includes('already been registered')) {
          const { data: listed, error: listError } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          })
          if (listError) throw listError

          const existingUser = listed.users.find(
            (u) => u.email?.toLowerCase() === trimmedEmail.toLowerCase()
          )
          if (!existingUser) {
            return new Response(
              JSON.stringify({ error: 'Não foi possível localizar o usuário existente com este email' }),
              { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const { data: existingRole } = await supabaseAdmin
            .from('user_roles')
            .select('id, organization_id')
            .eq('user_id', existingUser.id)
            .maybeSingle()

          if (existingRole && existingRole.organization_id !== organization_id) {
            return new Response(
              JSON.stringify({ error: 'Este email já está vinculado a outra organização' }),
              { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          // Reaproveitar usuário existente e redefinir a senha
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
            password: String(password),
          })
          if (updErr) throw updErr

          newManagerId = existingUser.id
        } else {
          throw createError
        }
      } else {
        newManagerId = created.user.id
      }

      if (!newManagerId) {
        return new Response(
          JSON.stringify({ error: 'Falha ao criar o usuário do gerente' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Garantir perfil com nome
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({ id: newManagerId, full_name: manager_name || organization_name || trimmedEmail })
      if (profileError) {
        console.error('Error upserting profile:', profileError)
        throw profileError
      }

      // Vincular role de manager à organização
      const { error: roleInsertError } = await supabaseAdmin
        .from('user_roles')
        .upsert(
          { user_id: newManagerId, role: 'manager', organization_id },
          { onConflict: 'user_id,role' }
        )
      if (roleInsertError) {
        console.error('Error creating manager role:', roleInsertError)
        throw roleInsertError
      }

      console.log('=== Admin Update Manager - Manager provisioned ===')

      return new Response(
        JSON.stringify({
          success: true,
          created: true,
          message: 'Gerente criado e vinculado à barbearia com sucesso',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const manager_user_id = managerRole.user_id
    console.log('Manager user ID found:', manager_user_id)


    // Atualizar nome da organização se fornecido
    if (organization_name) {
      console.log('Updating organization name...')
      const { error: orgError } = await supabaseAdmin
        .from('organizations')
        .update({ name: organization_name })
        .eq('id', organization_id)

      if (orgError) {
        console.error('Error updating organization:', orgError)
        throw orgError
      }
    }

    // Atualizar nome do gerente no perfil se fornecido
    if (manager_name) {
      console.log('Updating manager profile name...')
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ full_name: manager_name })
        .eq('id', manager_user_id)

      if (profileError) {
        console.error('Error updating profile:', profileError)
        throw profileError
      }
    }

    // Atualizar email e/ou senha se fornecidos
    if (email || password) {
      // Validate password if provided
      if (password) {
        const passwordError = validatePassword(password)
        if (passwordError) {
          console.error('Password validation failed')
          return new Response(
            JSON.stringify({ error: passwordError }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }


      console.log('Updating manager authentication...')
      const updateData: { email?: string; password?: string } = {}
      
      if (email) updateData.email = email
      if (password) updateData.password = password

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        manager_user_id,
        updateData
      )

      if (authError) {
        console.error('Error updating auth:', authError)
        throw authError
      }
    }

    console.log('=== Admin Update Manager - Success ===')

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Gerente e organização atualizados com sucesso'
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
