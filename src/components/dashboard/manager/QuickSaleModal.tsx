import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, Scissors, Package, Zap, Hash, Check, Minus, Plus, ShoppingCart, Users, Crown, AlertCircle, Building2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import SubscriptionConfirmModal from "../barber/SubscriptionConfirmModal";

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

interface CartItem extends CatalogItem {
  customPrice: number;
  customPriceInput: string;
  quantity: number;
}

type CategoryTab = "services" | "products" | "manual";

/**
 * Handle numeric input to fix "leading zero" bug
 */
function handleNumericInput(
  currentValue: string,
  newValue: string,
  setter: (value: string) => void
) {
  if (newValue === "") {
    setter("");
    return;
  }
  const cleaned = newValue.replace(/[^\d,.\-]/g, "");
  if ((currentValue === "0" || currentValue === "0,00") && /^\d/.test(cleaned)) {
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
  const [activeTab, setActiveTab] = useState<CategoryTab>("services");
  
  // Cart state (multi-select)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientsCount, setClientsCount] = useState(1);
  
  // Manual sale state
  const [manualValue, setManualValue] = useState("");
  const [manualCategory, setManualCategory] = useState<"basic" | "extra" | "product">("basic");
  
  // Subscription modal
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [lastDailyProductionId, setLastDailyProductionId] = useState<string | null>(null);
  const [todaySubscriptionsCount, setTodaySubscriptionsCount] = useState(0);
  
  // Standalone subscription modal
  const [standaloneSubscriptionOpen, setStandaloneSubscriptionOpen] = useState(false);
  
  // Reception mode (no barber attribution)
  const [isReceptionSale, setIsReceptionSale] = useState(false);

  // Fetch catalog items
  useEffect(() => {
    if (open && organizationId) {
      fetchCatalog();
    }
  }, [open, organizationId, barberId]);

  const fetchCatalog = async () => {
    setLoadingCatalog(true);
    const today = format(new Date(), "yyyy-MM-dd");
    
    try {
      const [servicesRes, productsRes, subscriptionsRes] = await Promise.all([
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
          .from("sale_transactions")
          .select("id")
          .eq("barber_id", barberId)
          .eq("item_type", "subscription")
          .gte("created_at", today)
          .lte("created_at", today + "T23:59:59"),
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
      setTodaySubscriptionsCount(subscriptionsRes.data?.length || 0);
    } catch (error) {
      console.error("Error fetching catalog:", error);
    } finally {
      setLoadingCatalog(false);
    }
  };

  const resetForm = () => {
    setCart([]);
    setClientsCount(1);
    setManualValue("");
    setManualCategory("basic");
    setSearchQuery("");
    setActiveTab("services");
    setIsReceptionSale(false);
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
    
    if (activeTab === "manual") {
      await handleManualSale();
    } else {
      await handleCartCheckout();
    }
  };

  const handleCartCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    setIsLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const effectiveBarberId = isReceptionSale ? null : barberId;

    try {
      // Get or create daily_production (only if NOT reception sale)
      let productionId: string | null = null;
      
      if (!isReceptionSale) {
        const { data: existingProduction } = await supabase
          .from("daily_productions")
          .select("id, clients_count")
          .eq("barber_id", barberId)
          .eq("date", today)
          .single();

        if (existingProduction) {
          productionId = existingProduction.id;
          await supabase
            .from("daily_productions")
            .update({ clients_count: (existingProduction.clients_count || 0) + clientsCount })
            .eq("id", productionId);
        } else {
          const { data: newProduction, error: createError } = await supabase
            .from("daily_productions")
            .insert({
              barber_id: barberId,
              organization_id: organizationId,
              date: today,
              clients_count: clientsCount,
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
      }

      // Batch insert all transactions (expanded by quantity)
      const transactions: any[] = [];
      cart.forEach(item => {
        for (let i = 0; i < item.quantity; i++) {
          transactions.push({
            organization_id: organizationId,
            barber_id: effectiveBarberId,
            daily_production_id: productionId,
            item_type: item.type,
            catalog_service_id: item.type === "service" ? item.id : null,
            catalog_product_id: item.type === "product" ? item.id : null,
            item_name: item.name,
            service_category: item.type === "service" ? item.category : null,
            price_sold: item.customPrice,
            commission_rate_used: 0,
            commission_amount: 0,
          });
        }
      });

      const { error } = await supabase.from("sale_transactions").insert(transactions);
      if (error) throw error;

      const sellerName = isReceptionSale ? "Recepção / Loja" : barberName;
      toast.success(`${cartItemsTotal} ${cartItemsTotal === 1 ? 'item registrado' : 'itens registrados'} para ${sellerName}`, {
        description: `Total: R$ ${cartTotal.toFixed(2)} • ${clientsCount} ${clientsCount === 1 ? 'cliente' : 'clientes'}`,
      });

      // Save for subscription modal (only if not reception sale)
      if (!isReceptionSale) {
        setLastDailyProductionId(productionId);
        resetForm();
        onOpenChange(false);
        // Open subscription modal
        setSubscriptionModalOpen(true);
      } else {
        resetForm();
        onOpenChange(false);
        onSuccess();
      }
    } catch (error) {
      console.error("Error registering sale:", error);
      toast.error("Erro ao registrar venda");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSale = async () => {
    const numericValue = parseFloat(manualValue.replace(",", "."));
    if (isNaN(numericValue) || numericValue <= 0) {
      toast.error("Informe um valor válido");
      return;
    }

    setIsLoading(true);
    const today = new Date().toISOString().split("T")[0];

    try {
      let productionId: string;
      const { data: existingProduction } = await supabase
        .from("daily_productions")
        .select("*")
        .eq("barber_id", barberId)
        .eq("date", today)
        .single();

      if (existingProduction) {
        productionId = existingProduction.id;
        const updateData: Record<string, number> = {
          clients_count: existingProduction.clients_count + 1,
        };

        if (manualCategory === "basic") {
          updateData.services_basic_total = (existingProduction.services_basic_total || 0) + numericValue;
          updateData.services_count = existingProduction.services_count + 1;
        } else if (manualCategory === "extra") {
          updateData.services_extra_total = (existingProduction.services_extra_total || 0) + numericValue;
          updateData.services_count = existingProduction.services_count + 1;
        } else {
          updateData.products_total = existingProduction.products_total + numericValue;
          updateData.products_count = existingProduction.products_count + 1;
        }

        const { error } = await supabase
          .from("daily_productions")
          .update(updateData)
          .eq("id", productionId);

        if (error) throw error;
      } else {
        const insertData: any = {
          barber_id: barberId,
          organization_id: organizationId,
          date: today,
          clients_count: 1,
          services_count: manualCategory !== "product" ? 1 : 0,
          products_count: manualCategory === "product" ? 1 : 0,
          services_basic_total: manualCategory === "basic" ? numericValue : 0,
          services_extra_total: manualCategory === "extra" ? numericValue : 0,
          products_total: manualCategory === "product" ? numericValue : 0,
        };

        const { data: newProd, error } = await supabase
          .from("daily_productions")
          .insert(insertData)
          .select("id")
          .single();

        if (error) throw error;
        productionId = newProd.id;
      }

      toast.success(`Venda manual registrada para ${barberName}`);
      
      setLastDailyProductionId(productionId);
      resetForm();
      onOpenChange(false);
      setSubscriptionModalOpen(true);
    } catch (error) {
      console.error("Error registering manual sale:", error);
      toast.error("Erro ao registrar venda");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscriptionComplete = () => {
    const fetchSubscriptions = async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase
        .from("sale_transactions")
        .select("id")
        .eq("barber_id", barberId)
        .eq("item_type", "subscription")
        .gte("created_at", today)
        .lte("created_at", today + "T23:59:59");
      setTodaySubscriptionsCount(data?.length || 0);
    };
    fetchSubscriptions();
    onSuccess();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const canSubmit = 
    (activeTab !== "manual" && cart.length > 0) ||
    (activeTab === "manual" && manualValue);

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-semibold">
                  Venda Rápida — {isReceptionSale ? "🏢 Recepção / Loja" : barberName}
                </DialogTitle>
                <DialogDescription>
                  {isReceptionSale 
                    ? "Venda sem atribuição de barbeiro (pontos vão para a loja)"
                    : "Selecione múltiplos itens para registrar"
                  }
                </DialogDescription>
              </div>
              {/* Botão de Assinatura Avulsa */}
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-warning text-warning hover:bg-warning/10"
                onClick={() => {
                  onOpenChange(false);
                  setStandaloneSubscriptionOpen(true);
                }}
              >
                <Crown className="w-4 h-4" />
                Assinatura
              </Button>
            </div>
            
            {/* Toggle Venda Recepção */}
            <div className="flex items-center justify-between mt-3 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <Label htmlFor="reception-mode" className="text-sm font-medium cursor-pointer">
                  Venda Recepção / Loja
                </Label>
              </div>
              <Switch
                id="reception-mode"
                checked={isReceptionSale}
                onCheckedChange={setIsReceptionSale}
              />
            </div>
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
                {/* Cart Summary */}
                {cart.length > 0 && activeTab !== "manual" && (
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-background border text-sm">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="truncate font-medium">{item.name}</span>
                          {item.fixed_commission !== null && (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              <Zap className="h-2 w-2 mr-0.5" />
                              {item.fixed_commission}%
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
                            ×
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* Clients Counter */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">Clientes</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setClientsCount(prev => Math.max(1, prev - 1))}
                          disabled={clientsCount <= 1}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-6 text-center font-bold">{clientsCount}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setClientsCount(prev => prev + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <span className="font-medium">Total ({cartItemsTotal} itens):</span>
                      <span className="text-xl font-bold text-primary">
                        {formatCurrency(cartTotal)}
                      </span>
                    </div>

                    {/* Subscription count */}
                    {todaySubscriptionsCount > 0 && (
                      <Alert variant="default" className="bg-warning/10 border-warning/30 py-2">
                        <Crown className="h-4 w-4 text-warning" />
                        <AlertDescription className="text-xs">
                          {barberName} tem <strong>{todaySubscriptionsCount}</strong> {todaySubscriptionsCount === 1 ? 'assinatura' : 'assinaturas'} hoje
                        </AlertDescription>
                      </Alert>
                    )}
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
                    className="flex-1 gap-2"
                    disabled={isLoading || !canSubmit}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Confirmar Venda
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Subscription Confirm Modal */}
      {lastDailyProductionId && (
        <SubscriptionConfirmModal
          open={subscriptionModalOpen}
          onOpenChange={setSubscriptionModalOpen}
          barberId={barberId}
          organizationId={organizationId}
          dailyProductionId={lastDailyProductionId}
          onComplete={handleSubscriptionComplete}
        />
      )}

      {/* Modal de Assinatura Avulsa (sem carrinho) */}
      <SubscriptionConfirmModal
        open={standaloneSubscriptionOpen}
        onOpenChange={setStandaloneSubscriptionOpen}
        barberId={isReceptionSale ? null : barberId}
        organizationId={organizationId}
        dailyProductionId={null}
        onComplete={handleSubscriptionComplete}
        standaloneMode
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
