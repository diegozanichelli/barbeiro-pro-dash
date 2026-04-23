import { Info } from "lucide-react";

type Scope = "conversion" | "reception" | "portfolio";

const BANNERS: Record<Scope, { title: string; body: string }> = {
  conversion: {
    title: "O que esta aba mede",
    body:
      "Quantos clientes novos atendidos pelos barbeiros viraram assinantes. Inclui também uma linha agregada da Recepção. " +
      "Critério: assinaturas com ação = nova ÷ pessoas únicas (por celular).",
  },
  reception: {
    title: "O que esta aba mede",
    body:
      "Apenas vendas de assinatura registradas sem barbeiro atribuído (balcão), separadas por unidade. " +
      "Não inclui vendas atribuídas a barbeiros.",
  },
  portfolio: {
    title: "O que esta aba mede",
    body:
      "Visão completa da movimentação da carteira no período: novas adesões, renovações, upgrades e downgrades, " +
      "com a receita gerada por cada tipo. Inclui vendas de barbeiros e da recepção.",
  },
};

export function SubscriptionScopeBanner({ scope }: { scope: Scope }) {
  const { title, body } = BANNERS[scope];
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 mb-4">
      <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="text-xs text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground">{title}: </span>
        {body}
      </div>
    </div>
  );
}

export function SubscriptionScopeFooter() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 mt-6">
      <p className="text-xs font-semibold text-foreground mb-2">
        Como esses 3 relatórios se relacionam
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 leading-relaxed">
        <li>
          <span className="font-medium text-foreground">Carteira de Assinaturas</span> — todas as
          movimentações no mês (novas + renovações + upgrades + downgrades).
        </li>
        <li>
          <span className="font-medium text-foreground">Conversão por Barbeiro</span> — só novas
          adesões, distribuídas por barbeiro (+ linha Recepção).
        </li>
        <li>
          <span className="font-medium text-foreground">Vendas da Recepção</span> — só novas
          adesões sem barbeiro, distribuídas por unidade.
        </li>
      </ul>
      <p className="text-xs text-muted-foreground mt-2 italic">
        O total de "Novas Assinaturas" da Carteira coincide com o total da Conversão (incluindo a
        linha Recepção).
      </p>
    </div>
  );
}
