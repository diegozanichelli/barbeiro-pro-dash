import { describe, expect, it } from "vitest";
import { productionHasEntries, productionRevenue } from "./productionTotals";

describe("productionRevenue", () => {
  it("usa as colunas do gestor no fluxo real, com as legadas zeradas", () => {
    // É assim que o banco grava quando só a recepção lança.
    expect(
      productionRevenue({
        tx_basic_total: 300,
        tx_extra_total: 50,
        tx_products_total: 55,
        services_basic_total: 0,
        services_extra_total: 0,
        products_total: 0,
        services_total: 0,
      })
    ).toBe(405);
  });

  it("cai para o lançamento do barbeiro quando não há nada do gestor", () => {
    expect(
      productionRevenue({
        tx_basic_total: 0,
        manual_basic_total: 120,
        manual_extra_total: 30,
        services_basic_total: 0,
      })
    ).toBe(150);
  });

  it("cai para o legado quando não há tx nem manual", () => {
    expect(
      productionRevenue({ services_basic_total: 200, services_extra_total: 20, products_total: 10 })
    ).toBe(230);
  });

  it("soma services_total do legado antigo, sem quebra por categoria", () => {
    expect(productionRevenue({ services_total: 180 })).toBe(180);
  });

  it("trata nulos e ausências como zero", () => {
    expect(productionRevenue(null)).toBe(0);
    expect(productionRevenue({})).toBe(0);
    expect(productionRevenue({ tx_basic_total: null, services_total: null })).toBe(0);
  });

  it("não mistura as fontes: com gestor presente, ignora manual e legado", () => {
    expect(
      productionRevenue({ tx_basic_total: 100, manual_basic_total: 999, services_basic_total: 999 })
    ).toBe(100);
  });
});

describe("productionHasEntries", () => {
  it("acusa lançamento quando há faturamento do gestor", () => {
    expect(productionHasEntries({ tx_basic_total: 45 })).toBe(true);
  });

  it("acusa lançamento quando há comanda sem valor", () => {
    expect(productionHasEntries({ tx_clients_count: 2 })).toBe(true);
  });

  it("dia realmente vazio não acusa lançamento", () => {
    expect(productionHasEntries({ services_basic_total: 0, tx_clients_count: 0 })).toBe(false);
    expect(productionHasEntries(null)).toBe(false);
  });
});
