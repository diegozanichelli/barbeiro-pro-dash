# Configuração do Sistema de Alertas de Performance

## ✅ O que já está configurado

1. **Tabela de Banco de Dados** (`performance_alerts`) - Criada e funcionando
2. **Edge Function** (`check-performance-alerts`) - Deployada automaticamente
3. **Interface do Gestor** - Card de alertas na aba "Visão Geral"

## 🔧 Próximo Passo: Agendar a Verificação Automática

Para que o sistema verifique automaticamente os alertas **todas as noites às 01:00 AM**, você precisa configurar um cron job no banco de dados.

### Como configurar:

1. **Acesse o Backend do projeto** (Cloud → Database)

2. **Execute o seguinte SQL** na aba de queries:

```sql
-- Agendar a função para rodar todos os dias às 01:00 AM (horário de Brasília = UTC-3)
-- Ajustamos para 04:00 UTC que equivale a 01:00 AM no Brasil
SELECT cron.schedule(
  'check-performance-alerts-daily',
  '0 4 * * *', -- Todo dia às 04:00 UTC (01:00 AM Brasília)
  $$
  SELECT
    net.http_post(
      url:='https://pcszguaqnodzshekldgw.supabase.co/functions/v1/check-performance-alerts',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjc3pndWFxbm9kenNoZWtsZGd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MTg0MzcsImV4cCI6MjA3NjI5NDQzN30.W8_AwrQYRDe8zSOsBxr44GXQ9jlrXDYYnT0q5hjmGew"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
```

3. **Para testar manualmente** (antes de agendar), execute:

```sql
-- Executar a verificação imediatamente
SELECT
  net.http_post(
    url:='https://pcszguaqnodzshekldgw.supabase.co/functions/v1/check-performance-alerts',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjc3pndWFxbm9kenNoZWtsZGd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MTg0MzcsImV4cCI6MjA3NjI5NDQzN30.W8_AwrQYRDe8zSOsBxr44GXQ9jlrXDYYnT0q5hjmGew"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
```

### Verificar se o cron está funcionando:

```sql
-- Listar todos os cron jobs configurados
SELECT * FROM cron.job;

-- Ver histórico de execuções
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'check-performance-alerts-daily')
ORDER BY start_time DESC
LIMIT 10;
```

### Desabilitar o cron job (se necessário):

```sql
-- Remover o agendamento
SELECT cron.unschedule('check-performance-alerts-daily');
```

## 🎯 Como Funciona

### Lógica do Alerta (Pacing Check):

1. **Para cada barbeiro com meta cadastrada no mês atual:**
   - Calcula a comissão acumulada até hoje
   - Calcula a meta esperada até hoje: `(Dia Atual / Dias Úteis Configurados) × Meta Total`
   - Compara com threshold de 85% da meta esperada

2. **Tipos de Alerta:**
   - 🔴 **Meta Impossível**: Menos de 5 dias restantes E menos de 70% atingido
   - 🟡 **Abaixo do Ritmo**: Menos de 60% da meta esperada atingido
   - 🟠 **Risco Moderado**: Entre 60-85% da meta esperada

3. **O sistema automaticamente:**
   - Cria novos alertas quando detecta problemas
   - Atualiza alertas existentes com novos valores
   - Resolve alertas quando o barbeiro volta ao ritmo

## 📊 Visualização no Painel

Os gerentes verão um card na aba **"Visão Geral"** com:
- Badge vermelho mostrando o número de alertas ativos
- Lista detalhada de cada barbeiro em risco
- Informações: deficit em R$, % atingido, dias restantes
- Botões para "Resolver" ou "Ignorar" cada alerta

## 🔍 Monitoramento

Para ver os logs da edge function:
- Acesse: Cloud → Edge Functions → check-performance-alerts
- Clique em "Logs" para ver o histórico de execuções

## ⏰ Horários de Execução

- **Recomendado**: 01:00 AM (durante a madrugada)
- **Formato Cron**: `0 4 * * *` (04:00 UTC = 01:00 AM Brasília)
- **Frequência**: Diária

### Ajustar Horário (opcional):

```
Minuto Hora Dia Mês DiaDaSemana
  0     4    *   *      *        = 01:00 AM todos os dias

Exemplos:
0 12 * * * = Meio-dia
0 18 * * * = 18:00 (6 PM)
0 0 * * *  = Meia-noite
```

## 🚨 Troubleshooting

Se os alertas não estiverem aparecendo:

1. Verifique se há metas cadastradas para o mês atual
2. Verifique se há produções lançadas pelos barbeiros
3. Confira os logs da edge function
4. Execute o teste manual para ver se há erros
5. Verifique se o cron job está ativo: `SELECT * FROM cron.job;`
