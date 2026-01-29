import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, Scissors, Package, Zap, Hash, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface QuickSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberId: string;
  barberName: string;
  organizationId: string;
  onSuccess: () => void;
}

interface CatalogItem {
  id: string;
  name: string;
  default_price: number;
  fixed_commission: number | null;
  category?: string;
  type: "service" | "product";
}

type CategoryTab = "services" | "products" | "manual";

/**
 * Handle numeric input to fix "leading zero" bug
 * When value is "0" and user types "5", result should be "5" not "05"
 */
function handleNumericInput(
  currentValue: string,
  newValue: string,
  setter: (value: string) => void
) {
  // Allow empty string
  if (newValue === "") {
    setter("");
    return;
  }

  // Remove non-numeric characters except comma and period
  const cleaned = newValue.replace(/[^\d,.\-]/g, "");
  
  // If current value is "0" or "0,00" and new value starts with a digit, replace it
  if ((currentValue === "0" || currentValue === "0,00") && /^\d/.test(cleaned)) {
    // Remove leading zeros from the new value
    const withoutLeadingZeros = cleaned.replace(/^0+(?=\d)/, "");
    setter(withoutLeadingZeros || cleaned);
    return;
  }

  setter(cleaned);
}

export default function QuickSaleModal({
  open,
  onOpenChange,
  barberId,
  barberName,
  organizationId,
  onSuccess,
}: QuickSaleModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [customPrice, setCustomPrice] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("services");
  
  // Manual sale state
  const [manualValue, setManualValue] = useState("");
  const [manualCategory, setManualCategory] = useState<"basic" | "extra" | "product">("basic");

  // Fetch catalog items
  useEffect(() => {
    if (open && organizationId) {
      fetchCatalog();
    }
  }, [open, organizationId]);

  const fetchCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const [servicesRes, productsRes] = await Promise.all([
        supabase
          .from("catalog_services")
          .select("id, name, default_price, fixed_commission, category")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("catalog_products")
          .select("id, name, default_price, fixed_commission")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name"),
      ]);

      const services: CatalogItem[] = (servicesRes.data || []).map((s) => ({
        ...s,
        type: "service" as const,
      }));
      const products: CatalogItem[] = (productsRes.data || []).map((p) => ({
        ...p,
        type: "product" as const,
      }));

      setCatalogItems([...services, ...products]);
    } catch (error) {
      console.error("Error fetching catalog:", error);
    } finally {
      setLoadingCatalog(false);
    }
  };

  const resetForm = () => {
    setSelectedItem(null);
    setCustomPrice("");
    setManualValue("");
    setManualCategory("basic");
    setSearchQuery("");
    setActiveTab("services");
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  const handleSelectItem = (item: CatalogItem) => {
    if (selectedItem?.id === item.id) {
      setSelectedItem(null);
      setCustomPrice("");
    } else {
      setSelectedItem(item);
      setCustomPrice(item.default_price.toString());
    }
  };

  // Filter items based on search and active tab
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

  const services = catalogItems.filter((item) => item.type === "service");
  const products = catalogItems.filter((item) => item.type === "product");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const today = new Date().toISOString().split("T")[0];

      // Get or create daily_production
      let productionId: string;
      const { data: existingProduction } = await supabase
        .from("daily_productions")
        .select("id")
        .eq("barber_id", barberId)
        .eq("date", today)
        .single();

      if (existingProduction) {
        productionId = existingProduction.id;
      } else {
        const { data: newProduction, error: createError } = await supabase
          .from("daily_productions")
          .insert({
            barber_id: barberId,
            organization_id: organizationId,
            date: today,
            clients_count: 0,
            services_count: 0,
            products_count: 0,
            services_basic_total: 0,
            services_extra_total: 0,
            products_total: 0,
          })
          .select("id")
          .single();

        if (createError) throw createError;
        productionId = newProduction.id;
      }

      if (activeTab !== "manual" && selectedItem) {
        // Catalog sale - insert into sale_transactions
        const price = parseFloat(customPrice.replace(",", "."));
        if (isNaN(price) || price <= 0) {
          toast.error("Informe um valor válido");
          setIsLoading(false);
          return;
        }

        const { error } = await supabase.from("sale_transactions").insert({
          organization_id: organizationId,
          barber_id: barberId,
          daily_production_id: productionId,
          item_type: selectedItem.type,
          catalog_service_id: selectedItem.type === "service" ? selectedItem.id : null,
          catalog_product_id: selectedItem.type === "product" ? selectedItem.id : null,
          item_name: selectedItem.name,
          service_category: selectedItem.type === "service" ? selectedItem.category : null,
          price_sold: price,
          commission_rate_used: 0,
          commission_amount: 0,
        });

        if (error) throw error;

        // Increment clients_count
        const { data: currentProd } = await supabase
          .from("daily_productions")
          .select("clients_count")
          .eq("id", productionId)
          .single();
        
        if (currentProd) {
          await supabase
            .from("daily_productions")
            .update({ clients_count: (currentProd.clients_count || 0) + 1 })
            .eq("id", productionId);
        }

        toast.success(`${selectedItem.name} registrado para ${barberName}`);
      } else {
        // Manual sale - legacy flow
        const numericValue = parseFloat(manualValue.replace(",", "."));

        if (isNaN(numericValue) || numericValue <= 0) {
          toast.error("Informe um valor válido");
          setIsLoading(false);
          return;
        }

        const { data: existingProd } = await supabase
          .from("daily_productions")
          .select("*")
          .eq("id", productionId)
          .single();

        if (existingProd) {
          const updateData: Record<string, number> = {
            clients_count: existingProd.clients_count + 1,
          };

          if (manualCategory === "basic") {
            updateData.services_basic_total = (existingProd.services_basic_total || 0) + numericValue;
            updateData.services_count = existingProd.services_count + 1;
          } else if (manualCategory === "extra") {
            updateData.services_extra_total = (existingProd.services_extra_total || 0) + numericValue;
            updateData.services_count = existingProd.services_count + 1;
          } else {
            updateData.products_total = existingProd.products_total + numericValue;
            updateData.products_count = existingProd.products_count + 1;
          }

          const { error } = await supabase
            .from("daily_productions")
            .update(updateData)
            .eq("id", productionId);

          if (error) throw error;
        }

        toast.success(`Venda manual registrada para ${barberName}`);
      }

      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error registering sale:", error);
      toast.error("Erro ao registrar venda");
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const canSubmit = 
    (activeTab !== "manual" && selectedItem && customPrice) ||
    (activeTab === "manual" && manualValue);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg font-semibold">
            Venda Rápida — {barberName}
          </DialogTitle>
        </DialogHeader>

        {/* Search Bar */}
        <div className="px-6 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar serviço ou produto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11"
              autoFocus
            />
          </div>
        </div>

        {/* Category Tabs */}
        <Tabs 
          value={activeTab} 
          onValueChange={(v) => {
            setActiveTab(v as CategoryTab);
            setSelectedItem(null);
            setCustomPrice("");
          }}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-3 h-12">
              <TabsTrigger value="services" className="gap-2 text-sm">
                <Scissors className="h-4 w-4" />
                Serviços
                {services.length > 0 && (
                  <span className="text-xs bg-muted-foreground/20 px-1.5 py-0.5 rounded">
                    {services.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="products" className="gap-2 text-sm">
                <Package className="h-4 w-4" />
                Produtos
                {products.length > 0 && (
                  <span className="text-xs bg-muted-foreground/20 px-1.5 py-0.5 rounded">
                    {products.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="manual" className="gap-2 text-sm">
                <Hash className="h-4 w-4" />
                Manual
              </TabsTrigger>
            </TabsList>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            {/* Services Grid */}
            <TabsContent value="services" className="flex-1 m-0 overflow-hidden">
              {loadingCatalog ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Scissors className="h-12 w-12 mb-4 opacity-50" />
                  <p className="font-medium">
                    {searchQuery ? "Nenhum serviço encontrado" : "Nenhum serviço cadastrado"}
                  </p>
                  <p className="text-sm mt-1">
                    {searchQuery ? "Tente outro termo de busca" : "Cadastre serviços na aba Catálogo"}
                  </p>
                </div>
              ) : (
                <ScrollArea className="flex-1 px-6 py-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {filteredItems.map((item) => (
                      <CatalogCard
                        key={item.id}
                        item={item}
                        isSelected={selectedItem?.id === item.id}
                        onSelect={() => handleSelectItem(item)}
                        formatCurrency={formatCurrency}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            {/* Products Grid */}
            <TabsContent value="products" className="flex-1 m-0 overflow-hidden">
              {loadingCatalog ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mb-4 opacity-50" />
                  <p className="font-medium">
                    {searchQuery ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
                  </p>
                  <p className="text-sm mt-1">
                    {searchQuery ? "Tente outro termo de busca" : "Cadastre produtos na aba Catálogo"}
                  </p>
                </div>
              ) : (
                <ScrollArea className="flex-1 px-6 py-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {filteredItems.map((item) => (
                      <CatalogCard
                        key={item.id}
                        item={item}
                        isSelected={selectedItem?.id === item.id}
                        onSelect={() => handleSelectItem(item)}
                        formatCurrency={formatCurrency}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            {/* Manual Entry */}
            <TabsContent value="manual" className="flex-1 m-0 px-6 py-4">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="manualValue" className="text-sm font-medium">
                    Valor (R$)
                  </Label>
                  <Input
                    id="manualValue"
                    type="text"
                    inputMode="decimal"
                    placeholder="Digite o valor..."
                    value={manualValue}
                    onChange={(e) => handleNumericInput(manualValue, e.target.value, setManualValue)}
                    className="text-2xl font-bold text-center h-14"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Categoria</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "basic", label: "Serviço Básico", icon: Scissors },
                      { value: "extra", label: "Serviço Extra", icon: Zap },
                      { value: "product", label: "Produto", icon: Package },
                    ].map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setManualCategory(value as typeof manualCategory)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                          manualCategory === value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-muted-foreground/50"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-xs font-medium text-center">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Footer */}
            <div className="border-t px-6 py-4 space-y-4 bg-muted/30">
              {/* Selected Item Summary */}
              {selectedItem && activeTab !== "manual" && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      {selectedItem.type === "service" ? (
                        <Scissors className="h-5 w-5 text-primary" />
                      ) : (
                        <Package className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{selectedItem.name}</p>
                      {selectedItem.fixed_commission !== null && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          {selectedItem.fixed_commission}% comissão fixa
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={customPrice}
                      onChange={(e) => handleNumericInput(customPrice, e.target.value, setCustomPrice)}
                      className="w-24 text-right font-bold"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleClose(false)}
                  className="flex-1"
                  disabled={isLoading}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading || !canSubmit}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Confirmar Venda"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Catalog Card Component
interface CatalogCardProps {
  item: CatalogItem;
  isSelected: boolean;
  onSelect: () => void;
  formatCurrency: (value: number) => string;
}

function CatalogCard({ item, isSelected, onSelect, formatCurrency }: CatalogCardProps) {
  return (
    <Card
      onClick={onSelect}
      className={cn(
        "relative cursor-pointer p-4 transition-all duration-200 hover:shadow-lg active:scale-[0.98]",
        isSelected
          ? "ring-2 ring-primary bg-primary/10 shadow-lg border-primary"
          : "hover:bg-accent/50 hover:border-primary/30"
      )}
    >
      {/* Fixed Commission Badge */}
      {item.fixed_commission !== null && (
        <Badge 
          variant="secondary" 
          className="absolute -top-2 -right-2 bg-amber-500 text-white border-0 shadow-md"
        >
          <Zap className="h-3 w-3 mr-0.5" />
          {item.fixed_commission}%
        </Badge>
      )}
      
      <div className="space-y-2">
        <p className="font-bold text-sm leading-tight line-clamp-2 text-foreground">
          {item.name}
        </p>
        <p className="text-xl font-black text-primary">
          {formatCurrency(item.default_price)}
        </p>
        {item.category && (
          <Badge 
            variant={item.category === "basic" ? "secondary" : "default"}
            className="text-xs"
          >
            {item.category === "basic" ? "Básico" : "Extra"}
          </Badge>
        )}
      </div>
      
      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute bottom-2 right-2">
          <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-md">
            <Check className="h-4 w-4 text-primary-foreground" strokeWidth={3} />
          </div>
        </div>
      )}
    </Card>
  );
}
