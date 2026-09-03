import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, Scissors, ShoppingBag, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePagination";
import { productionRevenue, type ProductionTotalsRow } from "@/lib/productionTotals";
import { brl, pct } from "@/lib/currency";

/**
 * O fechamento do mês do barbeiro.
 *
 * A leitura segue a ordem em que a pergunta aparece na cabeça de quem abre o
 * app: quanto eu ganhei, de onde veio esse faturamento, quem eu atendi, o que
 * eu mais vendi. Cada bloco responde uma dessas, e nenhum número aparece sem o
 * contexto que o torna acionável.
 *
 * A comissão é o número herói porque é a meta que o barbeiro tem cadastrada
 * (monthly_goals só guarda target_commission). O faturamento da cadeira vem
 * logo abaixo, sem meta, porque não existe uma no banco para comparar.
 */

/** As três cores passam nos seis testes de contraste sobre o fundo escuro do app. */
const COR_ASSINATURA = "#16a86a";
const COR_SERVICO = "#3c83f6";
const COR_PRODUTO = "#c98416";

interface Tx {
  created_at: string;
  item_type: string;
  item_name: string | null;
  service_category: string | null;
  price_sold: number | null;
  is_new_client: boolean | null;
  client_name: string | null;
  mobile_phone: string | null;
}

interface ClienteRow {
  mobile_phone: string | null;
  normalized_name: string | null;
  subscription_plan_id: string | null;
}

interface ItemAgregado {
  nome: string;
  valor: number;
  quantidade: number;
}

interface MesEvolucao {
  rotulo: string;
  faturamento: number;
}

interface Fechamento {
  assinaturas: number;
  servicos: number;
  produtos: number;
  faturamento: number;
  atendimentos: number;
  clientesDistintos: number;
  comClube: number;
  semClube: number;
  novosClientes: number;
  ticketMedio: number;
  servicosMaisFeitos: ItemAgregado[];
  outrosServicos: ItemAgregado[];
  extras: ItemAgregado[];
  totalExtras: number;
  listaProdutos: ItemAgregado[];
  evolucao: MesEvolucao[];
}

const VAZIO: Fechamento = {
  assinaturas: 0,
  servicos: 0,
  produtos: 0,
  faturamento: 0,
  atendimentos: 0,
  clientesDistintos: 0,
  comClube: 0,
  semClube: 0,
  novosClientes: 0,
  ticketMedio: 0,
  servicosMaisFeitos: [],
  outrosServicos: [],
  extras: [],
  totalExtras: 0,
  listaProdutos: [],
  evolucao: [],
};

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const chave = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

const diasNoMes = (ano: number, mes: number) => new Date(ano, mes, 0).getDate();

/** Mesma normalização do cadastro de clientes, para casar telefone com telefone. */
const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const normalizaNome = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/**
 * Identidade do cliente numa transação: telefone quando existe, senão o nome.
 * Sem nenhum dos dois a visita não pode ser fundida com outra, então cada uma
 * conta como uma pessoa — é o que evita inflar "com clube" com anônimos.
 */
const identidade = (t: Tx): string => {
  const tel = soDigitos(t.mobile_phone);
  if (tel.length >= 8) return `tel:${tel}`;
  const nome = normalizaNome(t.client_name);
  if (nome) return `nome:${nome}`;
  return `visita:${t.created_at}`;
};

/** Uma comanda é o conjunto de itens lançados no mesmo instante. */
const comanda = (t: Tx) => t.created_at;

/**
 * Rótulo curto para o eixo: "R$ 22.500,00" por extenso não cabe na largura de
 * um celular e empurra a página inteira para o lado. O valor exato continua no
 * tooltip e nos cards.
 */
const eixoCompacto = (v: number) => {
  if (Math.abs(v) >= 1000) {
    return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
};

const agrupar = (txs: Tx[]): ItemAgregado[] => {
  const mapa = new Map<string, ItemAgregado>();
  txs.forEach((t) => {
    const nome = (t.item_name ?? "").trim() || "Sem descrição";
    const atual = mapa.get(nome) ?? { nome, valor: 0, quantidade: 0 };
    atual.valor += Number(t.price_sold) || 0;
    atual.quantidade += 1;
    mapa.set(nome, atual);
  });
  return [...mapa.values()];
};

interface Props {
  barberId: string;
  organizationId: string;
  month: number;
  year: number;
  monthLabel: string;
  /** Comissão do mês, vinda de daily_productions — a fonte única do app. */
  commissionEarned: number;
  commissionGoal: number | null;
  /** Ritmo do mês, calculado pelo painel a partir dos dias úteis já passados. */
  pacingStatus: "ahead" | "on-track" | "behind" | "critical" | null;
  expectedPercent: number | null;
  servicesConversion: number;
  productsConversion: number;
}

const RITMO = {
  ahead: { texto: "Acima da meta", classe: "bg-success/15 text-success border-success/30" },
  "on-track": { texto: "No ritmo", classe: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  behind: { texto: "Atenção", classe: "bg-warning/15 text-warning border-warning/30" },
  critical: { texto: "Crítico", classe: "bg-destructive/15 text-destructive border-destructive/30" },
} as const;

export default function MonthlyClosingPanel({
  barberId,
  organizationId,
  month,
  year,
  monthLabel,
  commissionEarned,
  commissionGoal,
  pacingStatus,
  expectedPercent,
  servicesConversion,
  productsConversion,
}: Props) {
  const [dados, setDados] = useState<Fechamento>(VAZIO);
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(async () => {
    setCarregando(true);

    const inicio = chave(year, month, 1);
    const diaSeguinte = new Date(Date.UTC(year, month - 1, diasNoMes(year, month) + 1, 12))
      .toISOString()
      .slice(0, 10);

    // Três meses para a linha de evolução, terminando no mês em tela.
    const inicioEvolucao = chave(
      month <= 2 ? year - 1 : year,
      ((month - 3 + 12) % 12) + 1,
      1
    );
    const fimEvolucao = chave(year, month, diasNoMes(year, month));

    const [txs, producoes] = await Promise.all([
      fetchAllRows<Tx>(() =>
        supabase
          .from("sale_transactions")
          .select(
            "created_at, item_type, item_name, service_category, price_sold, is_new_client, client_name, mobile_phone"
          )
          .eq("barber_id", barberId)
          .gte("created_at", `${inicio}T00:00:00-04:00`)
          .lt("created_at", `${diaSeguinte}T00:00:00-04:00`)
          .order("created_at", { ascending: true })
      ),
      fetchAllRows<ProductionTotalsRow & { date: string }>(() =>
        supabase
          .from("daily_productions")
          .select(
            "date, tx_basic_total, tx_extra_total, tx_products_total, tx_clients_count, manual_basic_total, manual_extra_total, manual_products_total, services_basic_total, services_extra_total, services_total, products_total"
          )
          .eq("barber_id", barberId)
          .gte("date", inicioEvolucao)
          .lte("date", fimEvolucao)
      ),
    ]);

    const assinaturas = txs.filter((t) => t.item_type === "subscription");
    const servicos = txs.filter((t) => t.item_type === "service");
    const produtos = txs.filter((t) => t.item_type === "product");
    const soma = (lista: Tx[]) => lista.reduce((s, t) => s + (Number(t.price_sold) || 0), 0);

    const totalAssinaturas = soma(assinaturas);
    const totalServicos = soma(servicos);
    const totalProdutos = soma(produtos);
    const faturamento = totalAssinaturas + totalServicos + totalProdutos;

    // Atendimento é comanda — a mesma definição que o painel do gestor usa.
    const atendimentos = new Set(
      txs.filter((t) => t.item_type !== "subscription").map(comanda)
    ).size;

    const porCliente = new Map<string, { novo: boolean; tel: string; nome: string }>();
    txs.forEach((t) => {
      const id = identidade(t);
      const atual = porCliente.get(id) ?? {
        novo: false,
        tel: soDigitos(t.mobile_phone),
        nome: normalizaNome(t.client_name),
      };
      atual.novo = atual.novo || t.is_new_client === true;
      porCliente.set(id, atual);
    });

    // O clube é status do cadastro do cliente, não da venda: busco só os
    // clientes que apareceram no mês, em vez da carteira inteira.
    const telefones = [...porCliente.values()].map((c) => c.tel).filter((t) => t.length >= 8);
    let assinantes = new Set<string>();
    if (telefones.length > 0) {
      const cadastros = await fetchAllRows<ClienteRow>(() =>
        supabase
          .from("clients")
          .select("mobile_phone, normalized_name, subscription_plan_id")
          .eq("organization_id", organizationId)
          .in("mobile_phone", telefones)
      );
      assinantes = new Set(
        cadastros
          .filter((c) => c.subscription_plan_id)
          .map((c) => soDigitos(c.mobile_phone))
          .filter(Boolean)
      );
    }

    const clientesDistintos = porCliente.size;
    const comClube = [...porCliente.values()].filter((c) => assinantes.has(c.tel)).length;
    const novosClientes = [...porCliente.values()].filter((c) => c.novo).length;

    const servicosAgrupados = agrupar(servicos).sort((a, b) => b.quantidade - a.quantidade);
    const extras = agrupar(servicos.filter((t) => t.service_category === "extra")).sort(
      (a, b) => b.valor - a.valor
    );

    const evolucaoPorMes = new Map<string, number>();
    producoes.forEach((p) => {
      const rotulo = p.date.slice(0, 7);
      evolucaoPorMes.set(rotulo, (evolucaoPorMes.get(rotulo) ?? 0) + productionRevenue(p));
    });
    const evolucao: MesEvolucao[] = [2, 1, 0].map((atras) => {
      const d = new Date(Date.UTC(year, month - 1 - atras, 1));
      const rotulo = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      return {
        rotulo: MESES_CURTOS[d.getUTCMonth()],
        faturamento: evolucaoPorMes.get(rotulo) ?? 0,
      };
    });

    setDados({
      assinaturas: totalAssinaturas,
      servicos: totalServicos,
      produtos: totalProdutos,
      faturamento,
      atendimentos,
      clientesDistintos,
      comClube,
      semClube: clientesDistintos - comClube,
      novosClientes,
      ticketMedio: clientesDistintos > 0 ? faturamento / clientesDistintos : 0,
      servicosMaisFeitos: servicosAgrupados.slice(0, 3),
      outrosServicos: servicosAgrupados.slice(3),
      extras,
      totalExtras: extras.reduce((s, e) => s + e.valor, 0),
      listaProdutos: agrupar(produtos).sort((a, b) => b.valor - a.valor),
      evolucao,
    });
    setCarregando(false);
  }, [barberId, organizationId, month, year]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  const fatias = useMemo(
    () =>
      [
        { nome: "Assinaturas", valor: dados.assinaturas, cor: COR_ASSINATURA },
        { nome: "Serviços avulsos", valor: dados.servicos, cor: COR_SERVICO },
        { nome: "Produtos", valor: dados.produtos, cor: COR_PRODUTO },
      ].filter((f) => f.valor > 0),
    [dados]
  );

  const atingido = commissionGoal ? (commissionEarned / commissionGoal) * 100 : null;
  const falta = commissionGoal ? Math.max(0, commissionGoal - commissionEarned) : null;

  const variacao = useMemo(() => {
    const [primeiro, , ultimo] = dados.evolucao;
    if (!primeiro?.faturamento) return null;
    return ((ultimo.faturamento - primeiro.faturamento) / primeiro.faturamento) * 100;
  }, [dados.evolucao]);

  if (carregando) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Montando seu fechamento…</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* O número que o barbeiro veio ver: o que ele ganhou, contra a meta dele. */}
      <Card className="bg-gradient-card border-primary/30 shadow-gold">
        <CardContent className="pt-6 space-y-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground text-center">
            Sua comissão em {monthLabel}
          </p>
          <p className="text-4xl sm:text-5xl font-bold text-primary text-center leading-none">
            {brl(commissionEarned)}
          </p>

          {commissionGoal ? (
            <>
              <Progress value={Math.min(100, atingido ?? 0)} className="h-2" />
              {(pacingStatus || expectedPercent !== null) && (
                <div className="flex items-center justify-center gap-2 text-xs">
                  {pacingStatus && (
                    <span
                      className={`whitespace-nowrap rounded-full border px-2 py-0.5 font-medium ${RITMO[pacingStatus].classe}`}
                    >
                      {RITMO[pacingStatus].texto}
                    </span>
                  )}
                  {expectedPercent !== null && (
                    <span className="text-muted-foreground">
                      esperado até aqui: {pct(expectedPercent)}
                    </span>
                  )}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Meta</p>
                  <p className="text-sm font-bold">{brl(commissionGoal)}</p>
                </div>
                <div className="border-x border-border">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Atingido</p>
                  <p className="text-sm font-bold text-success">{pct(atingido ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Falta</p>
                  <p className="text-sm font-bold">{brl(falta ?? 0)}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              Sem meta cadastrada para este mês — peça ao gestor.
            </p>
          )}
        </CardContent>
      </Card>

      {/* De onde veio o faturamento. */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Faturamento da cadeira</CardTitle>
          <CardDescription>Assinaturas, serviços e produtos vendidos por você</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-3xl font-bold">{brl(dados.faturamento)}</p>

          {fatias.length > 0 ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="h-40 w-full sm:w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={fatias}
                      dataKey="valor"
                      nameKey="nome"
                      innerRadius="58%"
                      outerRadius="88%"
                      paddingAngle={2}
                      stroke="hsl(var(--card))"
                      strokeWidth={2}
                    >
                      {fatias.map((f) => (
                        <Cell key={f.nome} fill={f.cor} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.5rem",
                        fontSize: "0.8rem",
                      }}
                      formatter={(v: number, n: string) => [brl(v), n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ul className="flex-1 space-y-2">
                {fatias.map((f) => (
                  <li key={f.nome} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: f.cor }}
                      aria-hidden
                    />
                    <span className="flex-1 text-muted-foreground">{f.nome}</span>
                    <span className="font-semibold">{brl(f.valor)}</span>
                    <span className="w-14 text-right text-muted-foreground">
                      {pct((f.valor / dados.faturamento) * 100)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma venda lançada neste mês.</p>
          )}
        </CardContent>
      </Card>

      {/* Quem você atendeu. */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Clientes atendidos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="min-w-0">
              <p className="text-3xl font-bold tabular-nums">{dados.clientesDistintos}</p>
              <p className="text-xs text-muted-foreground">clientes distintos</p>
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold tabular-nums">{brl(dados.ticketMedio)}</p>
              <p className="text-xs text-muted-foreground">ticket médio por cliente</p>
            </div>
          </div>

          <ul className="space-y-2 text-sm border-t border-border pt-3">
            <li className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COR_ASSINATURA }}
                aria-hidden
              />
              <span className="flex-1 text-muted-foreground">Com clube</span>
              <span className="font-semibold">{dados.comClube}</span>
              {dados.clientesDistintos > 0 && (
                <span className="w-14 text-right text-muted-foreground">
                  {pct((dados.comClube / dados.clientesDistintos) * 100)}
                </span>
              )}
            </li>
            <li className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COR_SERVICO }}
                aria-hidden
              />
              <span className="flex-1 text-muted-foreground">Sem clube</span>
              <span className="font-semibold">{dados.semClube}</span>
              {dados.clientesDistintos > 0 && (
                <span className="w-14 text-right text-muted-foreground">
                  {pct((dados.semClube / dados.clientesDistintos) * 100)}
                </span>
              )}
            </li>
          </ul>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="min-w-0 rounded-lg border border-success/30 bg-success/5 p-3">
              <p className="text-xl font-bold text-success">+{dados.novosClientes}</p>
              <p className="text-xs text-muted-foreground">novos clientes no mês</p>
            </div>
            <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xl font-bold">{dados.atendimentos}</p>
              <p className="text-xs text-muted-foreground">atendimentos (comandas)</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm border-t border-border pt-3">
            <div>
              <p className="text-xs text-muted-foreground">Taxa de venda em serviços</p>
              <p className="text-lg font-bold text-success">{pct(servicesConversion)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taxa de venda em produtos</p>
              <p className="text-lg font-bold" style={{ color: COR_PRODUTO }}>
                {pct(productsConversion)}
              </p>
            </div>
          </div>

          {dados.semClube > 0 && (
            <p className="text-xs text-muted-foreground">
              {dados.semClube} {dados.semClube === 1 ? "cliente ainda não é" : "clientes ainda não são"} do
              clube — é aí que está a sua próxima conversão.
            </p>
          )}
        </CardContent>
      </Card>

      {/* O que você mais fez. */}
      {dados.servicosMaisFeitos.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Scissors className="w-4 h-4 text-primary" />
              Serviços mais realizados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dados.servicosMaisFeitos.map((s) => (
              <div key={s.nome} className="flex items-center justify-between gap-3">
                <span className="text-sm">{s.nome}</span>
                <span className="text-2xl font-bold text-success shrink-0">{s.quantidade}</span>
              </div>
            ))}
            {dados.outrosServicos.length > 0 && (
              <p className="text-xs text-muted-foreground border-t border-border pt-3">
                Também no mês:{" "}
                {dados.outrosServicos
                  .slice(0, 6)
                  .map((s) => `${s.nome} ${s.quantidade}`)
                  .join(" · ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* O detalhe que mostra onde o dinheiro extra apareceu. */}
      {(dados.extras.length > 0 || dados.listaProdutos.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {dados.extras.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Serviços adicionais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {dados.extras.slice(0, 8).map((e) => (
                  <div key={e.nome} className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground truncate">{e.nome}</span>
                    <span className="font-medium shrink-0">{brl(e.valor)}</span>
                  </div>
                ))}
                {dados.extras.length > 8 && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {dados.extras.length - 8 === 1
                        ? "Mais 1 extra"
                        : `Mais ${dados.extras.length - 8} extras`}
                    </span>
                    <span className="font-medium shrink-0">
                      {brl(dados.extras.slice(8).reduce((s, e) => s + e.valor, 0))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3 text-sm border-t border-border pt-2 mt-2">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-success">{brl(dados.totalExtras)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {dados.listaProdutos.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-primary" />
                  Produtos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {dados.listaProdutos.slice(0, 8).map((p) => (
                  <div key={p.nome} className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground truncate">{p.nome}</span>
                    <span className="font-medium shrink-0">{brl(p.valor)}</span>
                  </div>
                ))}
                {dados.listaProdutos.length > 8 && (
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {dados.listaProdutos.length - 8 === 1
                        ? "Mais 1 produto"
                        : `Mais ${dados.listaProdutos.length - 8} produtos`}
                    </span>
                    <span className="font-medium shrink-0">
                      {brl(dados.listaProdutos.slice(8).reduce((s, p) => s + p.valor, 0))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3 text-sm border-t border-border pt-2 mt-2">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold" style={{ color: COR_PRODUTO }}>
                    {brl(dados.produtos)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Onde ele estava três meses atrás. */}
      {dados.evolucao.some((m) => m.faturamento > 0) && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Sua evolução</CardTitle>
                <CardDescription>Vendas de serviços e produtos nos últimos 3 meses</CardDescription>
              </div>
              {variacao !== null && (
                <span
                  className={`text-lg font-bold shrink-0 ${
                    variacao >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {variacao >= 0 ? "+" : ""}
                  {pct(variacao)}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dados.evolucao} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                  <XAxis
                    dataKey="rotulo"
                    stroke="hsl(var(--muted-foreground))"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={52}
                    tickFormatter={eixoCompacto}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "0.8rem",
                    }}
                    formatter={(v: number) => [brl(v), "Faturamento"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="faturamento"
                    stroke={COR_ASSINATURA}
                    strokeWidth={2}
                    dot={{ r: 4, fill: COR_ASSINATURA, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
