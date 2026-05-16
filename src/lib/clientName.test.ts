import { describe, it, expect } from "vitest";
import { normalizeClientName } from "./clientName";

describe("normalizeClientName", () => {
  it("trata variações de João como o mesmo valor", () => {
    const expected = "joao";
    expect(normalizeClientName("João")).toBe(expected);
    expect(normalizeClientName("Joao")).toBe(expected);
    expect(normalizeClientName("JOÃO")).toBe(expected);
    expect(normalizeClientName("JOAO")).toBe(expected);
    expect(normalizeClientName("JoÃo")).toBe(expected);
    expect(normalizeClientName("  joão  ")).toBe(expected);
    expect(normalizeClientName("\tJoão\n")).toBe(expected);
  });

  it("remove acentos comuns do português", () => {
    expect(normalizeClientName("Ágatha")).toBe(normalizeClientName("Agatha"));
    expect(normalizeClientName("André")).toBe(normalizeClientName("Andre"));
    expect(normalizeClientName("Conceição")).toBe(normalizeClientName("Conceicao"));
    expect(normalizeClientName("Núñez")).toBe(normalizeClientName("Nunez"));
    expect(normalizeClientName("Müller")).toBe(normalizeClientName("Muller"));
    expect(normalizeClientName("Ýasmin")).toBe(normalizeClientName("Yasmin"));
    expect(normalizeClientName("Conceição")).toBe("conceicao");
  });

  it("preserva caracteres especiais não acentuados", () => {
    expect(normalizeClientName("Maria-José")).toBe("maria-jose");
    expect(normalizeClientName("O'Brien")).toBe("o'brien");
    expect(normalizeClientName("Ana & Bia")).toBe("ana & bia");
    expect(normalizeClientName("João da Silva Jr.")).toBe("joao da silva jr.");
  });

  it("trata entradas vazias com segurança", () => {
    expect(normalizeClientName("")).toBe("");
    expect(normalizeClientName("   ")).toBe("");
  });

  it("é idempotente", () => {
    const inputs = ["João", "CONCEIÇÃO", "  Núñez  ", "Maria-José", "Ana & Bia"];
    for (const input of inputs) {
      const once = normalizeClientName(input);
      const twice = normalizeClientName(once);
      expect(twice).toBe(once);
    }
  });
});
