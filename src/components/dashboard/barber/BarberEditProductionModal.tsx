import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, Scissors, Package, Zap, Check, Minus, Plus, ShoppingCart, Trash2, Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import DivergenceModal from "./DivergenceModal";

interface BarberEditProductionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberId: string;
  organizationId: string;
  productionId: string;
  productionDate: string;
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

interface CartItem extends CatalogItem {
  customPrice: number;
  customPriceInput: string;
  quantity: number;
}

interface ExistingProduction {
  services_basic_total: number;
  services_extra_total: number;
  products_total: number;
  clients_count: number;
  services_count: number;
  products_count: number;
  tx_basic_total: number;
  tx_extra_total: number;
  tx_products_total: number;
}

type CategoryTab = "services" | "products";

export default function BarberEditProductionModal({
  open,
  onOpenChange,
  barberId,
  organizationId,
  productionId,
  productionDate,
  onSuccess,
}: BarberEditProductionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("services");
  
  // Estado dos dados existentes
  const [existingData, setExistingData] = useState<ExistingProduction | null>(null);
  
  // Cart state (multi-select)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientsCount, setClientsCount] = useState(1);

  // Divergence modal
  const [divergenceModal, setDivergenceModal] = useState<{
    open: boolean;
    manualTotal: number;
    txTotal: number;
    hasDivergence: boolean;
  }>({ open: false, manualTotal: 0, txTotal: 0, hasDivergence: false });

  // Fetch catalog items and existing production data when modal opens
  useEffect(() => {
    if (open && organizationId && productionId) {
      fetchData();
    }
  }, [open, organizationId, productionId]);

  const fetchData = async () => {
    setLoadingCatalog(true);
    
    try {
      const [servicesRes, productsRes, productionRes] = await Promise.all([
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
        supabase
          .from("daily_productions")
          .select("services_basic_total, services_extra_total, products_total, clients_count, services_count, products_count, tx_basic_total, tx_extra_total, tx_products_total")
          .eq("id", productionId)
          .single(),
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
      
      // Carregar dados existentes
      if (productionRes.data) {
        const data = productionRes.data;
        setExistingData({
          services_basic_total: data.services_basic_total || 0,
          services_extra_total: data.services_extra_total || 0,
          products_total: data.products_total || 0,
          clients_count: data.clients_count || 0,
          services_count: data.services_count || 0,
          products_count: data.products_count || 0,
          tx_basic_total: data.tx_basic_total || 0,
          tx_extra_total: data.tx_extra_total || 0,
          tx_products_total: data.tx_products_total || 0,
        });
        // Inicializar contador de clientes com o valor existente
        setClientsCount(data.clients_count || 1);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoadingCatalog(false);
    }
  };

  const resetForm = () => {
    setCart([]);
    setClientsCount(1);
    setSearchQuery("");
    setActiveTab("services");
    setExistingData(null);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  // Cart operations
  const handleToggleCart = (item: CatalogItem) => {
    setCart(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) {
        return prev.filter(i => i.id !== item.id);
      } else {
        return [...prev, { 
          ...item, 
          customPrice: item.default_price, 
          customPriceInput: item.default_price.toFixed(2).replace(".", ","),
          quantity: 1 
        }];
      }
    });
  };

  const isInCart = (itemId: string) => cart.some(i => i.id === itemId);

  const updateCartItemQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const updateCartItemPriceInput = (itemId: string, newValue: string) => {
    setCart(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      
      let cleanedValue = newValue;
      
      if (newValue === "") {
        cleanedValue = "";
      } else {
        const cleaned = newValue.replace(/[^\d,.\-]/g, "");
        if ((item.customPriceInput === "0" || item.customPriceInput === "0,00") && /^\d/.test(cleaned)) {
          cleanedValue = cleaned.replace(/^0+(?=\d)/, "") || cleaned;
        } else {
          cleanedValue = cleaned;
        }
      }
      
      const parsed = parseFloat(cleanedValue.replace(",", ".")) || 0;
      
      return { 
        ...item, 
        customPriceInput: cleanedValue,
        customPrice: parsed
      };
    }));
  };

  const finalizeCartItemPrice = (itemId: string) => {
    setCart(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      
      const formattedInput = item.customPrice > 0 
        ? item.customPrice.toFixed(2).replace(".", ",")
        : "0,00";
      
      return { ...item, customPriceInput: formattedInput };
    }));
  };

  // Cart totals
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.customPrice * item.quantity), 0);
  }, [cart]);

  const cartItemsTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Existing totals
  const existingTotal = useMemo(() => {
    if (!existingData) return 0;
    return existingData.services_basic_total + existingData.services_extra_total + existingData.products_total;
  }, [existingData]);

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
    
    if (cart.length === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    setIsLoading(true);

    try {
      // 1. Deletar transações antigas do BARBEIRO para esta produção
      const { error: deleteError } = await supabase
        .from("sale_transactions")
        .delete()
        .eq("daily_production_id", productionId)
        .eq("source", "barber");

      if (deleteError) {
        console.error("Erro ao limpar transações antigas:", deleteError);
        throw deleteError;
      }

      // 2. Criar novas transações itemizadas (source = 'barber')
      const transactions: any[] = [];
      
      cart.forEach(item => {
        for (let i = 0; i < item.quantity; i++) {
          transactions.push({
            organization_id: organizationId,
            barber_id: barberId,
            daily_production_id: productionId,
            item_name: item.name,
            item_type: item.type,
            service_category: item.category || null,
            catalog_service_id: item.type === "service" ? item.id : null,
            catalog_product_id: item.type === "product" ? item.id : null,
            price_sold: item.customPrice,
            commission_rate_used: 0, // Trigger calculará
            commission_amount: 0, // Trigger calculará
            source: "barber", // <- Nova coluna!
          });
        }
      });

      if (transactions.length > 0) {
        const { error: insertError } = await supabase
          .from("sale_transactions")
          .insert(transactions);

        if (insertError) {
          console.error("Erro ao inserir transações:", insertError);
          throw insertError;
        }
      }

      // 3. Atualizar clients_count manualmente (não vem das transações)
      const { error: updateError } = await supabase
        .from("daily_productions")
        .update({
          manual_clients_count: clientsCount,
          clients_count: clientsCount,
        })
        .eq("id", productionId);

      if (updateError) throw updateError;

      // Calcular totais para verificar divergência
      let servicesBasicTotal = 0;
      let servicesExtraTotal = 0;
      let productsTotal = 0;

      cart.forEach(item => {
        const itemTotal = item.customPrice * item.quantity;
        if (item.type === "product") {
          productsTotal += itemTotal;
        } else if (item.category === "extra") {
          servicesExtraTotal += itemTotal;
        } else {
          servicesBasicTotal += itemTotal;
        }
      });

      const manualTotal = servicesBasicTotal + servicesExtraTotal + productsTotal;

      // Buscar dados tx_* para comparação
      const txTotal = existingData 
        ? existingData.tx_basic_total + existingData.tx_extra_total + existingData.tx_products_total
        : 0;

      // Verificar divergência

      const divergenceThreshold = 0.05;
      let hasDivergence = false;

      if (txTotal > 0) {
        const percentDiff = Math.abs((manualTotal - txTotal) / txTotal);
        hasDivergence = percentDiff > divergenceThreshold;
      }

      // Mostrar modal de feedback
      if (txTotal > 0) {
        setDivergenceModal({
          open: true,
          manualTotal,
          txTotal,
          hasDivergence
        });
      } else {
        toast.success("Produção atualizada com sucesso!");
      }
      
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error updating production:", error);
      toast.error(error.message || "Erro ao atualizar produção");
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

  const formattedDate = format(new Date(productionDate + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-lg font-semibold">
              Editar Produção — {formattedDate}
            </DialogTitle>
            <DialogDescription>
              Selecione os itens que você realizou neste dia para substituir o lançamento atual
            </DialogDescription>
          </DialogHeader>

          {/* Resumo do lançamento atual */}
          {existingData && existingTotal > 0 && (
            <div className="px-6 pt-4">
              <Alert className="bg-muted/50 border-primary/20">
                <Info className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm">
                  <span className="font-semibold">Lançamento atual:</span>{" "}
                  <span className="text-primary font-bold">{formatCurrency(existingTotal)}</span>
                  <span className="text-muted-foreground ml-2">
                    (Básicos: {formatCurrency(existingData.services_basic_total)} • 
                    Extras: {formatCurrency(existingData.services_extra_total)} • 
                    Produtos: {formatCurrency(existingData.products_total)})
                  </span>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Selecione os itens abaixo para substituir este lançamento.
                  </span>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Search */}
          <div className="px-6 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar serviço ou produto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as CategoryTab)}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="px-6 pt-4">
              <TabsList className="grid w-full grid-cols-2 h-12">
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
                  </div>
                ) : (
                  <ScrollArea className="flex-1 px-6 py-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {filteredItems.map((item) => (
                        <CatalogCard
                          key={item.id}
                          item={item}
                          isSelected={isInCart(item.id)}
                          onSelect={() => handleToggleCart(item)}
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
                  </div>
                ) : (
                  <ScrollArea className="flex-1 px-6 py-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {filteredItems.map((item) => (
                        <CatalogCard
                          key={item.id}
                          item={item}
                          isSelected={isInCart(item.id)}
                          onSelect={() => handleToggleCart(item)}
                          formatCurrency={formatCurrency}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              {/* Footer */}
              <div className="border-t px-6 py-4 space-y-4 bg-muted/30">
                {/* Cart Summary */}
                {cart.length > 0 && (
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-background border text-sm">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="truncate font-medium">{item.name}</span>
                          {item.category && (
                            <Badge variant={item.category === "basic" ? "secondary" : "default"} className="shrink-0 text-[10px]">
                              {item.category === "basic" ? "Básico" : "Extra"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Quantity */}
                          <div className="flex items-center gap-1 bg-muted rounded-md border p-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => updateCartItemQuantity(item.id, -1)}
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-5 text-center font-bold text-xs">{item.quantity}x</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => updateCartItemQuantity(item.id, 1)}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          {/* Price */}
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={item.customPriceInput}
                            onChange={(e) => updateCartItemPriceInput(item.id, e.target.value)}
                            onBlur={() => finalizeCartItemPrice(item.id)}
                            className="w-20 text-right font-bold text-xs h-7"
                          />
                          {/* Remove */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => setCart(prev => prev.filter(i => i.id !== item.id))}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* Clients Counter */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
                      <Label className="text-sm font-medium">Quantidade de Clientes</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setClientsCount(c => Math.max(1, c - 1))}
                          disabled={clientsCount <= 1}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="w-8 text-center font-bold">{clientsCount}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setClientsCount(c => c + 1)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Comparação de valores */}
                    {existingTotal > 0 && (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                        <span className="text-muted-foreground">Anterior → Novo:</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground line-through">{formatCurrency(existingTotal)}</span>
                          <span className="font-bold text-primary">{formatCurrency(cartTotal)}</span>
                          {cartTotal !== existingTotal && (
                            <Badge variant={cartTotal > existingTotal ? "default" : "secondary"} className="text-xs">
                              {cartTotal > existingTotal ? "+" : ""}{formatCurrency(cartTotal - existingTotal)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state hint */}
                {cart.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Selecione os serviços e produtos realizados</p>
                  </div>
                )}

                {/* Submit Button */}
                <div className="flex items-center justify-between gap-4">
                  {cart.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ShoppingCart className="h-4 w-4" />
                      <span>{cartItemsTotal} {cartItemsTotal === 1 ? 'item' : 'itens'}</span>
                      <span className="font-bold text-foreground">{formatCurrency(cartTotal)}</span>
                    </div>
                  )}
                  <Button
                    type="submit"
                    disabled={isLoading || cart.length === 0}
                    className="ml-auto"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Salvar Alterações
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Tabs>
        </DialogContent>
      </Dialog>

      <DivergenceModal
        open={divergenceModal.open}
        onClose={() => setDivergenceModal(prev => ({ ...prev, open: false }))}
        manualTotal={divergenceModal.manualTotal}
        txTotal={divergenceModal.txTotal}
        hasDivergence={divergenceModal.hasDivergence}
      />
    </>
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
          className="absolute -top-2 -right-2 bg-warning text-warning-foreground border-0 shadow-md"
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
