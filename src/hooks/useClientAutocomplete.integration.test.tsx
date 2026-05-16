import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { useClientAutocomplete } from "./useClientAutocomplete";

/**
 * Mock do supabase: quando o ilike for em normalized_name com padrão "joao%",
 * devolve sempre a mesma lista de clientes. Assim conseguimos verificar via UI
 * que a busca por "João", "Joao" e "JOÃO" produz exatamente os mesmos itens
 * renderizados.
 */
const JOAO_FIXTURES = [
  { id: "1", name: "João da Silva", mobile_phone: "11999990001" },
  { id: "2", name: "Joao Pereira", mobile_phone: "11999990002" },
  { id: "3", name: "JOÃO Souza", mobile_phone: "11999990003" },
];

vi.mock("@/integrations/supabase/client", () => {
  const buildBuilder = () => {
    let lastIlikePattern: string | null = null;
    let lastIlikeColumn: string | null = null;
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      ilike: vi.fn((column: string, pattern: string) => {
        lastIlikeColumn = column;
        lastIlikePattern = pattern;
        return builder;
      }),
      limit: vi.fn(() => {
        if (lastIlikeColumn === "normalized_name" && lastIlikePattern === "joao%") {
          return Promise.resolve({ data: JOAO_FIXTURES, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      }),
    };
    return builder;
  };
  return {
    supabase: {
      from: vi.fn(() => buildBuilder()),
    },
  };
});

const ORG = "00000000-0000-0000-0000-000000000001";

function AutocompletePreview({ nameQuery }: { nameQuery: string }) {
  const { nameSuggestions } = useClientAutocomplete({
    organizationId: ORG,
    nameQuery,
    phoneQuery: "",
  });

  return (
    <ul data-testid="suggestions">
      {nameSuggestions.map((c) => (
        <li key={c.id} data-testid="suggestion-item">
          {c.name} — {c.mobile_phone}
        </li>
      ))}
    </ul>
  );
}

const waitForSuggestions = async () => {
  await waitFor(
    () => {
      const items = screen.getAllByTestId("suggestion-item");
      expect(items.length).toBe(JOAO_FIXTURES.length);
    },
    { timeout: 2000 }
  );
  return screen
    .getAllByTestId("suggestion-item")
    .map((el) => el.textContent?.trim());
};

describe("Autocomplete UI — busca insensível a acentos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("mostra os mesmos resultados para João, Joao e JOÃO", async () => {
    const variants = ["João", "Joao", "JOÃO"];
    const results: Array<Array<string | undefined>> = [];

    for (const variant of variants) {
      render(<AutocompletePreview nameQuery={variant} />);
      results.push(await waitForSuggestions());
      cleanup();
    }

    // Os 3 conjuntos de resultados devem ser idênticos (mesma ordem e conteúdo).
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0]).toHaveLength(JOAO_FIXTURES.length);
    expect(results[0]?.[0]).toContain("João da Silva");
  });

  it("também trata espaços extras e variações como JoÃo", async () => {
    const variants = ["  João  ", "JoÃo", "joao"];
    const results: Array<Array<string | undefined>> = [];

    for (const variant of variants) {
      render(<AutocompletePreview nameQuery={variant} />);
      results.push(await waitForSuggestions());
      cleanup();
    }

    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
  });
});
