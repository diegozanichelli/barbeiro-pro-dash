import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Captura os argumentos do .ilike() de cada query
const ilikeCalls: Array<{ column: string; pattern: string }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const buildBuilder = () => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      ilike: vi.fn((column: string, pattern: string) => {
        ilikeCalls.push({ column, pattern });
        return builder;
      }),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    };
    return builder;
  };
  return {
    supabase: {
      from: vi.fn(() => buildBuilder()),
    },
  };
});

import { useClientAutocomplete } from "./useClientAutocomplete";

const ORG = "00000000-0000-0000-0000-000000000001";

const renderWith = (nameQuery: string) =>
  renderHook(() =>
    useClientAutocomplete({
      organizationId: ORG,
      nameQuery,
      phoneQuery: "",
    })
  );

const flushDebounce = async () => {
  // debounce de 250ms dentro do hook
  await new Promise((r) => setTimeout(r, 300));
};

describe("useClientAutocomplete — busca por nome sem acento", () => {
  beforeEach(() => {
    ilikeCalls.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["João", "joao%"],
    ["Joao", "joao%"],
    ["JOÃO", "joao%"],
    ["joão", "joao%"],
    ["  João  ", "joao%"],
    ["Conceição", "conceicao%"],
    ["Núñez", "nunez%"],
  ])("envia %s para o banco como ilike normalized_name=%s", async (input, expected) => {
    renderWith(input);
    await flushDebounce();

    await waitFor(() => {
      const nameCall = ilikeCalls.find((c) => c.column === "normalized_name");
      expect(nameCall).toBeDefined();
      expect(nameCall?.pattern).toBe(expected);
    });
  });
});
