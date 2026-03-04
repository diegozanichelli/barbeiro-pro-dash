import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { toast } from "sonner";
import { Search, DollarSign, Scissors, ShoppingBag, Check, Zap, Loader2, CalendarIcon, Minus, Plus, ShoppingCart, Users } from "lucide-react";
import { format } from "date-fns";
import { getTodayString } from "@/lib/dateUtils";
import { ptBR } from "date-fns/locale";
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

interface CartItem extends CatalogItem {
  tempId: string;
  customPrice: number;
}



export default function BarberSaleForm({ barberId, organizationId, onSuccess }: BarberSaleFormProps) {
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const isSubmittingRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"services" | "products">("services");
  
  // Carrinho individualizado (cada item = 1 linha com tempId único)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [clientsCount, setClientsCount] = useState(1);
  
  // Date picker
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  
  
  // Note: is_new_client tracking is manager-only (reception/PDV)
  // Barber transactions default to false

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

  // Adicionar item ao carrinho (sempre cria nova linha)
  const handleAddToCart = (item: CatalogItem) => {
    const tempId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setCart(prev => [...prev, { ...item, tempId, customPrice: item.default_price }]);
  };

  // Contar quantas vezes um item está no carrinho
  const countInCart = (itemId: string) => cart.filter(i => i.id === itemId).length;

  // Atualizar preço no carrinho por tempId
  const updateCartItemPrice = (tempId: string, newPrice: number) => {
    setCart(prev => prev.map(item => 
      item.tempId === tempId ? { ...item, customPrice: newPrice } : item
    ));
  };

  // Remover item do carrinho por tempId
  const removeCartItem = (tempId: string) => {
    setCart(prev => prev.filter(i => i.tempId !== tempId));
  };

  // Total do carrinho
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.customPrice, 0);
  }, [cart]);

  // Contagem total de itens
  const cartItemsTotal = cart.length;

  // Confirmar checkout (batch insert) - cada item = 1 transação
  const handleConfirmCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setLoading(true);
    setCheckoutOpen(false);
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    try {
      // 1. Garantir que existe um registro de daily_productions para a data
      let dailyProductionId: string;

      const { data: existingProd } = await supabase
        .from("daily_productions")
        .select("id, clients_count")
        .eq("barber_id", barberId)
        .eq("date", dateStr)
        .maybeSingle();

      if (existingProd) {
        dailyProductionId = existingProd.id;
        // Incrementar clients_count pelo valor do contador
        await supabase
          .from("daily_productions")
          .update({ clients_count: (existingProd.clients_count || 0) + clientsCount })
          .eq("id", existingProd.id);
      } else {
        // Criar novo registro
        const { data: newProd, error: insertError } = await supabase
          .from("daily_productions")
          .insert({
            barber_id: barberId,
            organization_id: organizationId,
            date: dateStr,
            services_basic_total: 0,
            services_extra_total: 0,
            products_total: 0,
            services_total: 0,
            clients_count: clientsCount,
            services_count: 0,
            products_count: 0,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        dailyProductionId = newProd.id;
      }

      // 2. Cada item do carrinho gera exatamente 1 transação
      // IMPORTANTE: source='barber' para diferenciar de lançamentos do gestor
      const transactions = cart.map(item => ({
        barber_id: barberId,
        organization_id: organizationId,
        daily_production_id: dailyProductionId,
        item_type: item.type,
        item_name: item.name,
        price_sold: item.customPrice,
        service_category: item.type === "service" ? item.category : null,
        catalog_service_id: item.type === "service" ? item.id : null,
        catalog_product_id: item.type === "product" ? item.id : null,
        commission_rate_used: 0, // Trigger vai calcular
        commission_amount: 0, // Trigger vai calcular
        source: "barber", // <- Diferencia do gestor
        is_new_client: false, // Barbeiro não define - métrica é exclusiva do gestor
      }));

      const { error: txError } = await supabase
        .from("sale_transactions")
        .insert(transactions);

      if (txError) throw txError;

      toast.success(`${cartItemsTotal} ${cartItemsTotal === 1 ? 'item registrado' : 'itens registrados'}!`, {
        description: `Total: R$ ${cartTotal.toFixed(2)} • ${clientsCount} ${clientsCount === 1 ? 'cliente' : 'clientes'}`,
      });

      // Limpar carrinho e fechar modal de checkout
      setCart([]);
      setCheckoutOpen(false);
      setClientsCount(1);
      onSuccess();
    } catch (error: any) {
      console.error("Erro ao registrar venda:", error);
      toast.error(error.message || "Erro ao registrar venda");
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };


  const servicesCount = catalogItems.filter((i) => i.type === "service").length;
  const productsCount = catalogItems.filter((i) => i.type === "product").length;

  const isToday = format(selectedDate, "yyyy-MM-dd") === getTodayString();

  return (
    <>
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader className={cn("transition-all", cart.length > 0 ? "pb-1 pt-3 md:pb-3 md:pt-6" : "pb-3")}>
          <div className="flex items-center justify-between">
            <CardTitle className={cn(
              "flex items-center gap-2 transition-all",
              cart.length > 0 ? "text-base md:text-2xl" : ""
            )}>
              <DollarSign className={cn("text-primary", cart.length > 0 ? "w-4 h-4 md:w-5 md:h-5" : "w-5 h-5")} />
              CONFERÊNCIA DOS LANÇAMENTOS
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className={cn("space-y-4", cart.length > 0 && "space-y-2 md:space-y-4")}>
          {/* Date Picker */}
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">Data:</Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "flex-1 justify-start text-left font-normal",
                    !isToday && "border-warning text-warning"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {isToday ? "Hoje" : format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setDatePickerOpen(false);
                    }
                  }}
                  disabled={(date) => date > new Date()}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
          </Popover>
          </div>
          
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
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="services" className="flex items-center gap-1.5">
                <Scissors className="w-4 h-4" />
                <span className="hidden sm:inline">Serviços</span>
                {servicesCount > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {servicesCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="products" className="flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4" />
                <span className="hidden sm:inline">Produtos</span>
                {productsCount > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {productsCount}
                  </Badge>
                )}
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
                <div className="h-[60vh] min-h-[400px] md:h-auto md:max-h-[50vh] overflow-y-auto overscroll-contain touch-pan-y pr-1 pb-4">
                  <div className={cn(
                    "grid grid-cols-2 md:grid-cols-3",
                    cart.length > 0 ? "gap-1.5 md:gap-3" : "gap-3"
                  )}>
                    {filteredItems.map((item) => (
                      <CatalogCard
                        key={item.id}
                        item={item}
                        countInCart={countInCart(item.id)}
                        onSelect={() => handleAddToCart(item)}
                        compact={cart.length > 0}
                      />
                    ))}
                  </div>
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
                <div className="h-[60vh] min-h-[400px] md:h-auto md:max-h-[50vh] overflow-y-auto overscroll-contain touch-pan-y pr-1 pb-4">
                  <div className={cn(
                    "grid grid-cols-2 md:grid-cols-3",
                    cart.length > 0 ? "gap-1.5 md:gap-3" : "gap-3"
                  )}>
                    {filteredItems.map((item) => (
                      <CatalogCard
                        key={item.id}
                        item={item}
                        countInCart={countInCart(item.id)}
                        onSelect={() => handleAddToCart(item)}
                        compact={cart.length > 0}
                      />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

          </Tabs>

          {/* Espaço para o footer fixo não sobrepor conteúdo */}
          {cart.length > 0 && <div className="h-24" />}
        </CardContent>
      </Card>

      {/* Footer Fixo do Carrinho (estilo iFood) */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-primary text-primary-foreground p-4 shadow-lg border-t z-50">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingCart className="w-6 h-6" />
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-background text-primary text-xs">
                  {cart.length}
                </Badge>
              </div>
              <div>
                <p className="text-sm opacity-90">
                  {cart.length} {cart.length === 1 ? 'item' : 'itens'}
                </p>
                <p className="font-bold text-lg">
                  R$ {cartTotal.toFixed(2).replace(".", ",")}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setCheckoutOpen(true)}
              className="font-bold"
            >
              CONCLUIR VENDA
            </Button>
          </div>
        </div>
      )}

      {/* Modal de Checkout */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              Resumo da Venda
            </DialogTitle>
            <DialogDescription>
              Revise os itens e ajuste os valores se necessário
            </DialogDescription>
          </DialogHeader>

          {/* Data da venda */}
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-md">
              <span className="text-sm text-muted-foreground">Data:</span>
              <span className={cn("font-medium", !isToday && "text-warning")}>
                {isToday ? "Hoje" : format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
          </div>

          {/* Lista de itens individualizados */}
          <div className="space-y-3 max-h-[40vh] overflow-y-auto overscroll-contain pr-1">
            {cart.map((item) => (
              <div key={item.tempId} className="p-3 bg-secondary rounded-lg space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.type === "service" && item.category && (
                        <Badge variant="outline" className="text-[10px]">
                          {item.category === "basic" ? "Básico" : "Extra"}
                        </Badge>
                      )}
                      {item.fixed_commission && (
                        <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">
                          <Zap className="w-2 h-2 mr-0.5" />
                          {item.fixed_commission}%
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive hover:text-destructive"
                    onClick={() => removeCartItem(item.tempId)}
                  >
                    ×
                  </Button>
                </div>
                
                {/* Preço editável com máscara de centavos */}
                <CurrencyInput
                  value={item.customPrice}
                  onChange={(val) => updateCartItemPrice(item.tempId, val)}
                  quickValues={[30, 50, 80, 100]}
                />
              </div>
            ))}
          </div>

          {/* Contador de Clientes */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium text-sm">Clientes Atendidos</p>
                <p className="text-xs text-muted-foreground">
                  Conta como {clientsCount} {clientsCount === 1 ? 'atendimento' : 'atendimentos'} no ranking
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setClientsCount(prev => Math.max(1, prev - 1))}
                disabled={clientsCount <= 1}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-8 text-center font-bold text-lg">{clientsCount}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setClientsCount(prev => prev + 1)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between p-4 bg-primary/10 rounded-lg border border-primary/20">
            <div>
              <span className="font-medium">Total ({cartItemsTotal} {cartItemsTotal === 1 ? 'item' : 'itens'}):</span>
            </div>
            <span className="text-2xl font-bold text-primary">
              R$ {cartTotal.toFixed(2).replace(".", ",")}
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmCheckout} disabled={loading} className="gap-2">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Confirmar Venda
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Componente de Card do Catálogo
interface CatalogCardProps {
  item: CatalogItem;
  countInCart: number;
  onSelect: () => void;
  compact?: boolean;
}

function CatalogCard({ item, countInCart, onSelect, compact = false }: CatalogCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border-2 transition-all duration-200",
        "hover:shadow-md active:scale-[0.98]",
        compact ? "p-1.5 md:p-2.5" : "p-2.5",
        countInCart > 0
          ? "border-primary bg-primary/10 shadow-md"
          : "border-border bg-secondary hover:border-primary/50"
      )}
    >
      {/* Badge de contador no carrinho */}
      {countInCart > 0 && (
        <div className="absolute top-1 right-1 min-w-[20px] h-[20px] bg-primary rounded-full flex items-center justify-center px-1">
          <span className="text-[10px] font-bold text-primary-foreground">x{countInCart}</span>
        </div>
      )}

      {/* Badge de categoria (serviços) */}
      {item.type === "service" && item.category && (
        <Badge
          variant="outline"
          className={cn(
            "absolute top-1 left-1 text-[9px] px-1",
            item.category === "basic" ? "border-primary/50 text-primary" : "border-accent-foreground/50 text-accent-foreground"
          )}
        >
          {item.category === "basic" ? "Básico" : "Extra"}
        </Badge>
      )}

      {/* Nome do item */}
      <span className={cn(
        "font-medium text-center line-clamp-2 mt-1",
        compact ? "text-[10px] md:text-xs" : "text-xs"
      )}>{item.name}</span>

      {/* Preço */}
      <span className={cn(
        "font-bold text-primary mt-0.5",
        compact ? "text-xs md:text-base" : "text-base"
      )}>
        R$ {item.default_price.toFixed(2).replace(".", ",")}
      </span>

      {/* Badge de comissão fixa */}
      {item.fixed_commission && (
        <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px] mt-0.5">
          <Zap className="w-2.5 h-2.5 mr-0.5" />
          {item.fixed_commission}%
        </Badge>
      )}
    </button>
  );
}
