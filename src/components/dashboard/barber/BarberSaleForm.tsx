import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, DollarSign, Scissors, ShoppingBag, Hash, Check, Zap, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface BarberSaleFormProps {
  barberId: string;
  organizationId: string;
  onSuccess: () => void;
}

interface CatalogItem {
  id: string;
  name: string;
  default_price: number;
  fixed_commission: number | null;
  type: "service" | "product";
  category?: string; // 'basic' | 'extra' para serviços
}

// Correção do bug do zero à esquerda
function handleNumericInput(
  currentValue: string,
  newValue: string,
  setter: (v: string) => void
) {
  const cleaned = newValue.replace(/[^\d,.\-]/g, "");
  if ((currentValue === "0" || currentValue === "0,00") && /^\d/.test(cleaned)) {
    const withoutLeadingZeros = cleaned.replace(/^0+(?=\d)/, "");
    setter(withoutLeadingZeros || cleaned);
    return;
  }
  setter(cleaned);
}

export default function BarberSaleForm({ barberId, organizationId, onSuccess }: BarberSaleFormProps) {
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"services" | "products" | "manual">("services");
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [customPrice, setCustomPrice] = useState("0");
  
  // Campos do modo manual
  const [manualValue, setManualValue] = useState("0");
  const [manualCategory, setManualCategory] = useState<"basic" | "extra" | "product">("basic");

  // Buscar catálogo da organização
  useEffect(() => {
    const fetchCatalog = async () => {
      setLoadingCatalog(true);
      
      const [servicesRes, productsRes] = await Promise.all([
        supabase
          .from("catalog_services")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("catalog_products")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name"),
      ]);

      const services: CatalogItem[] = (servicesRes.data || []).map((s) => ({
        id: s.id,
        name: s.name,
        default_price: s.default_price,
        fixed_commission: s.fixed_commission,
        type: "service",
        category: s.category,
      }));

      const products: CatalogItem[] = (productsRes.data || []).map((p) => ({
        id: p.id,
        name: p.name,
        default_price: p.default_price,
        fixed_commission: p.fixed_commission,
        type: "product",
      }));

      setCatalogItems([...services, ...products]);
      setLoadingCatalog(false);
    };

    fetchCatalog();
  }, [organizationId]);

  // Filtrar itens baseado na busca e aba ativa
  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return catalogItems.filter((item) => {
      const matchesSearch = !query || item.name.toLowerCase().includes(query);
      const matchesTab =
        (activeTab === "services" && item.type === "service") ||
        (activeTab === "products" && item.type === "product");
      return matchesSearch && matchesTab;
    });
  }, [catalogItems, searchQuery, activeTab]);

  const handleSelectItem = (item: CatalogItem) => {
    setSelectedItem(item);
    setCustomPrice(item.default_price.toString());
  };

  const handleConfirmCatalogSale = async () => {
    if (!selectedItem) {
      toast.error("Selecione um item do catálogo");
      return;
    }

    const price = parseFloat(customPrice.replace(",", ".")) || 0;
    if (price <= 0) {
      toast.error("Informe um valor válido");
      return;
    }

    setLoading(true);
    const todayStr = format(new Date(), "yyyy-MM-dd");

    try {
      // 1. Garantir que existe um registro de daily_productions para hoje
      let dailyProductionId: string;

      const { data: existingProd } = await supabase
        .from("daily_productions")
        .select("id, clients_count")
        .eq("barber_id", barberId)
        .eq("date", todayStr)
        .maybeSingle();

      if (existingProd) {
        dailyProductionId = existingProd.id;
        // Incrementar clients_count
        await supabase
          .from("daily_productions")
          .update({ clients_count: (existingProd.clients_count || 0) + 1 })
          .eq("id", existingProd.id);
      } else {
        // Criar novo registro
        const { data: newProd, error: insertError } = await supabase
          .from("daily_productions")
          .insert({
            barber_id: barberId,
            organization_id: organizationId,
            date: todayStr,
            services_basic_total: 0,
            services_extra_total: 0,
            products_total: 0,
            services_total: 0,
            clients_count: 1,
            services_count: 0,
            products_count: 0,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        dailyProductionId = newProd.id;
      }

      // 2. Inserir transação de venda (trigger calcula comissão híbrida)
      const { error: txError } = await supabase.from("sale_transactions").insert({
        barber_id: barberId,
        organization_id: organizationId,
        daily_production_id: dailyProductionId,
        item_type: selectedItem.type,
        item_name: selectedItem.name,
        price_sold: price,
        service_category: selectedItem.type === "service" ? selectedItem.category : null,
        catalog_service_id: selectedItem.type === "service" ? selectedItem.id : null,
        catalog_product_id: selectedItem.type === "product" ? selectedItem.id : null,
        commission_rate_used: 0, // Trigger vai calcular
        commission_amount: 0, // Trigger vai calcular
      });

      if (txError) throw txError;

      toast.success(`${selectedItem.name} registrado com sucesso!`, {
        description: `R$ ${price.toFixed(2)}`,
      });

      // Limpar seleção
      setSelectedItem(null);
      setCustomPrice("0");
      onSuccess();
    } catch (error: any) {
      console.error("Erro ao registrar venda:", error);
      toast.error(error.message || "Erro ao registrar venda");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmManualSale = async () => {
    const value = parseFloat(manualValue.replace(",", ".")) || 0;
    if (value <= 0) {
      toast.error("Informe um valor válido");
      return;
    }

    setLoading(true);
    const todayStr = format(new Date(), "yyyy-MM-dd");

    try {
      // Buscar produção existente
      const { data: existingProd } = await supabase
        .from("daily_productions")
        .select("*")
        .eq("barber_id", barberId)
        .eq("date", todayStr)
        .maybeSingle();

      const updates = {
        barber_id: barberId,
        organization_id: organizationId,
        date: todayStr,
        services_basic_total: (existingProd?.services_basic_total || 0) + (manualCategory === "basic" ? value : 0),
        services_extra_total: (existingProd?.services_extra_total || 0) + (manualCategory === "extra" ? value : 0),
        products_total: (existingProd?.products_total || 0) + (manualCategory === "product" ? value : 0),
        clients_count: (existingProd?.clients_count || 0) + 1,
        services_count: (existingProd?.services_count || 0) + (manualCategory !== "product" ? 1 : 0),
        products_count: (existingProd?.products_count || 0) + (manualCategory === "product" ? 1 : 0),
      };

      const { error } = await supabase
        .from("daily_productions")
        .upsert(updates, { onConflict: "date,barber_id" });

      if (error) throw error;

      const categoryLabel = manualCategory === "basic" ? "Serviço Básico" : manualCategory === "extra" ? "Serviço Extra" : "Produto";
      toast.success(`${categoryLabel} registrado!`, {
        description: `R$ ${value.toFixed(2)}`,
      });

      setManualValue("0");
      onSuccess();
    } catch (error: any) {
      console.error("Erro ao registrar venda manual:", error);
      toast.error(error.message || "Erro ao registrar venda");
    } finally {
      setLoading(false);
    }
  };

  const servicesCount = catalogItems.filter((i) => i.type === "service").length;
  const productsCount = catalogItems.filter((i) => i.type === "product").length;

  return (
    <Card className="bg-card border-border shadow-card-custom">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-primary" />
          REGISTRAR VENDA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Barra de Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="🔍 Buscar serviço ou produto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Abas */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="services" className="flex items-center gap-1.5">
              <Scissors className="w-4 h-4" />
              Serviços
              {servicesCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {servicesCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4" />
              Produtos
              {productsCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {productsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-1.5">
              <Hash className="w-4 h-4" />
              Manual
            </TabsTrigger>
          </TabsList>

          {/* Conteúdo de Serviços e Produtos */}
          <TabsContent value="services" className="mt-4">
            {loadingCatalog ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? "Nenhum serviço encontrado" : "Nenhum serviço cadastrado"}
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {filteredItems.map((item) => (
                  <CatalogCard
                    key={item.id}
                    item={item}
                    isSelected={selectedItem?.id === item.id}
                    onSelect={() => handleSelectItem(item)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="products" className="mt-4">
            {loadingCatalog ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchQuery ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {filteredItems.map((item) => (
                  <CatalogCard
                    key={item.id}
                    item={item}
                    isSelected={selectedItem?.id === item.id}
                    onSelect={() => handleSelectItem(item)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Modo Manual */}
          <TabsContent value="manual" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={manualCategory} onValueChange={(v) => setManualCategory(v as typeof manualCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Serviço Básico</SelectItem>
                  <SelectItem value="extra">Serviço Extra</SelectItem>
                  <SelectItem value="product">Produto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={manualValue}
                onChange={(e) => handleNumericInput(manualValue, e.target.value, setManualValue)}
                placeholder="0,00"
                className="text-lg font-bold text-center"
              />
            </div>

            <Button
              className="w-full"
              onClick={handleConfirmManualSale}
              disabled={loading || parseFloat(manualValue.replace(",", ".")) <= 0}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Confirmar Venda Manual"
              )}
            </Button>
          </TabsContent>
        </Tabs>

        {/* Resumo e Confirmação (modo catálogo) */}
        {activeTab !== "manual" && selectedItem && (
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Item Selecionado:</p>
                <p className="font-bold text-foreground">{selectedItem.name}</p>
              </div>
              {selectedItem.fixed_commission && (
                <Badge className="bg-warning/20 text-warning border-warning/30">
                  <Zap className="w-3 h-3 mr-1" />
                  {selectedItem.fixed_commission}%
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <Label>Valor Final (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={customPrice}
                onChange={(e) => handleNumericInput(customPrice, e.target.value, setCustomPrice)}
                className="text-lg font-bold text-center"
              />
            </div>

            <Button
              className="w-full"
              onClick={handleConfirmCatalogSale}
              disabled={loading || parseFloat(customPrice.replace(",", ".")) <= 0}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Confirmar Venda
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Componente de Card do Catálogo
interface CatalogCardProps {
  item: CatalogItem;
  isSelected: boolean;
  onSelect: () => void;
}

function CatalogCard({ item, isSelected, onSelect }: CatalogCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all duration-200",
        "hover:shadow-md active:scale-[0.98]",
        isSelected
          ? "border-primary bg-primary/10 shadow-md"
          : "border-border bg-secondary hover:border-primary/50"
      )}
    >
      {/* Checkmark de seleção */}
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-primary-foreground" />
        </div>
      )}

      {/* Badge de categoria (serviços) */}
      {item.type === "service" && item.category && (
        <Badge
          variant="outline"
          className={cn(
            "absolute top-2 left-2 text-[10px] px-1.5",
            item.category === "basic" ? "border-primary/50 text-primary" : "border-accent-foreground/50 text-accent-foreground"
          )}
        >
          {item.category === "basic" ? "Básico" : "Extra"}
        </Badge>
      )}

      {/* Nome */}
      <p className="font-bold text-sm text-center mt-2 line-clamp-2">{item.name}</p>

      {/* Preço */}
      <p className="text-primary font-bold text-lg mt-1">
        R$ {item.default_price.toFixed(2).replace(".", ",")}
      </p>

      {/* Badge de comissão fixa */}
      {item.fixed_commission && (
        <Badge className="mt-2 bg-warning/20 text-warning border-warning/30 text-[10px]">
          <Zap className="w-3 h-3 mr-0.5" />
          {item.fixed_commission}%
        </Badge>
      )}
    </button>
  );
}
