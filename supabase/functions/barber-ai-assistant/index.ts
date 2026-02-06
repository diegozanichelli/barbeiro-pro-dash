import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// ============================================
// UTILIDADES DE DATA (MANAUS GMT-4)
// ============================================

function getManausDate(): Date {
  const now = new Date();
  const manausOffset = -4 * 60;
  const localOffset = now.getTimezoneOffset();
  return new Date(now.getTime() + (localOffset + manausOffset) * 60000);
}

function getManausDateString(): string {
  return formatManausDate(getManausDate());
}

function formatManausDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================
// CORS
// ============================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TIPOS
// ============================================

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
  forceRefresh?: boolean;
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

interface RecentDay {
  date: string;
  commission_earned: number;
  clients_count: number;
}

interface TrendAnalysis {
  recentDays: RecentDay[];
  todayCommission: number;
  dailyGoal: number;
  avgDailyCommission: number;
  // Análise de tendência
  isBelowAverage: boolean;       // Hoje < 70% da meta/média
  isConsecutiveLows: boolean;    // 3 dias seguidos abaixo da meta
  isConsecutiveHighs: boolean;   // 3 dias seguidos acima da meta
  streakType: 'high' | 'low' | 'neutral';
  streakDays: number;
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

// ============================================
// MOTOR DE REGRAS - TEMPLATES (TOM: FECHAMENTO DE DIA)
// ============================================

const TEMPLATES = {
  // 1. Meta Batida (prioridade máxima - celebração!)
  goal_achieved: (name: string, sold: number, goal: number): string => {
    const percentage = ((sold / goal) * 100).toFixed(0);
    return `Monstro Sagrado, ${name}! 🏆

🟢 Faturamento: R$ ${sold.toFixed(2)} | 🎯 Meta: R$ ${goal.toFixed(2)} (${percentage}%)

> "O que vier agora é lucro puro. Amanhã, tente bater seu recorde pessoal!"

Descanse hoje, você mereceu. Amanhã é dia de fazer história! 🚀`;
  },

  // 2. Zero Produtos (com >= 2 clientes)
  zero_products: (name: string, clients: number): string => {
    return `Fala ${name}! O corte estava ótimo, mas zerar produtos é deixar dinheiro na mesa.

⚠️ 0 produtos vendidos hoje com ${clients} clientes.

> "Amanhã, o primeiro cliente já sai com um produto na mão. Pomada, Balm ou Shampoo - não importa, mas alguém leva!"

Organize sua vitrine antes de ir embora. Amanhã é dia de virar esse jogo! 💈`;
  },

  // 3. Ticket Baixo (< R$ 50)
  low_ticket: (name: string, ticket: number): string => {
    return `Alerta Vermelho, ${name}! Seu ticket ficou baixo hoje.

📉 Ticket Médio: R$ ${ticket.toFixed(2)} (Meta: R$ 50+)
⚠️ Você vendeu apenas o básico.

> "Amanhã, foque em oferecer Barba ou Sobrancelha para CADA cliente. O visual completo tem outro impacto - e outra comissão."

Estratégia nova para amanhã: todo cliente é oportunidade de combo! 💰`;
  },

  // 4. Sem Extras (com >= 2 clientes)
  no_extras: (name: string, clients: number): string => {
    return `Fala ${name}!

⚠️ ${clients} clientes atendidos hoje mas ZERO serviços extras.
📉 É dinheiro que ficou na mesa!

> "Amanhã, para cada corte, já tenha na ponta da língua: 'Vamos alinhar a sobrancelha? Fecha o visual em 3 minutos.'"

Prepare seu script antes de dormir. Amanhã é dia de extras! 🎯`;
  },

  // 5. Dia Fantasma (Zero atendimentos)
  ghost_day: (name: string): string => {
    return `Dia zerado ou esqueceu de lançar? 🤔

⚠️ Nenhum atendimento registrado hoje.

> "Se você trabalhou hoje, corra e lance agora para não perder a contagem! Se foi dia de folga ou movimento fraco, amanhã é dia de recuperar. Mande mensagem para 3 clientes antigos agora à noite."

Organize a agenda de amanhã! 📅`;
  },

  // 6. Ticket de Elite (Ticket alto > R$ 70)
  elite_ticket: (name: string, ticket: number): string => {
    return `Você deu aula de valor hoje, ${name}! 🎩

💎 Ticket Médio: R$ ${ticket.toFixed(2)}
✅ Você trabalhou com inteligência, não com quantidade.

> "Hoje você provou que qualidade vence quantidade. Seu desafio para amanhã: manter esse padrão e tentar vender um produto para fechar o ciclo completo."

Descanse, você mereceu. 😎`;
  },

  // 7. Sniper (90-99% da meta mensal)
  sniper: (name: string, remaining: number, sold: number, goal: number): string => {
    const percentage = ((sold / goal) * 100).toFixed(0);
    return `Na trave! Falta muito pouco. ⚽

🤏 Faltam só R$ ${remaining.toFixed(2)} para bater a meta do mês!
📊 Você está em ${percentage}% da meta.

> "Amanhã é o dia da vitória. Já chegue na barbearia focado em vender aquele combo completo para o primeiro cliente do dia."

Amanhã essa meta cai! 🎯`;
  },

  // 8. Modo Fábrica (Muitos clientes, ticket baixo)
  factory_mode: (name: string, clients: number, ticket: number): string => {
    return `Você suou muito, mas lucrou menos do que podia, ${name}. 📉

🏃‍♂️ ${clients} clientes atendidos hoje
💸 Ticket baixo: R$ ${ticket.toFixed(2)}

> "Você correu uma maratona hoje. Amanhã, desacelere. Tente atender um cliente a menos, mas gaste mais tempo oferecendo Barba ou Sobrancelha. Trabalhe melhor, não mais."

Estratégia nova para amanhã: qualidade sobre quantidade! 🧠`;
  },

  // 9. Rei dos Produtos (Alta conversão de produtos)
  product_king: (name: string, products: number, clients: number): string => {
    const conversionRate = ((products / clients) * 100).toFixed(0);
    return `O Rei do Home Care! 🛍️

🔥 Você vendeu produto para ${conversionRate}% dos seus clientes hoje!
📦 ${products} produtos vendidos para ${clients} clientes.

> "Excelente fechamento. O cliente que leva produto volta mais fiel. Amanhã, tente ensinar essa técnica para um colega que está com dificuldade."

Mantenha esse ritmo a semana toda! 👑`;
  },

  // 10. High Performer (3 dias consecutivos acima da meta)
  high_performer: (name: string, streakDays: number): string => {
    return `Você está "on fire", ${name}! 🔥🔥🔥

🚀 ${streakDays} dias seguidos de meta batida!
🏆 Consistência de campeão.

> "Você encontrou o ritmo perfeito. Não mude nada. Continue focado no atendimento e a meta do mês virá antes do esperado."

Você é a referência da semana! ⭐`;
  },

  // 11. Alerta de Tendência (3 dias consecutivos abaixo da meta)
  consecutive_lows: (name: string, streakDays: number): string => {
    return `Luz Amarela acesa, ${name}! ⚠️

📉 ${streakDays} dias seguidos abaixo da meta.
🚨 A produção vem caindo. Precisamos quebrar esse ciclo.

> "Vamos estancar esse sangramento. Esqueça a meta do mês por enquanto. Seu foco para amanhã é um só: GANHAR O DIA. Faça o básico bem feito e garanta a meta diária."

Quebre esse ciclo amanhã a todo custo! 💪`;
  },

  // 12. Dia Off (Hoje abaixo de 70% da média/meta)
  day_off: (name: string, todayValue: number, expectedValue: number): string => {
    const percentage = ((todayValue / expectedValue) * 100).toFixed(0);
    return `Hoje o ritmo foi mais lento, ${name}. 🐢

📉 Faturamento de R$ ${todayValue.toFixed(2)} (${percentage}% do esperado)
⚠️ Ficou bem abaixo do seu potencial.

> "Todo atleta tem dias ruins. O segredo é não deixar isso virar rotina. Amanhã, chegue 10 minutos mais cedo, organize sua bancada e comece o dia atacando."

Cabeça erguida. Amanhã recuperamos isso! 💪`;
  },
};

function checkRulesEngine(
  dayStats: DayStats,
  barberName: string,
  monthlyGoal: number,
  soldThisMonth: number,
  trend?: TrendAnalysis
): { message: string; scenario: string } | null {
  const productsCount = Object.keys(dayStats.produtosVendidos).length > 0 
    ? Object.values(dayStats.produtosVendidos).reduce((a, b) => a + b, 0) 
    : 0;

  // ========================================
  // PRIORIDADE 1: META MENSAL BATIDA
  // ========================================
  if (monthlyGoal > 0 && soldThisMonth >= monthlyGoal) {
    return {
      message: TEMPLATES.goal_achieved(barberName, soldThisMonth, monthlyGoal),
      scenario: "goal_achieved",
    };
  }

  // ========================================
  // PRIORIDADE 2: TENDÊNCIAS (Se tiver histórico)
  // ========================================
  if (trend) {
    // 2a. High Performer (3+ dias consecutivos acima da meta)
    if (trend.isConsecutiveHighs && trend.streakDays >= 3) {
      return {
        message: TEMPLATES.high_performer(barberName, trend.streakDays),
        scenario: "high_performer",
      };
    }

    // 2b. Alerta Crítico (3+ dias consecutivos abaixo da meta)
    if (trend.isConsecutiveLows && trend.streakDays >= 3) {
      return {
        message: TEMPLATES.consecutive_lows(barberName, trend.streakDays),
        scenario: "consecutive_lows",
      };
    }

    // 2c. Dia Off (Hoje < 70% da meta/média esperada)
    if (trend.isBelowAverage && dayStats.clientesAtendidos > 0) {
      const expectedValue = trend.dailyGoal > 0 ? trend.dailyGoal : trend.avgDailyCommission;
      if (expectedValue > 0) {
        return {
          message: TEMPLATES.day_off(barberName, trend.todayCommission, expectedValue),
          scenario: "day_off",
        };
      }
    }
  }

  // ========================================
  // PRIORIDADE 3: SNIPER (90-99% da meta mensal)
  // ========================================
  if (monthlyGoal > 0) {
    const percentage = (soldThisMonth / monthlyGoal) * 100;
    const remaining = monthlyGoal - soldThisMonth;
    if (percentage >= 90 && percentage < 100) {
      return {
        message: TEMPLATES.sniper(barberName, remaining, soldThisMonth, monthlyGoal),
        scenario: "sniper",
      };
    }
  }

  // ========================================
  // PRIORIDADE 4: SITUAÇÕES DO DIA
  // ========================================

  // 4a. Dia Fantasma (Zero atendimentos)
  if (dayStats.clientesAtendidos === 0) {
    return {
      message: TEMPLATES.ghost_day(barberName),
      scenario: "ghost_day",
    };
  }

  // 4b. Rei dos Produtos (conversão >= 50%)
  if (dayStats.clientesAtendidos >= 2 && productsCount >= dayStats.clientesAtendidos * 0.5) {
    return {
      message: TEMPLATES.product_king(barberName, productsCount, dayStats.clientesAtendidos),
      scenario: "product_king",
    };
  }

  // 4c. Ticket de Elite (> R$ 70)
  if (dayStats.ticketMedio > 70 && dayStats.clientesAtendidos >= 2) {
    return {
      message: TEMPLATES.elite_ticket(barberName, dayStats.ticketMedio),
      scenario: "elite_ticket",
    };
  }

  // 4d. Modo Fábrica (>= 6 clientes E ticket < R$ 40)
  if (dayStats.clientesAtendidos >= 6 && dayStats.ticketMedio < 40) {
    return {
      message: TEMPLATES.factory_mode(barberName, dayStats.clientesAtendidos, dayStats.ticketMedio),
      scenario: "factory_mode",
    };
  }

  // 4e. Zero Produtos (com >= 2 clientes)
  if (productsCount === 0 && dayStats.clientesAtendidos >= 2) {
    return {
      message: TEMPLATES.zero_products(barberName, dayStats.clientesAtendidos),
      scenario: "zero_products",
    };
  }

  // 4f. Ticket Baixo (< R$ 50 com > 0 clientes)
  if (dayStats.ticketMedio > 0 && dayStats.ticketMedio < 50 && dayStats.clientesAtendidos > 0) {
    return {
      message: TEMPLATES.low_ticket(barberName, dayStats.ticketMedio),
      scenario: "low_ticket",
    };
  }

  // 4g. Sem Extras (com >= 2 clientes)
  if (dayStats.servicosExtras === 0 && dayStats.clientesAtendidos >= 2) {
    return {
      message: TEMPLATES.no_extras(barberName, dayStats.clientesAtendidos),
      scenario: "no_extras",
    };
  }

  // Nenhuma regra ativada - fallback para IA
  return null;
}

// ============================================
// ANÁLISE DE TENDÊNCIA (Últimos 3 dias)
// ============================================

async function fetchTrendAnalysis(
  barberId: string,
  dailyGoal: number,
  supabase: any
): Promise<TrendAnalysis> {
  const today = getManausDate();
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Buscar últimos 4 dias (inclui hoje)
  const { data: recentProductions } = await supabase
    .from("daily_productions")
    .select("date, commission_earned, clients_count, manual_clients_count")
    .eq("barber_id", barberId)
    .gte("date", formatManausDate(threeDaysAgo))
    .lte("date", formatManausDate(today))
    .order("date", { ascending: false });

  const recentDays: RecentDay[] = (recentProductions || []).map((p: any) => ({
    date: p.date,
    commission_earned: p.commission_earned || 0,
    clients_count: p.manual_clients_count || p.clients_count || 0,
  }));

  // Buscar média histórica (30 dias)
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: monthlyProductions } = await supabase
    .from("daily_productions")
    .select("commission_earned, clients_count")
    .eq("barber_id", barberId)
    .gte("date", formatManausDate(thirtyDaysAgo))
    .lt("date", formatManausDate(today));

  let totalCommission30d = 0;
  let daysWorked = 0;

  if (monthlyProductions) {
    for (const prod of monthlyProductions) {
      if (prod.commission_earned > 0 || prod.clients_count > 0) {
        daysWorked++;
        totalCommission30d += prod.commission_earned || 0;
      }
    }
  }

  const avgDailyCommission = daysWorked > 0 ? totalCommission30d / daysWorked : 0;
  const referenceValue = dailyGoal > 0 ? dailyGoal : avgDailyCommission;

  // Dados de hoje
  const todayData = recentDays.find(d => d.date === formatManausDate(today));
  const todayCommission = todayData?.commission_earned || 0;

  // Análise: Hoje está abaixo de 70% do esperado?
  const isBelowAverage = referenceValue > 0 && todayCommission < referenceValue * 0.7;

  // Análise de sequência (últimos 3 dias, excluindo hoje se não tem dados)
  const pastDays = recentDays.filter(d => d.date !== formatManausDate(today)).slice(0, 3);
  
  let consecutiveHighs = 0;
  let consecutiveLows = 0;

  // Contar sequência incluindo hoje
  const allDaysToCheck = [todayData, ...pastDays].filter(Boolean);
  
  for (const day of allDaysToCheck) {
    if (!day) break;
    if (day.commission_earned >= referenceValue) {
      if (consecutiveLows > 0) break; // Quebrou a sequência de baixas
      consecutiveHighs++;
    } else {
      if (consecutiveHighs > 0) break; // Quebrou a sequência de altas
      consecutiveLows++;
    }
  }

  const isConsecutiveHighs = consecutiveHighs >= 3;
  const isConsecutiveLows = consecutiveLows >= 3;

  let streakType: 'high' | 'low' | 'neutral' = 'neutral';
  let streakDays = 0;

  if (isConsecutiveHighs) {
    streakType = 'high';
    streakDays = consecutiveHighs;
  } else if (isConsecutiveLows) {
    streakType = 'low';
    streakDays = consecutiveLows;
  }

  return {
    recentDays,
    todayCommission,
    dailyGoal,
    avgDailyCommission,
    isBelowAverage,
    isConsecutiveHighs,
    isConsecutiveLows,
    streakType,
    streakDays,
  };
}

// ============================================
// FUNÇÕES DE CACHE
// ============================================

async function getCachedCoachMessage(
  barberId: string,
  today: string,
  supabase: any
): Promise<{ message: string; lastCoachAt: Date } | null> {
  const { data } = await supabase
    .from("daily_productions")
    .select("coach_message, last_coach_at")
    .eq("barber_id", barberId)
    .eq("date", today)
    .single();

  if (data?.coach_message && data?.last_coach_at) {
    return {
      message: data.coach_message,
      lastCoachAt: new Date(data.last_coach_at),
    };
  }
  return null;
}

async function saveCoachMessageToCache(
  barberId: string,
  today: string,
  message: string,
  supabase: any
): Promise<void> {
  await supabase
    .from("daily_productions")
    .update({
      coach_message: message,
      last_coach_at: new Date().toISOString(),
    })
    .eq("barber_id", barberId)
    .eq("date", today);
}

// ============================================
// ESTATÍSTICAS HISTÓRICAS (30 DIAS)
// ============================================

async function fetchHistoricalStats(barberId: string, organizationId: string, supabase: any): Promise<HistoricalStats> {
  const today = getManausDate();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = formatManausDate(thirtyDaysAgo);
  const endDate = formatManausDate(today);

  const { data: barberTransactions } = await supabase
    .from("sale_transactions")
    .select("item_type, item_name, price_sold, commission_amount, service_category, created_at")
    .eq("barber_id", barberId)
    .eq("source", "barber")
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`);

  const { data: managerTransactions } = await supabase
    .from("sale_transactions")
    .select("item_type, item_name, price_sold, commission_amount, service_category")
    .eq("barber_id", barberId)
    .eq("source", "manager")
    .gte("created_at", `${startDate}T00:00:00`)
    .lte("created_at", `${endDate}T23:59:59`);

  const { data: productions } = await supabase
    .from("daily_productions")
    .select("clients_count, commission_earned, date, manual_clients_count")
    .eq("barber_id", barberId)
    .gte("date", startDate)
    .lte("date", endDate);

  const { data: catalogServices } = await supabase
    .from("catalog_services")
    .select("name, category")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  const { data: catalogProducts } = await supabase
    .from("catalog_products")
    .select("name")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

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
        const cat = tx.service_category || 'basico';
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      } else if (tx.item_type === 'product') {
        productCount[tx.item_name] = (productCount[tx.item_name] || 0) + 1;
        totalProducts++;
      }
      totalRevenue30d += tx.price_sold || 0;
    }
  }

  const dayOfWeekSales: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  if (barberTransactions) {
    for (const tx of barberTransactions) {
      const date = new Date(tx.created_at);
      const dayOfWeek = date.getDay();
      dayOfWeekSales[dayOfWeek] += tx.price_sold || 0;
    }
  }

  let topService: { name: string; count: number } | null = null;
  for (const [name, count] of Object.entries(serviceCount)) {
    if (!topService || count > topService.count) {
      topService = { name, count };
    }
  }

  let topProduct: { name: string; count: number } | null = null;
  for (const [name, count] of Object.entries(productCount)) {
    if (!topProduct || count > topProduct.count) {
      topProduct = { name, count };
    }
  }

  const forgottenServices: string[] = [];
  if (catalogServices) {
    for (const service of catalogServices) {
      if (!serviceCount[service.name]) {
        forgottenServices.push(service.name);
      }
    }
  }

  const forgottenProducts: string[] = [];
  if (catalogProducts) {
    for (const product of catalogProducts) {
      if (!productCount[product.name]) {
        forgottenProducts.push(product.name);
      }
    }
  }

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
  const productConversionRate = totalClients30d > 0 ? (totalProducts / totalClients30d) * 100 : 0;
  const extrasCount = categoryCount['extra'] || 0;
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

// ============================================
// ESTATÍSTICAS DO DIA
// ============================================

async function fetchDayStats(barberId: string, supabase: any): Promise<DayStats> {
  const today = getManausDateString();
  
  const { data: production } = await supabase
    .from("daily_productions")
    .select("*")
    .eq("barber_id", barberId)
    .eq("date", today)
    .single();

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
        
        if (tx.service_category === 'extra') {
          servicosExtras++;
        } else {
          servicosBasicos++;
        }
        
        if (!ultimoServicoVendido) {
          ultimoServicoVendido = tx.item_name;
        }
      } else if (tx.item_type === 'product') {
        produtosVendidos[tx.item_name] = (produtosVendidos[tx.item_name] || 0) + 1;
        totalProdutos += tx.price_sold;
        
        if (!ultimoProdutoVendido) {
          ultimoProdutoVendido = tx.item_name;
        }
      }
    }
  }

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

// ============================================
// CONTEXTOS PARA IA
// ============================================

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

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let bestDay = 0;
  let bestDaySales = 0;
  for (const [day, sales] of Object.entries(stats.dayOfWeekSales)) {
    if (sales > bestDaySales) {
      bestDaySales = sales;
      bestDay = Number(day);
    }
  }

  const topServices = Object.entries(stats.serviceCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name}: ${count}x`)
    .join(', ') || 'Sem dados';

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

// ============================================
// LOG DE USO
// ============================================

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

// ============================================
// CONHECIMENTO TÉCNICO
// ============================================

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

// ============================================
// SYSTEM PROMPT BASE
// ============================================

const BASE_SYSTEM_PROMPT = `Você é um Mestre da Persuasão e Barbeiro Consultor de elite. Seu público são homens de alto nível (Executivos, Advogados, Médicos, Empresários).

⚠️ CONTEXTO CRÍTICO: O barbeiro só lança os dados NO FINAL DO EXPEDIENTE. 
Portanto, suas dicas devem ser:
- ANALÍTICAS: Sobre o que aconteceu HOJE
- ESTRATÉGICAS: Foco de ação para AMANHÃ

NUNCA diga "faça agora" ou "no próximo cliente". O dia JÁ ACABOU.
SEMPRE diga "amanhã" e "antes de ir embora, organize X".

MENTALIDADE: Você NÃO vende produtos. Você vende STATUS, CONFIANÇA e SOLUÇÃO DE DORES.

SEU TOM DE VOZ: 'Técnico-Parceiro'. Intimidade e respeito, com autoridade técnica absoluta. Não sugira, PRESCREVA. O barbeiro é o MÉDICO da imagem.

PROIBIDO: Gírias de rua exageradas ('Mano', 'Parça', 'Tmj') ou linguagem robótica ('Prezado senhor', 'Compreendo').
IDEAL: 'Campeão', 'Doutor', 'Meu amigo', 'Cara', 'Irmão'. Use perguntas para conduzir.

---

## 🚨 FORMATO DE RESPOSTA OBRIGATÓRIO (ESCANEÁVEL EM 5 SEGUNDOS)

**NUNCA responda em parágrafos longos.** Sua resposta DEVE seguir EXATAMENTE este esqueleto visual em Markdown:

### 1️⃣ GANCHO (1 linha motivacional com o nome do barbeiro)
Comece com "Fala [NOME]!" e um elogio + análise curta do dia.
Exemplo: "Fala Cesar! Dia intenso, mas deixou oportunidades na mesa."

### 2️⃣ RAIO-X (Bullet Points com dados críticos do dia)
Use ⚠️ para alertas e 📉📊🔥 para dados. Liste os números que motivaram a dica.
Exemplo:
⚠️ 30 dias sem vender Barba.
📉 Conversão de produtos: apenas 4%.
🔥 Ticket médio hoje: R$ 85 (acima da sua média!)

### 3️⃣ MISSÃO PARA AMANHÃ (Script/Estratégia em Blockquote)
Coloque a estratégia ou script para o DIA SEGUINTE dentro de um blockquote (>).
Exemplo:
> "Amanhã, antes de abrir, revise sua vitrine de produtos. O primeiro cliente sai com pomada na mão!"

### 4️⃣ FECHAMENTO (1 linha curta motivacional)
Finalize com energia para o dia seguinte. Use emoji no final.
Exemplo: "Descanse hoje, amanhã é dia de virar o jogo! 🚀"

---

## 🎯 ESTRATÉGIA DE CAMPANHA (DESAFIO 12 DIAS)

### A NOVA MENTALIDADE (Foco em Extras)
- O dinheiro de VERDADE está nos ADICIONAIS
- Regra de Ouro: 'Todo cliente tem diagnóstico. Você INDICA, não pergunta.'
- Meta Padrão: Mínimo 1 extra por cliente. Ideal 2.

### BASE DE DADOS DE COMISSÃO (Referência Mental)
Use estes valores como exemplo de persuasão:
- 'Quer colocar R$ 54 no bolso amanhã? Foque em vender um Alinhamento.'
- 'Precisa de R$ 36 rápido? É uma Barba SPA.'
- 'O combo invisível (Limpeza + Barba SPA) te dá R$ 72 de comissão num único cliente.'

### ROLETAS DE MISSÕES PARA AMANHÃ
Quando o barbeiro pedir ajuda ou tiver um dia fraco, sugira uma destas missões para o DIA SEGUINTE:

1. **Missão 'Pele em Foco'**: Focar 100% em Limpeza Facial e Esfoliação amanhã
   - Argumento: 'A pele oleosa é venda fácil. Amanhã, observe cada cliente.'

2. **Missão 'Dia do Alinhamento'**: O ticket mais alto
   - Argumento: 'Cabelo volumoso ou com frizz? Amanhã você não perde esses R$ 54.'

3. **Missão 'Saúde Capilar'**: Foco em Terapia e Hidratação
   - Argumento: 'Cabelo seco? Amanhã, prescreva o tratamento como médico.'

4. **Missão 'Combo Invisível'**: Vender dois serviços pequenos
   - Argumento: 'Amanhã, cada cliente é potencial para Limpeza + Barba SPA (R$ 72).'

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

☁️ Pomada em Pó (Gatilho: EXCLUSIVIDADE e SENSORIAL)
- Cliente odeia parecer sujo/oleoso. Quer parecer natural (Old Money)
- Use palavras: 'Textura', 'Matte', 'Invisível'

🧔 Balm (Gatilho: PROVA SOCIAL e RELACIONAMENTO)
- A barba arranha a parceira. A dor não é dele, é de quem ele beija
- Use a 'esposa/namorada' como alavanca

🏆 Assinatura/Clube (Gatilho: AVERSÃO À PERDA e STATUS)
- Não é sobre economizar, é sobre NUNCA estar feio
- Foque na 'Agenda' e na 'Imagem Impecável'

💸 Objeção de Preço (Gatilho: REFRAMING/RESSIGNIFICAÇÃO)
- NUNCA justifique o preço. Diminua o valor percebido comparando com tempo de uso

REGRAS FINAIS:
- SIGA RIGOROSAMENTE O FORMATO: Gancho → Raio-X → Missão para Amanhã → Fechamento
- Lembre-se: O dia JÁ ACABOU. Foco é análise de hoje + estratégia para amanhã
- Seja direto e estratégico
- Trate o barbeiro pelo nome
- O script de venda (Missão) deve ser uma estratégia para o DIA SEGUINTE`;

// ============================================
// HANDLER PRINCIPAL
// ============================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: RequestBody = await req.json();
    const today = getManausDateString();

    // ============================================
    // FLUXO PARA DAILY INSIGHT (COM CACHE + REGRAS)
    // ============================================
    if (body.type === 'daily_insight') {
      const { barberId, organizationId, barberName, monthlyGoal, soldToday, soldThisMonth, daysRemaining, dailyTarget, forceRefresh } = body;
      
      // PASSO 1: Verificar cache (4 horas) - apenas se não for forceRefresh
      if (!forceRefresh) {
        const cached = await getCachedCoachMessage(barberId, today, supabase);
        if (cached) {
          const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
          if (cached.lastCoachAt > fourHoursAgo) {
            console.log(`[CACHE HIT] Returning cached message for barber ${barberId}`);
            return new Response(JSON.stringify({ 
              message: cached.message, 
              type: body.type, 
              source: "cache" 
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      // Buscar estatísticas do dia E análise de tendência em paralelo
      const [dayStats, trendAnalysis] = await Promise.all([
        fetchDayStats(barberId, supabase),
        fetchTrendAnalysis(barberId, dailyTarget, supabase),
      ]);

      console.log(`[TREND] Barber ${barberId}: streak=${trendAnalysis.streakType} (${trendAnalysis.streakDays} days), belowAvg=${trendAnalysis.isBelowAverage}`);

      // PASSO 2: Motor de Regras (Templates Gratuitos) - Agora com análise de tendência
      const ruleResult = checkRulesEngine(dayStats, barberName, monthlyGoal, soldThisMonth, trendAnalysis);
      if (ruleResult) {
        console.log(`[RULES ENGINE] Scenario: ${ruleResult.scenario} for barber ${barberId}`);
        
        // Salvar no cache
        await saveCoachMessageToCache(barberId, today, ruleResult.message, supabase);
        
        // Log usage com scenario específico
        await logUsage(barberId, organizationId, 'daily_insight_rules', ruleResult.scenario);
        
        return new Response(JSON.stringify({ 
          message: ruleResult.message, 
          type: body.type, 
          source: "rules_engine",
          scenario: ruleResult.scenario,
          stats: dayStats 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // PASSO 3: Fallback - Chamar IA (cenários complexos)
      console.log(`[AI FALLBACK] Calling AI for barber ${barberId}`);
      
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }

      const dayStatsContext = buildDayStatsContext(dayStats);
      const historicalStats = await fetchHistoricalStats(barberId, organizationId, supabase);
      const historicalContext = buildHistoricalContext(historicalStats, dayStats);
      
      await logUsage(barberId, organizationId, 'daily_insight_ai');
      
      const percentageAchieved = monthlyGoal > 0 ? ((soldThisMonth / monthlyGoal) * 100).toFixed(1) : 0;
      const remaining = Math.max(0, monthlyGoal - soldThisMonth);
      
      const userPrompt = `${dayStatsContext}

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

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: BASE_SYSTEM_PROMPT },
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

      // Salvar no cache
      await saveCoachMessageToCache(barberId, today, aiMessage, supabase);

      return new Response(JSON.stringify({ 
        message: aiMessage, 
        type: body.type, 
        source: "ai",
        stats: dayStats 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // ============================================
    // FLUXO PARA SALES HELP (SEM CACHE - SEMPRE IA)
    // ============================================
    } else if (body.type === 'sales_help') {
      const { barberId, organizationId, scenario } = body;
      
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }

      const dayStats = await fetchDayStats(barberId, supabase);
      const dayStatsContext = buildDayStatsContext(dayStats);
      const historicalStats = await fetchHistoricalStats(barberId, organizationId, supabase);
      const historicalContext = buildHistoricalContext(historicalStats, dayStats);
      
      await logUsage(barberId, organizationId, 'sales_help', scenario);
      
      const scenarioPrompts: Record<string, string> = {
        'cliente_achou_caro': `O cliente achou o serviço/produto caro. Use o Gatilho de REFRAMING: Nunca justifique o preço. Diminua o valor percebido comparando com o tempo de uso diário. Script base: 'Pensa comigo: Esse pote dura 45 dias. Dá menos de 1 real por dia. É menos que o cafezinho que você toma na padaria. O que vale mais: um café ou sua imagem?'`,
        'oferecer_pomada': `O barbeiro quer oferecer pomada/cera. Use o Gatilho de EXCLUSIVIDADE e SENSORIAL. Se cabelo oleoso/fino, prescreva a Pomada em Pó. Use palavras: 'Textura', 'Matte', 'Invisível', 'Old Money'. Script base: 'Cara, pro seu fio que é fino, gel é crime. Mata o volume. O segredo dos artistas é essa Pomada em Pó. Ela dá volume, zero oleosidade e parece que você acordou arrumado.'`,
        'mudanca_visual': `O barbeiro quer sugerir mudança de visual. Use Future Pacing: faça o cliente IMAGINAR como vai ficar. Use Autoridade: prescreva como médico da imagem. 'Doutor, com esse formato de rosto, um degradê mais alto vai alongar o visual. Imagina você entrando na reunião com essa presença? Vamos testar?'`,
        'cliente_caspa': `O barbeiro notou caspa/couro sensível. Use Gatilho de DOR discretamente. Toque na ferida sem constranger: 'Meu amigo, reparei que o couro tá pedindo socorro. Isso aqui é fácil de resolver. O tratamento que tenho é igual de dermatologista, mas cabe no bolso. Quer que eu aplique hoje pra você sentir a diferença?'`,
        'servico_extra': `Oferecer serviço extra (hidratação, sobrancelha, pigmentação). Use Gatilho de STATUS e Future Pacing. IMPORTANTE: Verifique nos dados do dia quais serviços já foram feitos para NÃO sugerir algo redundante. 'Doutor, o corte tá afiado, mas a sobrancelha tá roubando a cena. Um alinhamento aqui e o olhar fica outro. Os caras de sucesso sabem que o detalhe faz a diferença. Faço em 5 minutos.'`,
        'fidelizacao': `Cliente satisfeito pagando. Ofereça ASSINATURA com Gatilho de AVERSÃO À PERDA e STATUS: 'Doutor, um cara da sua posição não pode ter "dia ruim" de cabelo. Na Assinatura, você não paga por visita. Você vem toda sexta, faz o ritual completo e tá sempre pronto pra qualquer reunião. É blindagem de imagem. Vamos migrar hoje?'`,
      };

      const userPrompt = `${dayStatsContext}

${historicalContext}

${scenarioPrompts[scenario] || `Cenário: ${scenario}. Gere um script de vendas persuasivo usando as técnicas de PNL e Gatilhos Mentais apropriados para esta situação.`}

IMPORTANTE: 
- Use os DADOS REAIS DO DIA E O HISTÓRICO para personalizar a resposta
- Se houver alertas (⚠️), priorize resolver esses gaps
- Se o barbeiro tem "Serviços Esquecidos", considere sugerir um deles se for apropriado ao cenário
- Verifique o CONHECIMENTO TÉCNICO para não sugerir serviços redundantes ou conflitantes
- Máximo de 3 frases que o barbeiro pode falar diretamente ao cliente`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: BASE_SYSTEM_PROMPT },
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

    } else {
      throw new Error("Tipo de requisição inválido");
    }

  } catch (error) {
    console.error("barber-ai-assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
