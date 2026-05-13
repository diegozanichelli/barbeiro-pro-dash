import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fuso horário de Manaus (GMT-4)
const MANAUS_OFFSET = -4 * 60; // -4 horas em minutos

function getManausDate(): Date {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (MANAUS_OFFSET * 60000));
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function logStep(step: string, data?: any) {
  console.log(`[CHECK-ALERTS] ${step}`, data ? JSON.stringify(data) : '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep('Function started');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Data atual no fuso horário de Manaus
    const hoje = getManausDate();
    const mesAtual = hoje.getMonth() + 1; // 1-12
    const anoAtual = hoje.getFullYear();
    const diaAtual = hoje.getDate();
    
    // Primeira data do mês para referência
    const mesReferencia = new Date(anoAtual, mesAtual - 1, 1);
    const mesReferenciaStr = formatDate(mesReferencia);

    logStep('Processing month (Manaus timezone)', { mes: mesAtual, ano: anoAtual, dia: diaAtual, timezone: 'America/Manaus (GMT-4)' });

    // PASSO 1: Resolver/fechar automaticamente todos os alertas de meses anteriores
    const { data: alertasAntigos, error: alertasAntigosError } = await supabaseClient
      .from('performance_alerts')
      .update({ 
        status: 'encerrado_fim_mes',
        updated_at: new Date().toISOString()
      })
      .eq('status', 'ativo')
      .neq('mes_referencia', mesReferenciaStr)
      .select('id');

    if (alertasAntigosError) {
      logStep('Error closing old alerts', { error: alertasAntigosError.message });
    } else {
      logStep('Old alerts closed', { count: alertasAntigos?.length || 0 });
    }

    // PASSO 2: Buscar todas as metas do mês atual
    const { data: metas, error: metasError } = await supabaseClient
      .from('monthly_goals')
      .select(`
        *,
        barber:barbers(id, name, organization_id, user_id)
      `)
      .eq('month', mesAtual)
      .eq('year', anoAtual);

    if (metasError) {
      logStep('Error fetching goals', { error: metasError.message });
      throw metasError;
    }

    if (!metas || metas.length === 0) {
      logStep('No goals found for current month');
      return new Response(
        JSON.stringify({ message: 'No goals to check', alertsCreated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logStep('Goals found', { count: metas.length });

    const startedAt = Date.now();
    let alertsCreated = 0;
    let alertsUpdated = 0;
    let pacingErrors = 0;
    let otherErrors = 0;
    const errors: Array<Record<string, unknown>> = [];
    const pushError = (entry: Record<string, unknown>) => {
      // Limita para evitar payload gigante
      if (errors.length < 200) errors.push({ at: new Date().toISOString(), ...entry });
    };

    // Processar cada meta
    for (const meta of metas) {
      try {
        const barber = meta.barber;
        if (!barber || !barber.organization_id) {
          logStep('Skipping goal without barber data', { goalId: meta.id });
          continue;
        }

        // Buscar produções acumuladas do barbeiro no mês
        const primeiroDiaMes = new Date(anoAtual, mesAtual - 1, 1);
        const ultimoDiaMes = new Date(anoAtual, mesAtual, 0);
        const primeiroDiaMesStr = formatDate(primeiroDiaMes);
        const ultimoDiaMesStr = formatDate(ultimoDiaMes);
        
        const { data: producoes, error: producoesError } = await supabaseClient
          .from('daily_productions')
          .select('commission_earned')
          .eq('barber_id', barber.id)
          .gte('date', primeiroDiaMesStr)
          .lte('date', ultimoDiaMesStr);

        if (producoesError) {
          otherErrors++;
          pushError({
            stage: 'fetch_productions',
            barberId: barber.id,
            barberName: barber.name,
            message: producoesError.message,
            code: (producoesError as any).code,
            details: (producoesError as any).details,
            hint: (producoesError as any).hint,
          });
          logStep('Error fetching productions', { barberId: barber.id, error: producoesError.message });
          continue;
        }

        // Calcular comissão acumulada
        const comissaoAcumulada = producoes?.reduce(
          (acc, prod) => acc + Number(prod.commission_earned), 
          0
        ) || 0;

        // Pacing unificado via RPC (mesma fonte do dashboard)
        const refDateStr = formatDate(hoje);
        const { data: pacingRows, error: pacingError } = await supabaseClient
          .rpc('calc_expected_pacing', {
            p_barber_id: barber.id,
            p_ref_date: refDateStr,
          });

        if (pacingError) {
          pacingErrors++;
          pushError({
            stage: 'calc_expected_pacing',
            barberId: barber.id,
            barberName: barber.name,
            organizationId: barber.organization_id,
            refDate: refDateStr,
            message: pacingError.message,
            code: (pacingError as any).code,
            details: (pacingError as any).details,
            hint: (pacingError as any).hint,
          });
          logStep('Error calculating pacing', {
            barberId: barber.id,
            barberName: barber.name,
            error: pacingError.message,
            code: (pacingError as any).code,
            details: (pacingError as any).details,
            hint: (pacingError as any).hint,
          });
          continue;
        }

        const pacing = Array.isArray(pacingRows) ? pacingRows[0] : pacingRows;
        if (!pacing) {
          pacingErrors++;
          pushError({
            stage: 'calc_expected_pacing_empty',
            barberId: barber.id,
            barberName: barber.name,
            refDate: refDateStr,
            message: 'RPC retornou vazio',
          });
          logStep('Pacing RPC returned empty', { barberId: barber.id, barberName: barber.name });
          continue;
        }

        const metaTotal = Number(pacing?.target_commission ?? meta.target_commission ?? 0);
        const metaEsperadaAteHoje = Number(pacing?.expected_commission ?? 0);
        const diasUteisCorridos = Number(pacing?.working_days_passed ?? 0);
        const diasUteisTotais = Number(pacing?.working_days_total ?? meta.work_days ?? 1);
        const diasRestantes = Math.max(0, diasUteisTotais - diasUteisCorridos);

        // Threshold de 85% da meta esperada
        const threshold = metaEsperadaAteHoje * 0.85;
        const deficit = metaEsperadaAteHoje - comissaoAcumulada;
        const percentualAtingido = metaTotal > 0 ? (comissaoAcumulada / metaTotal) * 100 : 0;

        logStep('Barber analysis', {
          barberName: barber.name,
          comissaoAcumulada,
          metaEsperadaAteHoje,
          threshold,
          deficit,
          percentualAtingido: percentualAtingido.toFixed(2) + '%'
        });

        // Determinar tipo de alerta
        let alertaTipo: string | null = null;
        
        if (comissaoAcumulada < threshold) {
          // Se está abaixo de 85% da meta esperada
          if (diasRestantes < 5 && percentualAtingido < 70) {
            alertaTipo = 'Meta Impossível';
          } else if (percentualAtingido < 60) {
            alertaTipo = 'Abaixo do Ritmo';
          } else {
            alertaTipo = 'Risco Moderado';
          }
        }

        if (alertaTipo) {
          // Verificar se já existe alerta ativo
          const { data: existingAlert } = await supabaseClient
            .from('performance_alerts')
            .select('id, status')
            .eq('barber_id', barber.id)
            .eq('mes_referencia', mesReferenciaStr)
            .eq('alerta_tipo', alertaTipo)
            .eq('status', 'ativo')
            .maybeSingle();

          if (existingAlert) {
            // Atualizar alerta existente
            const { error: updateError } = await supabaseClient
              .from('performance_alerts')
              .update({
                valor_deficit_r$: deficit,
                percentual_atingido: percentualAtingido,
                dias_restantes: diasRestantes,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingAlert.id);

            if (!updateError) {
              alertsUpdated++;
              logStep('Alert updated', { barberId: barber.id, tipo: alertaTipo });
            }
          } else {
            // Criar novo alerta
            const { error: insertError } = await supabaseClient
              .from('performance_alerts')
              .insert({
                organization_id: barber.organization_id,
                barber_id: barber.id,
                mes_referencia: mesReferenciaStr,
                alerta_tipo: alertaTipo,
                valor_deficit_r$: deficit,
                percentual_atingido: percentualAtingido,
                dias_restantes: diasRestantes,
                status: 'ativo'
              });

            if (!insertError) {
              alertsCreated++;
              logStep('Alert created', { barberId: barber.id, tipo: alertaTipo });
            } else {
              logStep('Error creating alert', { barberId: barber.id, error: insertError.message });
            }
          }
        } else {
          // Se não há alerta necessário, marcar alertas existentes como resolvidos
          const { error: resolveError } = await supabaseClient
            .from('performance_alerts')
            .update({ status: 'resolvido' })
            .eq('barber_id', barber.id)
            .eq('mes_referencia', mesReferenciaStr)
            .eq('status', 'ativo');

          if (!resolveError) {
            logStep('Alerts resolved for barber', { barberId: barber.id });
          }
        }
      } catch (barberError) {
        logStep('Error processing barber', { 
          barberId: meta.barber?.id, 
          error: barberError instanceof Error ? barberError.message : String(barberError)
        });
      }
    }

    logStep('Job completed', { alertsCreated, alertsUpdated });

    return new Response(
      JSON.stringify({ 
        success: true, 
        alertsCreated, 
        alertsUpdated,
        metasProcessadas: metas.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep('ERROR', { message: errorMessage });
    
    return new Response(
      JSON.stringify({ error: 'Failed to check alerts', details: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
