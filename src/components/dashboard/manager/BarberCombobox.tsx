import { useState, useEffect, useMemo } from "react";
import { Check, ChevronsUpDown, Building2, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Barber {
  id: string;
  name: string;
  unit_name: string;
  today_subscriptions: number;
}

interface BarberComboboxProps {
  organizationId: string;
  value: string | null;
  onChange: (barberId: string | null) => void;
  placeholder?: string;
  allowReception?: boolean;
  disabled?: boolean;
}

export default function BarberCombobox({
  organizationId,
  value,
  onChange,
  placeholder = "Selecionar barbeiro...",
  allowReception = true,
  disabled = false,
}: BarberComboboxProps) {
  const [open, setOpen] = useState(false);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (organizationId) {
      fetchBarbers();
    }
  }, [organizationId]);

  const fetchBarbers = async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];

    try {
      // Buscar barbeiros
      const { data: barbersData, error: barbersError } = await supabase
        .from("barbers")
        .select("id, name, units(name)")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("name");

      if (barbersError) throw barbersError;

      // Buscar assinaturas de hoje
      const { data: subscriptionsData } = await supabase
        .from("sale_transactions")
        .select("barber_id")
        .eq("organization_id", organizationId)
        .eq("item_type", "subscription")
        .gte("created_at", today)
        .lte("created_at", today + "T23:59:59");

      // Contar assinaturas por barbeiro
      const subscriptionCounts: Record<string, number> = {};
      (subscriptionsData || []).forEach((tx) => {
        if (tx.barber_id) {
          subscriptionCounts[tx.barber_id] = (subscriptionCounts[tx.barber_id] || 0) + 1;
        }
      });

      const formattedBarbers: Barber[] = (barbersData || []).map((b) => ({
        id: b.id,
        name: b.name,
        unit_name: (b.units as any)?.name || "Sem unidade",
        today_subscriptions: subscriptionCounts[b.id] || 0,
      }));

      setBarbers(formattedBarbers);
    } catch (error) {
      console.error("Error fetching barbers:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBarbers = useMemo(() => {
    if (!search.trim()) return barbers;
    const query = search.toLowerCase();
    return barbers.filter(
      (b) =>
        b.name.toLowerCase().includes(query) ||
        b.unit_name.toLowerCase().includes(query)
    );
  }, [barbers, search]);

  const selectedBarber = barbers.find((b) => b.id === value);
  const isReception = value === null && allowReception;

  const displayText = selectedBarber
    ? selectedBarber.name
    : isReception && value === null
    ? "🏢 Recepção / Loja"
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          <span className="truncate">{displayText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar barbeiro..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Carregando..." : "Nenhum barbeiro encontrado."}
            </CommandEmpty>
            {allowReception && (
              <CommandGroup heading="Opções">
                <CommandItem
                  value="reception"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === null ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Recepção / Loja</span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Barbeiros">
              {filteredBarbers.map((barber) => (
                <CommandItem
                  key={barber.id}
                  value={barber.id}
                  onSelect={() => {
                    onChange(barber.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === barber.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{barber.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {barber.unit_name}
                      </span>
                      {barber.today_subscriptions > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-warning font-medium">
                          <Crown className="w-3 h-3" />
                          {barber.today_subscriptions}
                        </span>
                      )}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
