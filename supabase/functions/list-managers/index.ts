import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('=== List Managers - Start ===')
    
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
        JSON.stringify({ error: 'Acesso negado. Apenas super admins podem listar gerentes.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Criar cliente Admin para buscar informações de autenticação
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

    // Buscar todos os gerentes
    const { data: managers, error: managersError } = await supabaseClient
      .from('user_roles')
      .select(`
        user_id,
        organization_id,
        organizations!inner(name)
      `)
      .eq('role', 'manager')

    if (managersError) throw managersError

    console.log('Managers found:', managers?.length)

    // Buscar emails dos usuários usando o admin client (paginado)
    const allAuthUsers: { id: string; email?: string }[] = []
    for (let page = 1; page <= 20; page++) {
      const { data: pageData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 1000,
      })
      if (authError) throw authError
      allAuthUsers.push(...pageData.users)
      if (pageData.users.length < 1000) break
    }

    console.log('Auth users fetched:', allAuthUsers.length)

    // Mapear gerentes com seus emails
    const managersWithEmails = managers?.map((manager: any) => {
      const authUser = allAuthUsers.find((u) => u.id === manager.user_id)
      return {
        user_id: manager.user_id,
        email: authUser?.email || '',
        organization_name: manager.organizations.name,
        organization_id: manager.organization_id,
      }
    }) || []

    // Organizações sem gerente vinculado (contas órfãs)
    const { data: allOrgs, error: orgsError } = await supabaseAdmin
      .from('organizations')
      .select('id, name')

    if (orgsError) throw orgsError

    const orgsWithManager = new Set(managersWithEmails.map((m) => m.organization_id))
    const organizationsWithoutManager = (allOrgs || [])
      .filter((org) => !orgsWithManager.has(org.id))
      .map((org) => ({ organization_id: org.id, organization_name: org.name }))

    console.log('Organizations without manager:', organizationsWithoutManager.length)
    console.log('=== List Managers - Success ===')

    return new Response(
      JSON.stringify({ managers: managersWithEmails, organizations_without_manager: organizationsWithoutManager }),
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
