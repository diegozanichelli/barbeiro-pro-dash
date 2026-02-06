import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { toast } from "sonner";
import { Search, DollarSign, Scissors, ShoppingBag, Hash, Check, Zap, Loader2, CalendarIcon, Minus, Plus, ShoppingCart, Users } from "lucide-react";
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
  customPrice: number;
  quantity: number;
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
  
  // Carrinho multi-select
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [clientsCount, setClientsCount] = useState(1);
  
  // Date picker
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  
  // Campos do modo manual
  const [manualValue, setManualValue] = useState("0");
  const [manualCategory, setManualCategory] = useState<"basic" | "extra" | "product">("basic");

  // Buscar catálogo da organização + assinaturas de hoje
  useEffect(() => {
    const fetchCatalog = async () => {
      setLoadingCatalog(true);
      
      const today = getTodayString();
      
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

  // Toggle item no carrinho
  const handleToggleCart = (item: CatalogItem) => {
    setCart(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) {
        return prev.filter(i => i.id !== item.id);
      } else {
        return [...prev, { ...item, customPrice: item.default_price, quantity: 1 }];
      }
    });
  };

  const isInCart = (itemId: string) => cart.some(i => i.id === itemId);

  // Atualizar quantidade no carrinho
  const updateCartItemQuantity = (itemId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  // Atualizar preço no carrinho
  const updateCartItemPrice = (itemId: string, newPrice: string) => {
    const parsed = parseFloat(newPrice.replace(",", ".")) || 0;
    setCart(prev => prev.map(item => 
      item.id === itemId ? { ...item, customPrice: parsed } : item
    ));
  };

  // Total do carrinho (considerando quantidade)
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.customPrice * item.quantity), 0);
  }, [cart]);

  // Contagem total de itens
  const cartItemsTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Confirmar checkout (batch insert) - com suporte a quantidade
  const handleConfirmCheckout = async () => {
    if (cart.length === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    setLoading(true);
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

      // 2. Batch insert de todas as transações - expandindo quantidade em múltiplas transações
      // IMPORTANTE: source='barber' para diferenciar de lançamentos do gestor
      const transactions: any[] = [];
      cart.forEach(item => {
        for (let i = 0; i < item.quantity; i++) {
          transactions.push({
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
          });
        }
      });

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
    }
  };

  const handleConfirmManualSale = async () => {
    const value = parseFloat(manualValue.replace(",", ".")) || 0;
    if (value <= 0) {
      toast.error("Informe um valor válido");
      return;
    }

    setLoading(true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    try {
      // Buscar produção existente
      const { data: existingProd } = await supabase
        .from("daily_productions")
        .select("*")
        .eq("barber_id", barberId)
        .eq("date", dateStr)
        .maybeSingle();

      const updates = {
        barber_id: barberId,
        organization_id: organizationId,
        date: dateStr,
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

  const isToday = format(selectedDate, "yyyy-MM-dd") === getTodayString();

  return (
    <>
      <Card className="bg-card border-border shadow-card-custom">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              REGISTRAR VENDA
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <TabsList className="grid w-full grid-cols-3">
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
                <div className="max-h-[50vh] overflow-y-auto overscroll-contain touch-pan-y pr-1">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredItems.map((item) => (
                      <CatalogCard
                        key={item.id}
                        item={item}
                        isSelected={isInCart(item.id)}
                        onSelect={() => handleToggleCart(item)}
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
                <div className="max-h-[50vh] overflow-y-auto overscroll-contain touch-pan-y pr-1">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredItems.map((item) => (
                      <CatalogCard
                        key={item.id}
                        item={item}
                        isSelected={isInCart(item.id)}
                        onSelect={() => handleToggleCart(item)}
                      />
                    ))}
                  </div>
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

          {/* Espaço para o footer fixo não sobrepor conteúdo */}
          {cart.length > 0 && activeTab !== "manual" && <div className="h-20" />}
        </CardContent>
      </Card>

      {/* Footer Fixo do Carrinho (estilo iFood) */}
      {cart.length > 0 && activeTab !== "manual" && (
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
          <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-md">
            <span className="text-sm text-muted-foreground">Data:</span>
            <span className={cn("font-medium", !isToday && "text-warning")}>
              {isToday ? "Hoje" : format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
            </span>
          </div>

          {/* Lista de itens com edição de preço e quantidade */}
          <div className="space-y-3">
            {cart.map((item) => (
              <div key={item.id} className="p-3 bg-secondary rounded-lg space-y-2">
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
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setCart(prev => prev.filter(i => i.id !== item.id))}
                  >
                    ×
                  </Button>
                </div>
                
                {/* Linha de Quantidade e Preço */}
                <div className="flex items-center justify-between gap-2">
                  {/* Seletor de Quantidade */}
                  <div className="flex items-center gap-1 bg-background rounded-md border p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateCartItemQuantity(item.id, -1)}
                      disabled={item.quantity <= 1}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-6 text-center font-bold text-sm">{item.quantity}x</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateCartItemQuantity(item.id, 1)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  
                  {/* Preço Unitário */}
                  <div className="relative flex-1 max-w-[120px]">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={item.customPrice.toFixed(2).replace(".", ",")}
                      onChange={(e) => {
                        const val = e.target.value;
                        const cleaned = val.replace(/[^\d,.\-]/g, "");
                        updateCartItemPrice(item.id, cleaned);
                      }}
                      className="pl-7 text-right font-bold text-sm h-8 bg-background"
                    />
                  </div>
                  
                  {/* Subtotal */}
                  <div className="text-right min-w-[70px]">
                    <p className="text-xs text-muted-foreground">Subtotal</p>
                    <p className="font-bold text-sm text-primary">
                      R$ {(item.customPrice * item.quantity).toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                </div>
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
                className="h-8 w-8"
                onClick={() => setClientsCount(prev => Math.max(1, prev - 1))}
                disabled={clientsCount <= 1}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="w-8 text-center font-bold text-lg">{clientsCount}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
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

      {/* Nome do item */}
      <span className="text-sm font-medium text-center mt-2 line-clamp-2">{item.name}</span>

      {/* Preço */}
      <span className="text-lg font-bold text-primary mt-1">
        R$ {item.default_price.toFixed(2).replace(".", ",")}
      </span>

      {/* Badge de comissão fixa */}
      {item.fixed_commission && (
        <Badge className="mt-1 bg-warning/20 text-warning border-warning/30 text-[10px]">
          <Zap className="w-3 h-3 mr-0.5" />
          {item.fixed_commission}%
        </Badge>
      )}
    </button>
  );
}
