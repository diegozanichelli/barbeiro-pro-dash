/**
 * Formatação em pt-BR para valores exibidos ao usuário.
 *
 * O padrão brasileiro usa vírgula decimal e ponto de milhar: quem confere o
 * próprio dinheiro lê "R$ 2.355,00", não "R$ 2355.00" — que é o que `toFixed(2)`
 * produz.
 */
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const integerFormatter = new Intl.NumberFormat("pt-BR");

/** Valor em reais: brl(2355) => "R$ 2.355,00" */
export const brl = (value: number | null | undefined): string =>
  currencyFormatter.format(Number(value) || 0);

/** Quantidade inteira: int(1234) => "1.234" */
export const int = (value: number | null | undefined): string =>
  integerFormatter.format(Math.round(Number(value) || 0));

/** Percentual com uma casa: pct(24.42) => "24,4%" */
export const pct = (value: number | null | undefined, fractionDigits = 1): string =>
  `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value) || 0)}%`;
