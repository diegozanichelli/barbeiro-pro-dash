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

    // OTIMIZAÇÃO: pré-buscar pacing + comissão acumulada de todos os barbeiros
    // por organização em uma única RPC, evitando 2*N round-trips.
    const refDateStr = formatDate(hoje);
    const orgIds = Array.from(new Set(
      metas.map((m: any) => m.barber?.organization_id).filter(Boolean)
    )) as string[];
    const pacingByBarber = new Map<string, any>();

    for (const orgId of orgIds) {
      const { data: rows, error: batchError } = await supabaseClient
        .rpc('calc_expected_pacing_batch', {
          p_organization_id: orgId,
          p_ref_date: refDateStr,
        });

      if (batchError) {
        pacingErrors++;
        pushError({
          stage: 'calc_expected_pacing_batch',
          organizationId: orgId,
          refDate: refDateStr,
          message: batchError.message,
          code: (batchError as any).code,
          details: (batchError as any).details,
          hint: (batchError as any).hint,
        });
        logStep('Error in pacing batch', { organizationId: orgId, error: batchError.message });
        continue;
      }
      for (const r of (rows ?? [])) {
        pacingByBarber.set(r.barber_id, r);
      }
    }

    logStep('Pacing batch loaded', { orgs: orgIds.length, barbersCached: pacingByBarber.size });

    // Processar cada meta usando o cache em memória
    for (const meta of metas) {
      try {
        const barber = meta.barber;
        if (!barber || !barber.organization_id) {
          logStep('Skipping goal without barber data', { goalId: meta.id });
          continue;
        }

        const pacing = pacingByBarber.get(barber.id);
        if (!pacing) {
          pacingErrors++;
          pushError({
            stage: 'pacing_missing_in_batch',
            barberId: barber.id,
            barberName: barber.name,
            organizationId: barber.organization_id,
            refDate: refDateStr,
            message: 'Barbeiro não retornado pelo batch (provável status != active)',
          });
          continue;
        }

        const comissaoAcumulada = Number(pacing.comissao_acumulada ?? 0);

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
        otherErrors++;
        const msg = barberError instanceof Error ? barberError.message : String(barberError);
        pushError({
          stage: 'barber_loop_exception',
          barberId: meta.barber?.id,
          barberName: meta.barber?.name,
          message: msg,
        });
        logStep('Error processing barber', { barberId: meta.barber?.id, error: msg });
      }
    }

    // ============================================================
    // PASSO 3: Day-off check — alertar barbeiros com >4 folgas no mês
    // ============================================================
    const DAY_OFF_THRESHOLD = 4;
    const lastDayDate = new Date(anoAtual, mesAtual, 0); // último dia do mês
    const lastDayStr = formatDate(lastDayDate);

    for (const orgId of orgIds) {
      try {
        const { data: activeBarbers, error: barbersError } = await supabaseClient
          .from('barbers')
          .select('id, name, organization_id')
          .eq('organization_id', orgId)
          .eq('status', 'active');

        if (barbersError) {
          otherErrors++;
          pushError({ stage: 'dayoff_fetch_barbers', organizationId: orgId, message: barbersError.message });
          continue;
        }
        if (!activeBarbers || activeBarbers.length === 0) continue;

        const barberIds = activeBarbers.map((b: any) => b.id);
        const { data: dayOffRows, error: dayOffError } = await supabaseClient
          .from('daily_productions')
          .select('barber_id')
          .in('barber_id', barberIds)
          .eq('presence_type', 'day_off')
          .gte('date', mesReferenciaStr)
          .lte('date', lastDayStr);

        if (dayOffError) {
          otherErrors++;
          pushError({ stage: 'dayoff_fetch_productions', organizationId: orgId, message: dayOffError.message });
          continue;
        }

        const countByBarber = new Map<string, number>();
        for (const row of (dayOffRows ?? [])) {
          countByBarber.set(row.barber_id, (countByBarber.get(row.barber_id) ?? 0) + 1);
        }

        for (const barber of activeBarbers) {
          const count = countByBarber.get(barber.id) ?? 0;

          if (count > DAY_OFF_THRESHOLD) {
            const { data: existing } = await supabaseClient
              .from('performance_alerts')
              .select('id')
              .eq('barber_id', barber.id)
              .eq('mes_referencia', mesReferenciaStr)
              .eq('alerta_tipo', 'Folgas em Excesso')
              .eq('status', 'ativo')
              .maybeSingle();

            if (existing) {
              const { error: updErr } = await supabaseClient
                .from('performance_alerts')
                .update({
                  dias_restantes: count,
                  valor_deficit_r$: 0,
                  percentual_atingido: 0,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
              if (!updErr) alertsUpdated++;
            } else {
              const { error: insErr } = await supabaseClient
                .from('performance_alerts')
                .insert({
                  organization_id: barber.organization_id,
                  barber_id: barber.id,
                  mes_referencia: mesReferenciaStr,
                  alerta_tipo: 'Folgas em Excesso',
                  valor_deficit_r$: 0,
                  percentual_atingido: 0,
                  dias_restantes: count,
                  status: 'ativo',
                });
              if (!insErr) {
                alertsCreated++;
                logStep('Day-off alert created', { barberId: barber.id, count });
              } else {
                otherErrors++;
                pushError({ stage: 'dayoff_insert', barberId: barber.id, message: insErr.message });
              }
            }
          } else {
            // Auto-resolver se voltou ao normal
            await supabaseClient
              .from('performance_alerts')
              .update({ status: 'resolvido' })
              .eq('barber_id', barber.id)
              .eq('mes_referencia', mesReferenciaStr)
              .eq('alerta_tipo', 'Folgas em Excesso')
              .eq('status', 'ativo');
          }
        }
      } catch (orgErr) {
        otherErrors++;
        const msg = orgErr instanceof Error ? orgErr.message : String(orgErr);
        pushError({ stage: 'dayoff_org_exception', organizationId: orgId, message: msg });
      }
    }

    const durationMs = Date.now() - startedAt;
    logStep('Job completed', { alertsCreated, alertsUpdated, pacingErrors, otherErrors, durationMs });


    // Auditoria: persistir resumo + erros
    const { error: auditError } = await supabaseClient
      .from('performance_alert_run_logs')
      .insert({
        metas_processadas: metas.length,
        alerts_created: alertsCreated,
        alerts_updated: alertsUpdated,
        pacing_errors: pacingErrors,
        other_errors: otherErrors,
        errors,
        duration_ms: durationMs,
      });
    if (auditError) {
      logStep('Audit insert failed', { error: auditError.message });
    }

    return new Response(
      JSON.stringify({
        success: true,
        alertsCreated,
        alertsUpdated,
        metasProcessadas: metas.length,
        pacingErrors,
        otherErrors,
        durationMs,
        errors: errors.slice(0, 20),
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
