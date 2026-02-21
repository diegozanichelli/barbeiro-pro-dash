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
import { Loader2, Search, Scissors, Package, Zap, Minus, Plus, ShoppingCart, X, Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import DivergenceModal from "./DivergenceModal";
import StatusDoDiaDialog, { PresenceType } from "./StatusDoDiaDialog";

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
  tempId: string;
  customPrice: number;
  customPriceInput: string;
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

let tempIdCounter = 0;
function generateTempId() {
  return `edit-${Date.now()}-${++tempIdCounter}`;
}

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
  
  const [existingData, setExistingData] = useState<ExistingProduction | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientsCount, setClientsCount] = useState(1);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusWarningOpen, setStatusWarningOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<PresenceType | null>(null);
  const [isSavingPresence, setIsSavingPresence] = useState(false);

  const [divergenceModal, setDivergenceModal] = useState<{
    open: boolean;
    manualTotal: number;
    txTotal: number;
    hasDivergence: boolean;
  }>({ open: false, manualTotal: 0, txTotal: 0, hasDivergence: false });

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
    setStatusDialogOpen(false);
    setStatusWarningOpen(false);
    setPendingStatus(null);
  };

  const handleConfirmStatus = async (selectedStatus: PresenceType) => {
    setIsSavingPresence(true);
    try {
      const { error: deleteError } = await supabase
        .from("sale_transactions")
        .delete()
        .eq("barber_id", barberId)
        .eq("date", productionDate)
        .eq("source", "barber");

      if (deleteError) throw deleteError;

      const { error: updateError } = await supabase
        .from("daily_productions")
        .update({
          services_basic_total: 0,
          services_extra_total: 0,
          products_total: 0,
          manual_basic_total: 0,
          manual_extra_total: 0,
          manual_products_total: 0,
          commission_earned: 0,
          confirmed_presence: true,
          presence_type: selectedStatus,
        })
        .eq("barber_id", barberId)
        .eq("date", productionDate);

      if (updateError) throw updateError;

      toast.success("Status do dia registrado com sucesso!");
      setStatusDialogOpen(false);
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      console.error("Erro ao confirmar presença:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao confirmar presença");
    } finally {
      setIsSavingPresence(false);
    }
  };

  const handleRequestStatusConfirm = async (selectedStatus: PresenceType) => {
    if (cart.length > 0) {
      setPendingStatus(selectedStatus);
      setStatusWarningOpen(true);
      return;
    }

    await handleConfirmStatus(selectedStatus);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  // Cart operations - individualized with tempId
  const handleAddToCart = (item: CatalogItem) => {
    setCart(prev => [
      ...prev,
      {
        ...item,
        tempId: generateTempId(),
        customPrice: item.default_price,
        customPriceInput: item.default_price.toFixed(2).replace(".", ","),
      },
    ]);
  };

  const countInCart = (itemId: string) => cart.filter(i => i.id === itemId).length;

  const removeFromCart = (tempId: string) => {
    setCart(prev => prev.filter(i => i.tempId !== tempId));
  };

  const updateCartItemPriceInput = (tempId: string, newValue: string) => {
    setCart(prev => prev.map(item => {
      if (item.tempId !== tempId) return item;
      
      if (newValue === "") {
        return { ...item, customPriceInput: "", customPrice: 0 };
      }

      const cleaned = newValue.replace(/[^\d,.-]/g, "");
      const parsed = parseFloat(cleaned.replace(",", ".")) || 0;
      
      return { 
        ...item, 
        customPriceInput: cleaned,
        customPrice: parsed
      };
    }));
  };

  const handleCartItemPriceFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => e.target.select(), 0);
  };

  const finalizeCartItemPrice = (tempId: string) => {
    setCart(prev => prev.map(item => {
      if (item.tempId !== tempId) return item;
      
      const formattedInput = item.customPrice > 0 
        ? item.customPrice.toFixed(2).replace(".", ",")
        : "0,00";
      
      return { ...item, customPriceInput: formattedInput };
    }));
  };

  // Cart totals
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.customPrice, 0);
  }, [cart]);

  const cartItemsTotal = cart.length;

  // Existing totals
  const existingTotal = useMemo(() => {
    if (!existingData) return 0;
    return existingData.services_basic_total + existingData.services_extra_total + existingData.products_total;
  }, [existingData]);

  // Filter items
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

      // 2. Criar novas transações itemizadas (cada cart item = 1 transação)
      const transactions = cart.map(item => ({
        organization_id: organizationId,
        barber_id: barberId,
        daily_production_id: productionId,
        item_name: item.name,
        item_type: item.type,
        service_category: item.category || null,
        catalog_service_id: item.type === "service" ? item.id : null,
        catalog_product_id: item.type === "product" ? item.id : null,
        price_sold: item.customPrice,
        commission_rate_used: 0,
        commission_amount: 0,
        source: "barber",
      }));

      if (transactions.length > 0) {
        const { error: insertError } = await supabase
          .from("sale_transactions")
          .insert(transactions);

        if (insertError) {
          console.error("Erro ao inserir transações:", insertError);
          throw insertError;
        }
      }

      // 3. Atualizar clients_count
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
        if (item.type === "product") {
          productsTotal += item.customPrice;
        } else if (item.category === "extra") {
          servicesExtraTotal += item.customPrice;
        } else {
          servicesBasicTotal += item.customPrice;
        }
      });

      const manualTotal = servicesBasicTotal + servicesExtraTotal + productsTotal;

      const txTotal = existingData 
        ? existingData.tx_basic_total + existingData.tx_extra_total + existingData.tx_products_total
        : 0;

      const divergenceThreshold = 0.05;
      let hasDivergence = false;

      if (txTotal > 0) {
        const percentDiff = Math.abs((manualTotal - txTotal) / txTotal);
        hasDivergence = percentDiff > divergenceThreshold;
      }

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
    } catch (error: unknown) {
      console.error("Error updating production:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar produção");
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
  const shortDate = format(new Date(productionDate + "T00:00:00"), "dd/MM/yyyy");
  const hasCartItems = cart.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          {/* Ultra-compact header on mobile */}
          <DialogHeader className="px-4 pt-3 pb-2 md:px-6 md:pt-6 md:pb-4 border-b">
            <DialogTitle className="text-sm md:text-lg font-semibold">
              <span className="md:hidden">Editar — {shortDate}</span>
              <span className="hidden md:inline">Editar Produção — {formattedDate}</span>
            </DialogTitle>
            <DialogDescription className="hidden md:block">
              Selecione os itens que você realizou neste dia para substituir o lançamento atual
            </DialogDescription>
          </DialogHeader>

          {/* Alert - hidden on mobile */}
          {existingData && existingTotal > 0 && (
            <div className="hidden md:block px-6 pt-4">
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
          <div className="px-3 py-2 md:px-6 md:pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar serviço ou produto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 md:h-10"
              />
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as CategoryTab)}
            className="flex-1 flex flex-col overflow-hidden min-h-0"
          >
            <div className="px-3 md:px-6 pt-2 md:pt-4">
              <TabsList className="grid w-full grid-cols-2 h-10 md:h-12">
                <TabsTrigger value="services" className="gap-1.5 text-xs md:text-sm">
                  <Scissors className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  Serviços
                  {services.length > 0 && (
                    <span className="text-[10px] bg-muted-foreground/20 px-1 py-0.5 rounded">
                      {services.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="products" className="gap-1.5 text-xs md:text-sm">
                  <Package className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  Produtos
                  {products.length > 0 && (
                    <span className="text-[10px] bg-muted-foreground/20 px-1 py-0.5 rounded">
                      {products.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
              {/* Scrollable Catalog */}
              <div
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <TabsContent value="services" className="mt-0">
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
                    <div className="px-3 py-2 md:px-6 md:py-4">
                      <div className={cn(
                        "grid grid-cols-2 sm:grid-cols-3 touch-pan-y",
                        hasCartItems ? "gap-1.5 md:gap-3" : "gap-2 md:gap-3"
                      )}>
                        {filteredItems.map((item) => (
                          <CatalogCard
                            key={item.id}
                            item={item}
                            countInCart={countInCart(item.id)}
                            onSelect={() => handleAddToCart(item)}
                            formatCurrency={formatCurrency}
                            compact={hasCartItems}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="products" className="mt-0">
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
                    <div className="px-3 py-2 md:px-6 md:py-4">
                      <div className={cn(
                        "grid grid-cols-2 sm:grid-cols-3 touch-pan-y",
                        hasCartItems ? "gap-1.5 md:gap-3" : "gap-2 md:gap-3"
                      )}>
                        {filteredItems.map((item) => (
                          <CatalogCard
                            key={item.id}
                            item={item}
                            countInCart={countInCart(item.id)}
                            onSelect={() => handleAddToCart(item)}
                            formatCurrency={formatCurrency}
                            compact={hasCartItems}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </div>

              {/* Footer */}
              <div className="border-t px-3 py-2 md:px-6 md:py-4 space-y-2 md:space-y-4 bg-muted/30">
                {cart.length > 0 && (
                  <div className="space-y-1.5 md:space-y-3 max-h-[30vh] overflow-y-auto">
                    {cart.map((item) => (
                      <div key={item.tempId} className="flex items-center justify-between min-h-[44px] p-1.5 md:p-2 rounded-lg bg-background border text-sm">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span className="truncate font-medium text-xs md:text-sm">{item.name}</span>
                          {item.category && (
                            <Badge variant={item.category === "basic" ? "secondary" : "default"} className="shrink-0 text-[10px]">
                              {item.category === "basic" ? "B" : "E"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={item.customPriceInput}
                            onChange={(e) => updateCartItemPriceInput(item.tempId, e.target.value)}
                            onFocus={handleCartItemPriceFocus}
                            onBlur={() => finalizeCartItemPrice(item.tempId)}
                            className="w-20 text-right font-bold text-xs h-8"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-destructive hover:text-destructive shrink-0"
                            onClick={() => removeFromCart(item.tempId)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* Clients Counter */}
                    <div className="flex items-center justify-between min-h-[44px] p-2 md:p-3 rounded-lg bg-background border">
                      <Label className="text-xs md:text-sm font-medium">Clientes</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10"
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
                          className="h-10 w-10"
                          onClick={() => setClientsCount(c => c + 1)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Comparação de valores */}
                    {existingTotal > 0 && (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs md:text-sm">
                        <span className="text-muted-foreground">Anterior → Novo:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground line-through">{formatCurrency(existingTotal)}</span>
                          <span className="font-bold text-primary">{formatCurrency(cartTotal)}</span>
                          {cartTotal !== existingTotal && (
                            <Badge variant={cartTotal > existingTotal ? "default" : "secondary"} className="text-[10px]">
                              {cartTotal > existingTotal ? "+" : ""}{formatCurrency(cartTotal - existingTotal)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {cart.length === 0 && (
                  <div className="text-center py-2 text-muted-foreground text-sm">
                    <ShoppingCart className="h-6 w-6 md:h-8 md:w-8 mx-auto mb-1.5 opacity-50" />
                    <p className="text-xs md:text-sm">Selecione os serviços e produtos realizados</p>
                  </div>
                )}

                {/* Submit */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {cart.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground">
                      <ShoppingCart className="h-3.5 w-3.5" />
                      <span>{cartItemsTotal} {cartItemsTotal === 1 ? 'item' : 'itens'}</span>
                      <span className="font-bold text-foreground">{formatCurrency(cartTotal)}</span>
                    </div>
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleClose(false)}
                      disabled={isLoading || isSavingPresence}
                      className="h-10"
                    >
                      Cancelar
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStatusDialogOpen(true)}
                      disabled={isLoading || isSavingPresence}
                      className="h-10"
                    >
                      Registrar Presença
                    </Button>

                    <Button
                      type="submit"
                      disabled={isLoading || cart.length === 0 || isSavingPresence}
                      className="h-10"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Salvar Alterações"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </Tabs>
        </DialogContent>
      </Dialog>

      <StatusDoDiaDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        barberId={barberId}
        date={productionDate}
        isLoading={isSavingPresence}
        onConfirm={handleRequestStatusConfirm}
      />

      <AlertDialog open={statusWarningOpen} onOpenChange={setStatusWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Existem serviços lançados</AlertDialogTitle>
            <AlertDialogDescription>
              Registrar status do dia removerá os lançamentos. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingPresence}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSavingPresence || !pendingStatus}
              onClick={async (event) => {
                event.preventDefault();
                if (!pendingStatus) return;
                setStatusWarningOpen(false);
                await handleConfirmStatus(pendingStatus);
              }}
            >
              {isSavingPresence ? "Confirmando..." : "Continuar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

// Catalog Card Component - with compact mode and count badge
interface CatalogCardProps {
  item: CatalogItem;
  countInCart: number;
  onSelect: () => void;
  formatCurrency: (value: number) => string;
  compact?: boolean;
}

function CatalogCard({ item, countInCart, onSelect, formatCurrency, compact }: CatalogCardProps) {
  const inCart = countInCart > 0;

  return (
    <Card
      onClick={onSelect}
      className={cn(
        "relative cursor-pointer transition-all duration-200 active:scale-[0.98]",
        compact ? "p-2 md:p-4" : "p-4",
        inCart
          ? "ring-2 ring-primary bg-primary/10 shadow-lg border-primary"
          : "hover:bg-accent/50 hover:border-primary/30 hover:shadow-lg"
      )}
    >
      {/* Count badge */}
      {countInCart > 0 && (
        <div className="absolute -top-1.5 -right-1.5 z-10 h-5 w-5 md:h-6 md:w-6 rounded-full bg-primary flex items-center justify-center shadow-md">
          <span className="text-[10px] md:text-xs font-bold text-primary-foreground">
            {countInCart > 1 ? `${countInCart}` : "✓"}
          </span>
        </div>
      )}

      {/* Fixed Commission Badge */}
      {item.fixed_commission !== null && (
        <Badge 
          variant="secondary" 
          className={cn(
            "absolute bg-warning text-warning-foreground border-0 shadow-md",
            inCart ? "-top-1.5 left-0" : "-top-2 -right-2",
            compact ? "text-[9px] px-1 py-0" : ""
          )}
        >
          <Zap className={cn(compact ? "h-2.5 w-2.5" : "h-3 w-3", "mr-0.5")} />
          {item.fixed_commission}%
        </Badge>
      )}
      
      <div className={cn("space-y-1", compact ? "space-y-0.5" : "space-y-2")}>
        <p className={cn(
          "font-bold leading-tight line-clamp-2 text-foreground",
          compact ? "text-xs md:text-sm" : "text-sm"
        )}>
          {item.name}
        </p>
        <p className={cn(
          "font-black text-primary",
          compact ? "text-sm md:text-xl" : "text-xl"
        )}>
          {formatCurrency(item.default_price)}
        </p>
        {item.category && (
          <Badge 
            variant={item.category === "basic" ? "secondary" : "default"}
            className={cn(compact ? "text-[9px] px-1 py-0" : "text-xs")}
          >
            {item.category === "basic" ? "Básico" : "Extra"}
          </Badge>
        )}
      </div>
    </Card>
  );
}
