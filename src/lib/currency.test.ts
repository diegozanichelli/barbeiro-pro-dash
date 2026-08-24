import { describe, expect, it } from "vitest";
import { brl, int, pct } from "./currency";

/**
 * O Intl separa o símbolo do valor com espaço não-quebrável (U+00A0), e não com
 * espaço comum — é o que impede "R$" de sobrar sozinho no fim da linha. Os
 * testes comparam com esse caractere de propósito.
 */
const nbsp = "\u00A0";

describe("brl", () => {
  it("usa vírgula decimal e ponto de milhar", () => {
    expect(brl(2355)).toBe(`R$${nbsp}2.355,00`);
    expect(brl(61.31)).toBe(`R$${nbsp}61,31`);
    expect(brl(1234567.5)).toBe(`R$${nbsp}1.234.567,50`);
  });

  it("trata nulo, indefinido e NaN como zero", () => {
    expect(brl(null)).toBe(`R$${nbsp}0,00`);
    expect(brl(undefined)).toBe(`R$${nbsp}0,00`);
    expect(brl(Number.NaN)).toBe(`R$${nbsp}0,00`);
  });

  it("mantém o sinal de valores negativos", () => {
    expect(brl(-45)).toBe(`-R$${nbsp}45,00`);
  });
});

describe("int", () => {
  it("agrupa milhares e arredonda", () => {
    expect(int(1234)).toBe("1.234");
    expect(int(42.6)).toBe("43");
    expect(int(null)).toBe("0");
  });
});

describe("pct", () => {
  it("usa vírgula na casa decimal", () => {
    expect(pct(24.42)).toBe("24,4%");
    expect(pct(100)).toBe("100,0%");
    expect(pct(0)).toBe("0,0%");
  });

  it("aceita outra precisão", () => {
    expect(pct(7.125, 2)).toBe("7,13%");
    expect(pct(46.2, 0)).toBe("46%");
  });
});
