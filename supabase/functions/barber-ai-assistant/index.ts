import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// Função para obter a data de Manaus (GMT-4) como Date
function getManausDate(): Date {
  const now = new Date();
  const manausOffset = -4 * 60; // -4 horas em minutos
  const localOffset = now.getTimezoneOffset();
  return new Date(now.getTime() + (localOffset + manausOffset) * 60000);
}

// Função para formatar data de Manaus como string yyyy-MM-dd
function getManausDateString(): string {
  return formatManausDate(getManausDate());
}

// Função para formatar qualquer data como yyyy-MM-dd (sem usar toISOString que pode rolar para próximo dia)
function formatManausDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DailyInsightRequest {
  type: 'daily_insight';
  barberId: string;
  organizationId: string;
  barberName: string;
  monthlyGoal: number;
  soldToday: number;
  soldThisMonth: number;
  daysRemaining: number;
  dailyTarget: number;
}

interface SalesHelpRequest {
  type: 'sales_help';
  barberId: string;
  organizationId: string;
  scenario: string;
}

type RequestBody = DailyInsightRequest | SalesHelpRequest;

interface DayStats {
  ticketMedio: number;
  totalServicos: number;
  totalProdutos: number;
  mixProdutos: number;
  mixServicos: number;
  servicosVendidos: Record<string, number>;
  produtosVendidos: Record<string, number>;
  clientesAtendidos: number;
  comissaoTotal: number;
  servicosExtras: number;
  servicosBasicos: number;
  ultimoServicoVendido: string | null;
  ultimoProdutoVendido: string | null;
}

interface HistoricalStats {
  topService: { name: string; count: number } | null;
  topProduct: { name: string; count: number } | null;
  forgottenServices: string[];
  forgottenProducts: string[];
  avgTicket30d: number;
  totalClients30d: number;
  totalRevenue30d: number;
  daysWorked: number;
  avgDailyCommission: number;
  productConversionRate: number;
  extrasRatio: number;
  totalProducts: number;
  totalServices: number;
  serviceCount: Record<string, number>;
  productCount: Record<string, number>;
  categoryCount: Record<string, number>;
  dayOfWeekSales: Record<number, number>;
  managerTransactionsCount: number;
  barberTransactionsCount: number;
}

async function fetchHistoricalStats(barberId: string, organizationId: string, supabase: any): Promise<HistoricalStats> {
  // Usar data de Manaus para cálculo correto dos últimos 30 dias
  const today = getManausDate();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = formatManausDate(thirtyDaysAgo);
  const endDate = formatManausDate(today);

  // Buscar transações DECLARADAS PELO BARBEIRO dos últimos 30 dias (source='barber')
  // Isso fornece dados itemizados precisos do que o barbeiro realmente declara vender
  const { data: barberTransactions } = await supabase
    .from("sale_transactions")
    .select("item_type, item_name, price_sold, commission_amount, service_category, created_at")
    .eq("barber_id", barberId)
    .eq("source", "barber")
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`);

  // Também buscar transações do gerente para comparação silenciosa
  const { data: managerTransactions } = await supabase
    .from("sale_transactions")
    .select("item_type, item_name, price_sold, commission_amount, service_category")
    .eq("barber_id", barberId)
    .eq("source", "manager")
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`);

  // Buscar produções dos últimos 30 dias
  const { data: productions } = await supabase
    .from("daily_productions")
    .select("clients_count, commission_earned, date, manual_clients_count")
    .eq("barber_id", barberId)
    .gte("date", startDate)
    .lte("date", endDate);

  // Buscar catálogo de serviços ativos
  const { data: catalogServices } = await supabase
    .from("catalog_services")
    .select("name, category")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  // Buscar catálogo de produtos ativos
  const { data: catalogProducts } = await supabase
    .from("catalog_products")
    .select("name")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  // Contagem de serviços e produtos vendidos pelo barbeiro (dados itemizados)
  const serviceCount: Record<string, number> = {};
  const productCount: Record<string, number> = {};
  const categoryCount: Record<string, number> = {};
  let totalRevenue30d = 0;
  let totalProducts = 0;
  let totalServices = 0;

  if (barberTransactions) {
    for (const tx of barberTransactions) {
      if (tx.item_type === 'service') {
        serviceCount[tx.item_name] = (serviceCount[tx.item_name] || 0) + 1;
        totalServices++;
        // Agrupar por categoria (basico/extra)
        const cat = tx.service_category || 'basico';
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      } else if (tx.item_type === 'product') {
        productCount[tx.item_name] = (productCount[tx.item_name] || 0) + 1;
        totalProducts++;
      }
      totalRevenue30d += tx.price_sold || 0;
    }
  }

  // Análise de padrões - dias da semana com mais vendas
  const dayOfWeekSales: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  if (barberTransactions) {
    for (const tx of barberTransactions) {
      const date = new Date(tx.created_at);
      const dayOfWeek = date.getDay();
      dayOfWeekSales[dayOfWeek] += tx.price_sold || 0;
    }
  }

  // Top serviço vendido
  let topService: { name: string; count: number } | null = null;
  for (const [name, count] of Object.entries(serviceCount)) {
    if (!topService || count > topService.count) {
      topService = { name, count };
    }
  }

  // Top produto vendido
  let topProduct: { name: string; count: number } | null = null;
  for (const [name, count] of Object.entries(productCount)) {
    if (!topProduct || count > topProduct.count) {
      topProduct = { name, count };
    }
  }

  // Serviços esquecidos (no catálogo mas nunca vendidos nos últimos 30 dias)
  const forgottenServices: string[] = [];
  if (catalogServices) {
    for (const service of catalogServices) {
      if (!serviceCount[service.name]) {
        forgottenServices.push(service.name);
      }
    }
  }

  // Produtos esquecidos
  const forgottenProducts: string[] = [];
  if (catalogProducts) {
    for (const product of catalogProducts) {
      if (!productCount[product.name]) {
        forgottenProducts.push(product.name);
      }
    }
  }

  // Estatísticas de produção
  let totalClients30d = 0;
  let totalCommission30d = 0;
  let daysWorked = 0;

  if (productions) {
    for (const prod of productions) {
      const clients = prod.manual_clients_count || prod.clients_count || 0;
      if (clients > 0 || prod.commission_earned > 0) {
        daysWorked++;
        totalClients30d += clients;
        totalCommission30d += prod.commission_earned || 0;
      }
    }
  }

  const avgTicket30d = totalClients30d > 0 ? totalRevenue30d / totalClients30d : 0;
  const avgDailyCommission = daysWorked > 0 ? totalCommission30d / daysWorked : 0;

  // Calcular taxa de conversão de produtos (quantos clientes compram produtos)
  const productConversionRate = totalClients30d > 0 ? (totalProducts / totalClients30d) * 100 : 0;

  // Calcular mix de serviços extras vs básicos
  const extrasCount = categoryCount['extra'] || 0;
  const basicCount = categoryCount['basico'] || 0;
  const extrasRatio = totalServices > 0 ? (extrasCount / totalServices) * 100 : 0;

  return {
    topService,
    topProduct,
    forgottenServices,
    forgottenProducts,
    avgTicket30d,
    totalClients30d,
    totalRevenue30d,
    daysWorked,
    avgDailyCommission,
    productConversionRate,
    extrasRatio,
    totalProducts,
    totalServices,
    serviceCount,
    productCount,
    categoryCount,
    dayOfWeekSales,
    managerTransactionsCount: managerTransactions?.length || 0,
    barberTransactionsCount: barberTransactions?.length || 0,
  };
}

async function fetchDayStats(barberId: string, supabase: any): Promise<DayStats> {
  const today = getManausDateString();
  
  // Buscar produção de hoje
  const { data: production } = await supabase
    .from("daily_productions")
    .select("*")
    .eq("barber_id", barberId)
    .eq("date", today)
    .single();

  // Buscar transações DECLARADAS PELO BARBEIRO de hoje (source='barber')
  // Isso fornece dados itemizados precisos do que o barbeiro declara ter vendido
  const { data: barberTransactions } = await supabase
    .from("sale_transactions")
    .select("item_type, item_name, price_sold, commission_amount, service_category, created_at")
    .eq("barber_id", barberId)
    .eq("source", "barber")
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`)
    .order("created_at", { ascending: false });

  const servicosVendidos: Record<string, number> = {};
  const produtosVendidos: Record<string, number> = {};
  let totalServicos = 0;
  let totalProdutos = 0;
  let servicosExtras = 0;
  let servicosBasicos = 0;
  let ultimoServicoVendido: string | null = null;
  let ultimoProdutoVendido: string | null = null;

  if (barberTransactions && barberTransactions.length > 0) {
    for (const tx of barberTransactions) {
      if (tx.item_type === 'service') {
        servicosVendidos[tx.item_name] = (servicosVendidos[tx.item_name] || 0) + 1;
        totalServicos += tx.price_sold;
        
        // Rastrear categoria do serviço
        if (tx.service_category === 'extra') {
          servicosExtras++;
        } else {
          servicosBasicos++;
        }
        
        // Capturar último serviço vendido
        if (!ultimoServicoVendido) {
          ultimoServicoVendido = tx.item_name;
        }
      } else if (tx.item_type === 'product') {
        produtosVendidos[tx.item_name] = (produtosVendidos[tx.item_name] || 0) + 1;
        totalProdutos += tx.price_sold;
        
        // Capturar último produto vendido
        if (!ultimoProdutoVendido) {
          ultimoProdutoVendido = tx.item_name;
        }
      }
    }
  }

  // Usar clients_count manual se disponível, senão o consolidado
  const clientesAtendidos = production?.manual_clients_count || production?.clients_count || 0;
  const comissaoTotal = production?.commission_earned || 0;
  const totalVendas = totalServicos + totalProdutos;
  const ticketMedio = clientesAtendidos > 0 ? totalVendas / clientesAtendidos : 0;

  return {
    ticketMedio,
    totalServicos,
    totalProdutos,
    mixProdutos: totalVendas > 0 ? (totalProdutos / totalVendas) * 100 : 0,
    mixServicos: totalVendas > 0 ? (totalServicos / totalVendas) * 100 : 0,
    servicosVendidos,
    produtosVendidos,
    clientesAtendidos,
    comissaoTotal,
    servicosExtras,
    servicosBasicos,
    ultimoServicoVendido,
    ultimoProdutoVendido,
  };
}

function buildDayStatsContext(stats: DayStats): string {
  const servicosList = Object.entries(stats.servicosVendidos)
    .map(([name, count]) => `${name}: ${count}x`)
    .join(', ') || 'Nenhum serviço vendido ainda';
  
  const produtosList = Object.entries(stats.produtosVendidos)
    .map(([name, count]) => `${name}: ${count}x`)
    .join(', ') || 'Nenhum produto vendido ainda';

  const totalServicosCount = Object.values(stats.servicosVendidos).reduce((a, b) => a + b, 0);

  return `
## 📊 DADOS REAIS DO DIA - DECLARADOS PELO BARBEIRO (source='barber'):
- Clientes atendidos: ${stats.clientesAtendidos}
- Ticket Médio: R$ ${stats.ticketMedio.toFixed(2)}
- Comissão acumulada: R$ ${stats.comissaoTotal.toFixed(2)}
- Mix: ${stats.mixServicos.toFixed(0)}% Serviços | ${stats.mixProdutos.toFixed(0)}% Produtos
- Serviços Básicos: ${stats.servicosBasicos}x | Serviços Extras: ${stats.servicosExtras}x
- Taxa de Extras: ${totalServicosCount > 0 ? ((stats.servicosExtras / totalServicosCount) * 100).toFixed(0) : 0}%
- Serviços vendidos hoje (ITEMIZADO): ${servicosList}
- Produtos vendidos hoje (ITEMIZADO): ${produtosList}
${stats.ultimoServicoVendido ? `- Último serviço vendido: ${stats.ultimoServicoVendido}` : ''}
${stats.ultimoProdutoVendido ? `- Último produto vendido: ${stats.ultimoProdutoVendido}` : ''}

## 🎯 ANÁLISE INTELIGENTE DO DIA (Aplique estas regras):
${stats.clientesAtendidos > 0 && Object.keys(stats.produtosVendidos).length === 0 
  ? "⚠️ ALERTA: O barbeiro NÃO vendeu nenhum produto hoje. Sugira finalizar o próximo corte com um produto e colocar na mão do cliente." 
  : ""}
${stats.clientesAtendidos >= 3 && stats.mixProdutos < 10 
  ? "⚠️ ALERTA: Mix de produtos muito baixo. Hora de focar em venda de produtos!" 
  : ""}
${totalServicosCount > 3 && !stats.servicosVendidos['Barba'] && !stats.servicosVendidos['Barba SPA'] && !stats.servicosVendidos['Barbaterapia']
  ? "⚠️ ALERTA: Vários cortes mas ZERO barbas. O próximo cliente precisa sair com a barba feita ou pelo menos sobrancelha!" 
  : ""}
${stats.servicosBasicos > 0 && stats.servicosExtras === 0
  ? "⚠️ ALERTA: Nenhum serviço EXTRA vendido hoje. Cada cliente é uma oportunidade de upsell perdida!"
  : ""}
${stats.clientesAtendidos >= 5 && stats.servicosExtras >= stats.clientesAtendidos
  ? "🔥 DESTAQUE: Excelente taxa de extras! Média de 1+ extra por cliente. Mantenha o ritmo!"
  : ""}
`;
}

function buildHistoricalContext(stats: HistoricalStats, dayStats: DayStats): string {
  const forgottenServicesList = stats.forgottenServices.length > 0 
    ? stats.forgottenServices.slice(0, 5).join(', ')
    : 'Nenhum (parabéns, vendeu de tudo!)';

  const forgottenProductsList = stats.forgottenProducts.length > 0 
    ? stats.forgottenProducts.slice(0, 3).join(', ')
    : 'Nenhum (está vendendo toda a linha!)';
  
  const ticketComparison = dayStats.ticketMedio > 0 && stats.avgTicket30d > 0
    ? ((dayStats.ticketMedio / stats.avgTicket30d) * 100 - 100).toFixed(0)
    : "0";
  
  const ticketStatus = Number(ticketComparison) >= 0 
    ? `✅ Hoje está ${ticketComparison}% ACIMA da média histórica` 
    : `⚠️ Hoje está ${Math.abs(Number(ticketComparison))}% ABAIXO da média histórica`;

  // Analisar dias da semana com melhor performance
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let bestDay = 0;
  let bestDaySales = 0;
  for (const [day, sales] of Object.entries(stats.dayOfWeekSales)) {
    if (sales > bestDaySales) {
      bestDaySales = sales;
      bestDay = Number(day);
    }
  }

  // Top 3 serviços vendidos
  const topServices = Object.entries(stats.serviceCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name}: ${count}x`)
    .join(', ') || 'Sem dados';

  // Top 3 produtos vendidos
  const topProducts = Object.entries(stats.productCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name}: ${count}x`)
    .join(', ') || 'Sem dados';

  return `
## 📈 HISTÓRICO DOS ÚLTIMOS 30 DIAS - DADOS ITEMIZADOS (source='barber'):

### Performance Geral:
- Dias trabalhados: ${stats.daysWorked}
- Total de clientes: ${stats.totalClients30d}
- Faturamento total declarado: R$ ${stats.totalRevenue30d.toFixed(2)}
- Ticket Médio (30d): R$ ${stats.avgTicket30d.toFixed(2)}
- Comissão média diária: R$ ${stats.avgDailyCommission.toFixed(2)}
- Total de transações declaradas: ${stats.barberTransactionsCount}

### Análise de Vendas Itemizadas:
- Total serviços vendidos (30d): ${stats.totalServices}
- Total produtos vendidos (30d): ${stats.totalProducts}
- Taxa conversão produtos: ${stats.productConversionRate.toFixed(1)}% dos clientes compram produto
- Taxa de serviços extras: ${stats.extrasRatio.toFixed(1)}% dos serviços são extras

### TOP 3 Serviços Mais Vendidos (30d):
📊 ${topServices}

### TOP 3 Produtos Mais Vendidos (30d):
🛒 ${topProducts}

### Análise Comparativa de Hoje vs Histórico:
- Ticket Médio Hoje: R$ ${dayStats.ticketMedio.toFixed(2)}
- ${ticketStatus}

### Especialidade do Barbeiro:
${stats.topService 
  ? `🏆 TOP SERVIÇO: "${stats.topService.name}" - vendeu ${stats.topService.count}x em 30 dias`
  : '❓ Sem dados suficientes de vendas ainda'}
${stats.topProduct 
  ? `🏆 TOP PRODUTO: "${stats.topProduct.name}" - vendeu ${stats.topProduct.count}x em 30 dias`
  : ''}

### Padrões de Vendas:
📅 Melhor dia da semana: ${dayNames[bestDay]} (R$ ${bestDaySales.toFixed(2)} em vendas)

### Serviços Esquecidos (ZERO vendas em 30 dias):
🚨 ${forgottenServicesList}

### Produtos Esquecidos (ZERO vendas em 30 dias):
🛍️ ${forgottenProductsList}

---

## 🧠 INSTRUÇÕES PARA O MENTOR (Use os dados itemizados para ser CIRÚRGICO):

1. **SE taxa de conversão de produtos estiver abaixo de 30%**: Foque em upsell de produtos.
   - Exemplo: "Apenas ${stats.productConversionRate.toFixed(0)}% dos seus clientes compram produto. A meta é 50%+. O próximo cliente SAI com uma pomada na mão!"

2. **SE tiver "Serviço Esquecido"**: Pergunte o motivo e DESAFIE a quebrar o jejum.
   - Exemplo: "Faz 30 dias que você não vende ${stats.forgottenServices[0] || 'Alinhamento'}. O que aconteceu? Hoje é dia de quebrar esse jejum!"

3. **SE tiver "Produto Esquecido"**: Sugira oferecer no próximo atendimento.
   - Exemplo: "Você não vendeu ${stats.forgottenProducts[0] || 'Balm'} há 30 dias. O próximo cliente barbudo é uma venda garantida!"

4. **SE ticket de hoje estiver ABAIXO da média histórica**: Cobre consistência.
   - Exemplo: "Você costuma fazer R$ ${stats.avgTicket30d.toFixed(2)} de média, hoje está em R$ ${dayStats.ticketMedio.toFixed(2)}. O que houve? Precisamos de um upsell no próximo cliente."

5. **USE o Top Serviço/Produto como âncora de elogio antes de desafiar**:
   - Exemplo: "Eu sei que você é o rei do ${stats.topService?.name || 'Corte'} (${stats.topService?.count || 0}x esse mês!), mas precisamos equilibrar o mix. Foco em ${stats.forgottenServices[0] || 'serviços extras'} hoje."

6. **SE estiver performando ACIMA da média**: Celebre e desafie a manter.
   - Exemplo: "Você está ON FIRE! Acima da sua média histórica. Vamos manter esse ritmo até o fechamento!"

7. **USE o padrão do dia da semana se aplicável**:
   - Exemplo: "Hoje é ${dayNames[new Date().getDay()]} e você costuma bombar em ${dayNames[bestDay]}. Bora igualar o recorde!"
`;
}

async function logUsage(barberId: string, organizationId: string, usageType: string, scenario?: string) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase credentials for logging");
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    await supabase.from("ai_assistant_usage").insert({
      barber_id: barberId,
      organization_id: organizationId,
      usage_type: usageType,
      scenario: scenario || null,
    });
  } catch (error) {
    console.error("Error logging AI usage:", error);
  }
}

const TECHNICAL_KNOWLEDGE = `
## 📚 CONHECIMENTO TÉCNICO E CONFLITOS DE SERVIÇOS

### Entenda os Serviços para NÃO errar:

**Barba SPA / Barbaterapia:**
- JÁ INCLUI: toalha quente, hidratação e leve esfoliação
- ❌ NUNCA sugira 'Esfoliação' ou 'Hidratação Simples' se o cliente já vai fazer Barba SPA (seria redundante!)
- ✅ UPSELL CORRETO: 'Limpeza Facial Profunda' (mais completa) ou 'Sobrancelha'

**Limpeza de Pele:**
- É um procedimento PROFUNDO de extração de cravos
- DIFERENÇA: Trata a pele do rosto TODO, diferente da Barba SPA que trata o pelo
- ✅ PODE ser vendido junto com Barba SPA (são complementares, não redundantes)

**Alinhamento de Fios:**
- Química para reduzir volume/frizz
- ✅ COMBINA COM: Corte e Barba
- ❌ NÃO COMBINA COM: Relaxamento (são químicas concorrentes que podem danificar o fio)

**Acabamento/Pezinho:**
- É APENAS o contorno da nuca/lateral
- ✅ UPSELL: Tente converter para 'Corte Completo' ou ofereça 'Sobrancelha'
- Argumento: 'Só o pezinho? Aproveita que tá aqui e faz o corte completo, vai ficar muito mais alinhado.'

**Hidratação / Terapia Capilar:**
- Tratamento para cabelos secos ou danificados
- ✅ COMBINA COM: Corte (aplicar depois)
- ❌ EVITE sugerir junto com Alinhamento/Progressiva no mesmo dia (sobrecarga química)

### Regra de Ouro para Upsell:
1. Sempre analise o que o cliente JÁ está fazendo
2. Sugira serviços COMPLEMENTARES, nunca redundantes
3. Se for químico (Alinhamento, Relaxamento, Progressiva), NÃO sugira outro químico
`;

const BASE_SYSTEM_PROMPT = `Você é um Mestre da Persuasão e Barbeiro Consultor de elite. Seu público são homens de alto nível (Executivos, Advogados, Médicos, Empresários).

MENTALIDADE: Você NÃO vende produtos. Você vende STATUS, CONFIANÇA e SOLUÇÃO DE DORES.

SEU TOM DE VOZ: 'Técnico-Parceiro'. Intimidade e respeito, com autoridade técnica absoluta. Não sugira, PRESCREVA. O barbeiro é o MÉDICO da imagem.

PROIBIDO: Gírias de rua exageradas ('Mano', 'Parça', 'Tmj') ou linguagem robótica ('Prezado senhor', 'Compreendo').
IDEAL: 'Campeão', 'Doutor', 'Meu amigo', 'Cara', 'Irmão'. Use perguntas para conduzir.

---

## 🎯 ESTRATÉGIA DE CAMPANHA (DESAFIO 12 DIAS)

### A NOVA MENTALIDADE (Foco em Extras)
- O dinheiro de VERDADE está nos ADICIONAIS
- Regra de Ouro: 'Todo cliente tem diagnóstico. Você INDICA, não pergunta.'
- Meta Padrão: Mínimo 1 extra por cliente. Ideal 2.

### BASE DE DADOS DE COMISSÃO (Referência Mental)
Use estes valores como exemplo de persuasão:
- 'Quer colocar R$ 54 no bolso agora? Venda um Alinhamento.'
- 'Precisa de R$ 36 rápido? É uma Barba SPA.'
- 'O combo invisível (Limpeza + Barba SPA) te dá R$ 72 de comissão num único cliente.'

### ROLETAS DE MISSÕES DIÁRIAS
Quando o barbeiro pedir ajuda ou estiver abaixo da meta, sugira uma destas missões:

1. **Missão 'Pele em Foco'**: Focar 100% em Limpeza Facial e Esfoliação
   - Argumento: 'A pele do cliente tá oleosa, é venda fácil.'

2. **Missão 'Dia do Alinhamento'**: O ticket mais alto
   - Argumento: 'Se o cabelo tá volumoso ou com frizz, você tá perdendo R$ 54 se não oferecer Alinhamento.'

3. **Missão 'Saúde Capilar'**: Foco em Terapia e Hidratação
   - Argumento: 'Cabelo seco ou quebradiço? Prescreva o tratamento como médico.'

4. **Missão 'Combo Invisível'**: Vender dois serviços pequenos que somam comissão alta
   - Argumento: 'Limpeza + Barba SPA = R$ 72 de comissão num único cliente.'

---

${TECHNICAL_KNOWLEDGE}

---

TÉCNICAS DE PNL OBRIGATÓRIAS:
- Ancoragem: Compare preços com algo trivial (café, uber).
- Future Pacing (Ponte ao Futuro): Faça imaginar o resultado positivo OU a dor contínua se não comprar.
- Autoridade: Prescreva como um médico, não como vendedor.

ARSENAL DE VENDAS COM GATILHOS MENTAIS:

🧴 Minoxidil (Gatilho: DOR e AUTOESTIMA)
- Homens odeiam sentir-se "menos homens" por falhas
- Toque na ferida da 'falha' sutilmente e ofereça a 'plenitude'
- Exemplo: 'Doutor, o corte tá perfeito, mas essa falha na conexão do bigode tá quebrando a harmonia do seu rosto. O Minoxidil preenche isso em 40 dias. Imagina essa barba fechada na régua? É outra presença.'

☁️ Pomada em Pó (Gatilho: EXCLUSIVIDADE e SENSORIAL)
- Cliente odeia parecer sujo/oleoso. Quer parecer natural (Old Money)
- Use palavras: 'Textura', 'Matte', 'Invisível'
- Exemplo: 'Cara, pro seu fio que é fino, gel é crime. Mata o volume. O segredo dos artistas é essa Pomada em Pó. Ela dá volume, zero oleosidade e parece que você acordou arrumado.'

🧔 Balm (Gatilho: PROVA SOCIAL e RELACIONAMENTO)
- A barba arranha a parceira. A dor não é dele, é de quem ele beija
- Use a 'esposa/namorada' como alavanca
- Exemplo: 'Irmão, tua barba tá lenhador, mas tá espetando. Se a patroa reclamar que tá arranhando, a culpa é da falta de hidratação. O Balm amacia o fio na hora e o cheiro é elite.'

🏆 Assinatura/Clube (Gatilho: AVERSÃO À PERDA e STATUS)
- Não é sobre economizar, é sobre NUNCA estar feio
- Foque na 'Agenda' e na 'Imagem Impecável'
- Exemplo: 'Doutor, um cara da sua posição não pode ter "dia ruim" de cabelo. Na Assinatura, você não paga por visita. Você vem toda sexta, faz o ritual completo e tá sempre pronto pra qualquer reunião. É blindagem de imagem.'

💸 Objeção de Preço (Gatilho: REFRAMING/RESSIGNIFICAÇÃO)
- NUNCA justifique o preço. Diminua o valor percebido comparando com tempo de uso
- Exemplo: 'Esse pote dura 45 dias. Dá menos de 1 real por dia. É menos que o cafezinho que você toma na padaria pra garantir que seu visual fique alinhado o dia todo.'

REGRAS:
- Máximo de 3 frases
- Use emojis com moderação (máx 1)
- Seja direto e estratégico
- Trate o barbeiro pelo nome
- Formato de CONVERSA (falada), pronto para o barbeiro ler ao cliente`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: RequestBody = await req.json();
    let systemPrompt = BASE_SYSTEM_PROMPT;
    let userPrompt = "";

    // Buscar estatísticas do dia para contextualizar a IA
    const dayStats = await fetchDayStats(body.barberId, supabase);
    const dayStatsContext = buildDayStatsContext(dayStats);

    // Buscar estatísticas históricas dos últimos 30 dias
    const historicalStats = await fetchHistoricalStats(body.barberId, body.organizationId, supabase);
    const historicalContext = buildHistoricalContext(historicalStats, dayStats);

    if (body.type === 'daily_insight') {
      const { barberId, organizationId, barberName, monthlyGoal, soldToday, soldThisMonth, daysRemaining, dailyTarget } = body;
      
      // Log usage
      await logUsage(barberId, organizationId, 'daily_insight');
      
      const percentageAchieved = monthlyGoal > 0 ? ((soldThisMonth / monthlyGoal) * 100).toFixed(1) : 0;
      const remaining = Math.max(0, monthlyGoal - soldThisMonth);
      
      userPrompt = `${dayStatsContext}

${historicalContext}

Analise os números do barbeiro ${barberName}:
- Meta do mês: R$ ${monthlyGoal.toFixed(2)}
- Vendido hoje: R$ ${soldToday.toFixed(2)}
- Vendido no mês: R$ ${soldThisMonth.toFixed(2)} (${percentageAchieved}% da meta)
- Falta vender: R$ ${remaining.toFixed(2)}
- Dias restantes: ${daysRemaining}
- Meta diária recomendada: R$ ${dailyTarget.toFixed(2)}

Gere uma mensagem motivacional curta e estratégica usando as técnicas de PNL. 
IMPORTANTE: 
- Use os DADOS REAIS DO DIA E O HISTÓRICO DE 30 DIAS para personalizar a dica
- Se houver alertas (⚠️), incorpore-os na resposta
- Siga as INSTRUÇÕES PARA O MENTOR baseadas no histórico
- Se precisar recuperar vendas, sugira usar o Arsenal com os Gatilhos Mentais apropriados
- Demonstre que você CONHECE a carreira do barbeiro, não apenas o dia de hoje`;

    } else if (body.type === 'sales_help') {
      const { barberId, organizationId, scenario } = body;
      
      // Log usage
      await logUsage(barberId, organizationId, 'sales_help', scenario);
      
      const scenarioPrompts: Record<string, string> = {
        'cliente_achou_caro': `O cliente achou o serviço/produto caro. Use o Gatilho de REFRAMING: Nunca justifique o preço. Diminua o valor percebido comparando com o tempo de uso diário. Script base: 'Pensa comigo: Esse pote dura 45 dias. Dá menos de 1 real por dia. É menos que o cafezinho que você toma na padaria. O que vale mais: um café ou sua imagem?'`,
        'oferecer_pomada': `O barbeiro quer oferecer pomada/cera. Use o Gatilho de EXCLUSIVIDADE e SENSORIAL. Se cabelo oleoso/fino, prescreva a Pomada em Pó. Use palavras: 'Textura', 'Matte', 'Invisível', 'Old Money'. Script base: 'Cara, pro seu fio que é fino, gel é crime. Mata o volume. O segredo dos artistas é essa Pomada em Pó. Ela dá volume, zero oleosidade e parece que você acordou arrumado.'`,
        'mudanca_visual': `O barbeiro quer sugerir mudança de visual. Use Future Pacing: faça o cliente IMAGINAR como vai ficar. Use Autoridade: prescreva como médico da imagem. 'Doutor, com esse formato de rosto, um degradê mais alto vai alongar o visual. Imagina você entrando na reunião com essa presença? Vamos testar?'`,
        'cliente_caspa': `O barbeiro notou caspa/couro sensível. Use Gatilho de DOR discretamente. Toque na ferida sem constranger: 'Meu amigo, reparei que o couro tá pedindo socorro. Isso aqui é fácil de resolver. O tratamento que tenho é igual de dermatologista, mas cabe no bolso. Quer que eu aplique hoje pra você sentir a diferença?'`,
        'servico_extra': `Oferecer serviço extra (hidratação, sobrancelha, pigmentação). Use Gatilho de STATUS e Future Pacing. IMPORTANTE: Verifique nos dados do dia quais serviços já foram feitos para NÃO sugerir algo redundante. 'Doutor, o corte tá afiado, mas a sobrancelha tá roubando a cena. Um alinhamento aqui e o olhar fica outro. Os caras de sucesso sabem que o detalhe faz a diferença. Faço em 5 minutos.'`,
        'fidelizacao': `Cliente satisfeito pagando. Ofereça ASSINATURA com Gatilho de AVERSÃO À PERDA e STATUS: 'Doutor, um cara da sua posição não pode ter "dia ruim" de cabelo. Na Assinatura, você não paga por visita. Você vem toda sexta, faz o ritual completo e tá sempre pronto pra qualquer reunião. É blindagem de imagem. Vamos migrar hoje?'`,
      };

      userPrompt = `${dayStatsContext}

${historicalContext}

${scenarioPrompts[scenario] || `Cenário: ${scenario}. Gere um script de vendas persuasivo usando as técnicas de PNL e Gatilhos Mentais apropriados para esta situação.`}

IMPORTANTE: 
- Use os DADOS REAIS DO DIA E O HISTÓRICO para personalizar a resposta
- Se houver alertas (⚠️), priorize resolver esses gaps
- Se o barbeiro tem "Serviços Esquecidos", considere sugerir um deles se for apropriado ao cenário
- Verifique o CONHECIMENTO TÉCNICO para não sugerir serviços redundantes ou conflitantes
- Máximo de 3 frases que o barbeiro pode falar diretamente ao cliente`;

    } else {
      throw new Error("Tipo de requisição inválido");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 350,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Entre em contato com o suporte." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro ao processar requisição de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const aiMessage = data.choices?.[0]?.message?.content || "Não foi possível gerar uma resposta.";

    return new Response(JSON.stringify({ message: aiMessage, type: body.type, stats: dayStats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("barber-ai-assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
