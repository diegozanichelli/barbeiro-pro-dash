import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Zap, Search, Scissors, Package } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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

type SaleMode = "catalog" | "manual";
type ManualSaleType = "basic" | "extra" | "product";

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
  
  // Manual sale state
  const [saleMode, setSaleMode] = useState<SaleMode>("catalog");
  const [manualValue, setManualValue] = useState("");
  const [manualSaleType, setManualSaleType] = useState<ManualSaleType>("basic");
  const [clientsCount, setClientsCount] = useState("1");

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
    setManualSaleType("basic");
    setClientsCount("1");
    setSearchQuery("");
    setSaleMode("catalog");
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  const handleSelectItem = (item: CatalogItem) => {
    setSelectedItem(item);
    setCustomPrice(item.default_price.toString());
  };

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

      if (saleMode === "catalog" && selectedItem) {
        // Insert sale transaction (triggers will handle commission and sync)
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
          commission_rate_used: 0, // Will be calculated by trigger
          commission_amount: 0, // Will be calculated by trigger
        });

        if (error) throw error;

        // Update clients count
        const numericClients = parseInt(clientsCount) || 1;
        await supabase
          .from("daily_productions")
          .update({ clients_count: supabase.rpc ? numericClients : numericClients })
          .eq("id", productionId);
        
        // Increment clients_count properly
        const { data: currentProd } = await supabase
          .from("daily_productions")
          .select("clients_count")
          .eq("id", productionId)
          .single();
        
        if (currentProd) {
          await supabase
            .from("daily_productions")
            .update({ clients_count: (currentProd.clients_count || 0) + numericClients })
            .eq("id", productionId);
        }

        toast.success(`${selectedItem.name} registrado para ${barberName}`);
      } else {
        // Manual sale - use existing legacy flow
        const numericValue = parseFloat(manualValue.replace(",", "."));
        const numericClients = parseInt(clientsCount) || 1;

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
            clients_count: existingProd.clients_count + numericClients,
          };

          if (manualSaleType === "basic") {
            updateData.services_basic_total =
              (existingProd.services_basic_total || 0) + numericValue;
            updateData.services_count = existingProd.services_count + 1;
          } else if (manualSaleType === "extra") {
            updateData.services_extra_total =
              (existingProd.services_extra_total || 0) + numericValue;
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

  const filteredItems = catalogItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const services = filteredItems.filter((item) => item.type === "service");
  const products = filteredItems.filter((item) => item.type === "product");

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Venda Rápida - {barberName}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={saleMode} onValueChange={(v) => setSaleMode(v as SaleMode)} className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="catalog">Catálogo</TabsTrigger>
            <TabsTrigger value="manual">Venda Manual</TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 mt-4">
            <TabsContent value="catalog" className="flex-1 m-0">
              {loadingCatalog ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : catalogItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="mx-auto h-12 w-12 mb-4" />
                  <p>Nenhum item no catálogo.</p>
                  <p className="text-sm">Cadastre serviços e produtos na aba Catálogo.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar item..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <ScrollArea className="h-[200px] rounded-md border p-2">
                    {services.length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                          <Scissors className="h-4 w-4" />
                          Serviços
                        </div>
                        <div className="space-y-1">
                          {services.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectItem(item)}
                              className={cn(
                                "w-full flex items-center justify-between p-2 rounded-md text-left transition-colors",
                                selectedItem?.id === item.id
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-muted"
                              )}
                            >
                              <span className="font-medium">{item.name}</span>
                              <div className="flex items-center gap-2">
                                {item.fixed_commission !== null && (
                                  <Zap className="h-4 w-4 text-amber-500" />
                                )}
                                <span>{formatCurrency(item.default_price)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {products.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                          <Package className="h-4 w-4" />
                          Produtos
                        </div>
                        <div className="space-y-1">
                          {products.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectItem(item)}
                              className={cn(
                                "w-full flex items-center justify-between p-2 rounded-md text-left transition-colors",
                                selectedItem?.id === item.id
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-muted"
                              )}
                            >
                              <span className="font-medium">{item.name}</span>
                              <div className="flex items-center gap-2">
                                {item.fixed_commission !== null && (
                                  <Zap className="h-4 w-4 text-amber-500" />
                                )}
                                <span>{formatCurrency(item.default_price)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </ScrollArea>

                  {selectedItem && (
                    <div className="space-y-3 rounded-lg border p-3 bg-muted/50">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{selectedItem.name}</span>
                        {selectedItem.fixed_commission !== null && (
                          <div className="flex items-center gap-1 text-amber-600 text-sm">
                            <Zap className="h-4 w-4" />
                            <span>{selectedItem.fixed_commission}% fixa</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="customPrice">Valor (R$)</Label>
                        <Input
                          id="customPrice"
                          type="text"
                          inputMode="decimal"
                          value={customPrice}
                          onChange={(e) => setCustomPrice(e.target.value)}
                          className="text-lg font-bold"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual" className="flex-1 m-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="manualValue">Valor (R$)</Label>
                  <Input
                    id="manualValue"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                    className="text-xl font-bold text-center h-12"
                  />
                </div>

                <div className="space-y-3">
                  <Label>Tipo de Venda</Label>
                  <RadioGroup
                    value={manualSaleType}
                    onValueChange={(v) => setManualSaleType(v as ManualSaleType)}
                    className="grid grid-cols-3 gap-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="basic" id="basic" />
                      <Label htmlFor="basic" className="cursor-pointer text-sm">
                        Serviço Básico
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="extra" id="extra" />
                      <Label htmlFor="extra" className="cursor-pointer text-sm">
                        Serviço Extra
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="product" id="product" />
                      <Label htmlFor="product" className="cursor-pointer text-sm">
                        Produto
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </TabsContent>

            <div className="space-y-4 mt-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="clients">Clientes Atendidos</Label>
                <Input
                  id="clients"
                  type="number"
                  min="1"
                  value={clientsCount}
                  onChange={(e) => setClientsCount(e.target.value)}
                  className="w-24"
                />
              </div>

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
                  disabled={
                    isLoading ||
                    (saleMode === "catalog" && !selectedItem) ||
                    (saleMode === "manual" && !manualValue)
                  }
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Registrar"
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
