import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CalendarCheck,
  Clock,
  Loader2,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePagination";
import { getManausDate } from "@/lib/dateUtils";
import { brl, pct } from "@/lib/currency";

/**
 * Plano de Ação do barbeiro para o mês corrente.
 *
 * O que esta aba acrescenta é o lado prospectivo: a meta do mês e as cinco
 * frentes de trabalho. Cada frente mostra a BASE REAL do barbeiro (mês
 * anterior, lida da própria produção) ao lado da META DEFINIDA PELO GESTOR.
 * Nenhum número vem de material visual: base é dado real do barbeiro, meta é o
 * que o gestor cadastrou; frente sem meta aparece como "peça ao gestor".
 *
 * A performance completa do mês (composição, top serviços, evolução) já vive
 * no "Meu Painel" — aqui fica só um resumo curto do mês anterior como contexto,
 * para não repetir a mesma tela.
 */

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

interface Tx {
  created_at: string;
  item_type: string;
  service_category: string | null;
  price_sold: number | null;
  client_name: string | null;
  mobile_phone: string | null;
}

interface MetasFrente {
  newClubs: number | null;
  products: number | null;
  extrasPerClient: number | null;
  frequencyUpliftPct: number | null;
  productivityPct: number | null;
}

interface BaseMesAnterior {
  faturamento: number;
  clientesDistintos: number;
  ticketMedio: number;
  semClube: number;
  extrasPorCliente: number;
  produtos: number;
}

const BASE_VAZIA: BaseMesAnterior = {
  faturamento: 0,
  clientesDistintos: 0,
  ticketMedio: 0,
  semClube: 0,
  extrasPorCliente: 0,
  produtos: 0,
};

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const normalizaNome = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Mesma identidade de cliente do fechamento: telefone, senão nome, senão a visita. */
const identidade = (t: Tx): string => {
  const tel = soDigitos(t.mobile_phone);
  if (tel.length >= 8) return `tel:${tel}`;
  const nome = normalizaNome(t.client_name);
  if (nome) return `nome:${nome}`;
  return `visita:${t.created_at}`;
};

const chave = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const diasNoMes = (ano: number, mes: number) => new Date(ano, mes, 0).getDate();

interface Props {
  barberId: string;
}

export default function ActionPlanPanel({ barberId }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [metaComissao, setMetaComissao] = useState<number | null>(null);
  const [metas, setMetas] = useState<MetasFrente>({
    newClubs: null,
    products: null,
    extrasPerClient: null,
    frequencyUpliftPct: null,
    productivityPct: null,
  });
  const [base, setBase] = useState<BaseMesAnterior>(BASE_VAZIA);

  const agora = getManausDate();
  const planoMes = agora.getMonth() + 1;
  const planoAno = agora.getFullYear();
  const baseMes = planoMes === 1 ? 12 : planoMes - 1;
  const baseAno = planoMes === 1 ? planoAno - 1 : planoAno;

  const buscar = useCallback(async () => {
    setCarregando(true);

    // Meta do mês corrente (frentes + comissão), do que o gestor cadastrou.
    const { data: meta } = await supabase
      .from("monthly_goals")
      .select(
        "target_commission, target_new_clubs, target_products_revenue, target_extras_per_client, target_frequency_uplift_pct, target_productivity_pct"
      )
      .eq("barber_id", barberId)
      .eq("month", planoMes)
      .eq("year", planoAno)
      .maybeSingle();

    setMetaComissao(meta?.target_commission != null ? Number(meta.target_commission) : null);
    setMetas({
      newClubs: meta?.target_new_clubs != null ? Number(meta.target_new_clubs) : null,
      products: meta?.target_products_revenue != null ? Number(meta.target_products_revenue) : null,
      extrasPerClient:
        meta?.target_extras_per_client != null ? Number(meta.target_extras_per_client) : null,
      frequencyUpliftPct:
        meta?.target_frequency_uplift_pct != null ? Number(meta.target_frequency_uplift_pct) : null,
      productivityPct:
        meta?.target_productivity_pct != null ? Number(meta.target_productivity_pct) : null,
    });

    // Base real: transações do barbeiro no mês anterior.
    const inicio = chave(baseAno, baseMes, 1);
    const diaSeguinte = new Date(Date.UTC(baseAno, baseMes - 1, diasNoMes(baseAno, baseMes) + 1, 12))
      .toISOString()
      .slice(0, 10);

    const txs = await fetchAllRows<Tx>(() =>
      supabase
        .from("sale_transactions")
        .select("created_at, item_type, service_category, price_sold, client_name, mobile_phone")
        .eq("barber_id", barberId)
        .gte("created_at", `${inicio}T00:00:00-04:00`)
        .lt("created_at", `${diaSeguinte}T00:00:00-04:00`)
    );

    const soma = (lista: Tx[]) => lista.reduce((s, t) => s + (Number(t.price_sold) || 0), 0);
    const servicos = txs.filter((t) => t.item_type === "service");
    const produtos = txs.filter((t) => t.item_type === "product");
    const extras = servicos.filter((t) => t.service_category === "extra");
    const faturamento = soma(txs);

    const porCliente = new Map<string, string>();
    txs.forEach((t) => porCliente.set(identidade(t), soDigitos(t.mobile_phone)));
    const clientesDistintos = porCliente.size;

    // Status de clube dos clientes atendidos. A tabela clients só é legível por
    // gestor/super_admin, então o barbeiro obtém isso por uma função definer que
    // só devolve os assinantes entre os SEUS próprios clientes do período.
    const telefones = [...porCliente.values()].filter((t) => t.length >= 8);
    let comClube = 0;
    if (telefones.length > 0) {
      const { data: assinantesRows } = await supabase.rpc("get_barber_subscriber_phones", {
        p_barber_id: barberId,
        p_start: `${inicio}T00:00:00-04:00`,
        p_end: `${diaSeguinte}T00:00:00-04:00`,
      });
      const assinantes = new Set(
        (assinantesRows ?? []).map((r) => soDigitos(r.mobile_phone)).filter(Boolean)
      );
      comClube = [...porCliente.values()].filter((tel) => assinantes.has(tel)).length;
    }

    setBase({
      faturamento,
      clientesDistintos,
      ticketMedio: clientesDistintos > 0 ? faturamento / clientesDistintos : 0,
      semClube: clientesDistintos - comClube,
      extrasPorCliente: clientesDistintos > 0 ? soma(extras) / clientesDistintos : 0,
      produtos: soma(produtos),
    });

    setCarregando(false);
  }, [barberId, planoMes, planoAno, baseMes, baseAno]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  const planoLabel = `${MESES[planoMes - 1]} de ${planoAno}`;
  const baseLabel = `${MESES[baseMes - 1].charAt(0).toUpperCase()}${MESES[baseMes - 1].slice(1)}/${baseAno}`;

  // As cinco frentes: cada uma com a base real (quando existe) e a meta do gestor.
  const frentes = [
    {
      icone: Users,
      titulo: "Converter clientes para o clube",
      base:
        base.semClube > 0
          ? `${base.semClube} ${base.semClube === 1 ? "cliente sem clube" : "clientes sem clube"} atendidos em ${baseLabel} — é a sua oportunidade`
          : null,
      meta:
        metas.newClubs != null
          ? `${metas.newClubs} ${metas.newClubs === 1 ? "novo clube" : "novos clubes"}`
          : null,
      acoes: [
        "Apresente o clube no pós-atendimento",
        "Mostre os benefícios e a economia para o cliente",
        "Ofereça o plano certo para o perfil",
      ],
    },
    {
      icone: Sparkles,
      titulo: "Aumentar o ticket com extras",
      base: `${brl(base.extrasPorCliente)} em extras por cliente em ${baseLabel}`,
      meta: metas.extrasPerClient != null ? `${brl(metas.extrasPerClient)} por cliente` : null,
      acoes: [
        "Indique ao menos 1 extra por atendimento",
        "Use o espelho e destaque o benefício do serviço",
      ],
    },
    {
      icone: ShoppingBag,
      titulo: "Vender mais produtos",
      base: `${brl(base.produtos)} em produtos em ${baseLabel}`,
      meta: metas.products != null ? `${brl(metas.products)} no mês` : null,
      acoes: [
        "Feche todo atendimento oferecendo um produto",
        "Tenha 1 produto em evidência na bancada",
      ],
    },
    {
      icone: Clock,
      titulo: "Aumentar a frequência dos clientes",
      base: null,
      meta: metas.frequencyUpliftPct != null ? `+${pct(metas.frequencyUpliftPct)}` : null,
      acoes: [
        "Reative e mantenha contato com quem não é do clube",
        "Convide a voltar em menos tempo (ex.: 15, 20 dias)",
        "Use lembrete no WhatsApp e agende o retorno",
      ],
    },
    {
      icone: TrendingUp,
      titulo: "Produtividade e gestão da agenda",
      base: null,
      meta: metas.productivityPct != null ? `${pct(metas.productivityPct)} da agenda` : null,
      acoes: [
        "Evite horários vagos e organize os de maior demanda",
        "Agilidade no atendimento sem perder qualidade",
      ],
    },
  ];

  const execucao = [
    { icone: Target, texto: "Defina sua meta do dia" },
    { icone: Users, texto: "Execute com excelência" },
    { icone: CalendarCheck, texto: "Registre e acompanhe" },
    { icone: TrendingUp, texto: "Analise e melhore sempre" },
  ];

  if (carregando) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Montando seu plano de ação…</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Meta do mês. */}
      <Card className="bg-gradient-card border-primary/30 shadow-gold">
        <CardContent className="pt-6 space-y-3 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Sua meta para {planoLabel}
          </p>
          {metaComissao != null ? (
            <p className="text-4xl sm:text-5xl font-bold text-primary leading-none">
              {brl(metaComissao)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem meta cadastrada para este mês — peça ao gestor.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Com foco nas 5 frentes abaixo, você chega lá.
          </p>
        </CardContent>
      </Card>

      {/* Base do mês anterior — contexto curto, sem repetir o Meu Painel. */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sua base em {baseLabel}</CardTitle>
          <CardDescription>De onde você parte para o mês novo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums">{brl(base.faturamento)}</p>
              <p className="text-xs text-muted-foreground">faturamento</p>
            </div>
            <div className="min-w-0 border-x border-border">
              <p className="text-lg font-bold tabular-nums">{base.clientesDistintos}</p>
              <p className="text-xs text-muted-foreground">clientes</p>
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums">{brl(base.ticketMedio)}</p>
              <p className="text-xs text-muted-foreground">ticket médio</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* As 5 frentes. */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">
          Suas 5 frentes para {MESES[planoMes - 1]}
        </h3>
        <div className="space-y-3">
          {frentes.map((f, i) => {
            const Icone = f.icone;
            return (
              <Card key={i} className="bg-card border-border">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <Icone className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold leading-tight">
                        <span className="text-primary">{i + 1}.</span> {f.titulo}
                      </p>

                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Meta:</span>
                        {f.meta ? (
                          <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                            {f.meta}
                          </span>
                        ) : (
                          <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
                            a definir pelo gestor
                          </span>
                        )}
                      </div>

                      {f.base && <p className="mt-1.5 text-xs text-muted-foreground">{f.base}</p>}

                      <ul className="mt-2 space-y-1">
                        {f.acoes.map((a, j) => (
                          <li key={j} className="flex gap-2 text-sm text-muted-foreground">
                            <span className="text-primary/70">•</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Plano de execução diária. */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Plano de execução diária</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {execucao.map((e, i) => {
              const Icone = e.icone;
              return (
                <div key={i} className="flex flex-col items-center gap-1.5 text-center">
                  <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                    <Icone className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-xs text-muted-foreground">{e.texto}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-center text-muted-foreground italic">
            O resultado vem para quem trabalha o plano todos os dias.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
