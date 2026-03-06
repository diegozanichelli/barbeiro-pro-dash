import { useState, useEffect, useMemo, useRef } from "react";
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
import {
  Loader2,
  Search,
  Scissors,
  Package,
  Zap,
  Check,
  Minus,
  Plus,
  Trash2,
  PlusCircle,
  ArrowLeft,
  ReceiptText,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

interface TransactionManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberId: string;
  barberName: string;
  organizationId: string;
  dailyProductionId?: string | null;
  date: string;
  onSuccess: () => void;
  auditMode?: boolean;
  sourceFilter?: "barber" | "manager";
  readOnly?: boolean;
}

interface Transaction {
  id: string;
  item_name: string;
  item_type: string;
  service_category: string | null;
  price_sold: number;
  commission_amount: number;
  description: string | null;
  client_name: string | null;
  source: string;
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

type ViewMode = "list" | "add";
type CategoryTab = "services" | "products";

export default function TransactionManagerModal({
  open,
  onOpenChange,
  barberId,
  barberName,
  organizationId,
  dailyProductionId,
  date,
  onSuccess,
  auditMode = false,
  sourceFilter,
  readOnly = false,
}: TransactionManagerModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("services");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; transactionId: string | null }>({
    open: false,
    transactionId: null,
  });

  // Fetch transactions when modal opens
  useEffect(() => {
    if (open && barberId && date) {
      fetchTransactions();
    }
  }, [open, barberId, date]);

  // Fetch catalog when switching to add mode
  useEffect(() => {
    if (viewMode === "add" && catalogItems.length === 0) {
      fetchCatalog();
    }
  }, [viewMode]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setViewMode("list");
      setCart([]);
      setSearchQuery("");
      setActiveTab("services");
    }
  }, [open]);

  const fetchTransactions = async () => {
    setLoadingTransactions(true);
    try {
      const { addDays, parseISO, format: fmtDate } = await import("date-fns");
      const nextDay = fmtDate(addDays(parseISO(date), 1), "yyyy-MM-dd");

      let query = supabase
        .from("sale_transactions")
        .select("id, item_name, item_type, service_category, price_sold, commission_amount, description, client_name, source")
        .order("created_at", { ascending: true });

      if (dailyProductionId) {
        // Use daily_production_id only — no date bounds needed, the FK is the source of truth
        query = query.eq("daily_production_id", dailyProductionId);
      } else {
        // Fallback to date range when no production record exists
        query = query
          .eq("barber_id", barberId)
          .gte("created_at", `${date}T00:00:00-04:00`)
          .lt("created_at", `${nextDay}T00:00:00-04:00`);
      }

      // Apply source filter if provided (e.g., only show manager transactions in Live view)
      if (sourceFilter) {
        query = query.eq("source", sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Erro ao carregar transações");
    } finally {
      setLoadingTransactions(false);
    }
  };

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

  const handleDeleteTransaction = async (transactionId: string) => {
    try {
      const { error } = await supabase
        .from("sale_transactions")
        .delete()
        .eq("id", transactionId);

      if (error) throw error;

      toast.success("Item excluído com sucesso");
      fetchTransactions();
      onSuccess();
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Erro ao excluir item");
    } finally {
      setDeleteConfirm({ open: false, transactionId: null });
    }
  };

  // Cart operations
  const handleToggleCart = (item: CatalogItem) => {
    setCart((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) {
        return prev.filter((i) => i.id !== item.id);
      } else {
        return [
          ...prev,
          {
            ...item,
            customPrice: item.default_price,
            customPriceInput: item.default_price.toFixed(2).replace(".", ","),
            quantity: 1,
          },
        ];
      }
    });
  };

  const isInCart = (itemId: string) => cart.some((i) => i.id === itemId);

  const updateCartItemQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  const updateCartItemPriceInput = (itemId: string, newValue: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        let cleanedValue = newValue;
        if (newValue === "") {
          cleanedValue = "";
        } else {
          const cleaned = newValue.replace(/[^\d,.\-]/g, "");
          if (
            (item.customPriceInput === "0" || item.customPriceInput === "0,00") &&
            /^\d/.test(cleaned)
          ) {
            cleanedValue = cleaned.replace(/^0+(?=\d)/, "") || cleaned;
          } else {
            cleanedValue = cleaned;
          }
        }

        const parsed = parseFloat(cleanedValue.replace(",", ".")) || 0;
        return { ...item, customPriceInput: cleanedValue, customPrice: parsed };
      })
    );
  };

  const finalizeCartItemPrice = (itemId: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const formattedInput =
          item.customPrice > 0 ? item.customPrice.toFixed(2).replace(".", ",") : "0,00";
        return { ...item, customPriceInput: formattedInput };
      })
    );
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.customPrice * item.quantity, 0);
  }, [cart]);

  const cartItemsTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

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

  const handleAddItems = async () => {
    if (isSubmittingRef.current) return;
    if (cart.length === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      // Insert transactions
      const transactionsToInsert: any[] = [];
      const sourceValue = auditMode ? "barber" : "manager";
      cart.forEach((item) => {
        for (let i = 0; i < item.quantity; i++) {
          transactionsToInsert.push({
            organization_id: organizationId,
            barber_id: barberId,
            daily_production_id: dailyProductionId || null,
            item_type: item.type,
            catalog_service_id: item.type === "service" ? item.id : null,
            catalog_product_id: item.type === "product" ? item.id : null,
            item_name: item.name,
            service_category: item.type === "service" ? item.category : null,
            price_sold: item.customPrice,
            commission_rate_used: 0,
            commission_amount: 0,
            source: sourceValue,
            created_at: `${date}T12:00:00-04:00`,
          });
        }
      });

      const { error } = await supabase.from("sale_transactions").insert(transactionsToInsert);
      if (error) throw error;

      toast.success(
        `${cartItemsTotal} ${cartItemsTotal === 1 ? "item adicionado" : "itens adicionados"}`
      );

      // Reset and go back to list
      setCart([]);
      setSearchQuery("");
      setActiveTab("services");
      setViewMode("list");
      fetchTransactions();
      onSuccess();
    } catch (error) {
      console.error("Error adding transactions:", error);
      toast.error("Erro ao adicionar itens");
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getItemIcon = (itemType: string) => {
    return itemType === "service" ? (
      <Scissors className="h-4 w-4 text-primary" />
    ) : (
      <Package className="h-4 w-4 text-amber-500" />
    );
  };

  const getCategoryBadge = (itemType: string, category: string | null) => {
    if (itemType === "subscription") {
      return (
        <Badge variant="secondary" className="bg-purple-500/20 text-purple-400">
          Assinatura
        </Badge>
      );
    }
    if (itemType === "product") {
      return (
        <Badge variant="secondary" className="bg-amber-500/20 text-amber-400">
          Produto
        </Badge>
      );
    }
    if (category === "basic") {
      return <Badge variant="secondary">Básico</Badge>;
    }
    if (category === "extra") {
      return (
        <Badge variant="default" className="bg-primary/20 text-primary">
          Extra
        </Badge>
      );
    }
    return null;
  };

  const totalTransactions = transactions
    .filter((transaction) => transaction.item_type !== "subscription")
    .reduce((sum, transaction) => sum + transaction.price_sold, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center gap-3">
              {viewMode === "add" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setViewMode("list");
                    setCart([]);
                    setSearchQuery("");
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div>
                <DialogTitle className="text-lg font-semibold">
                  {viewMode === "list"
                    ? `${readOnly ? "Comandas Recepção" : auditMode ? "Auditar" : "Gerenciar"} — ${barberName}`
                    : "Adicionar Itens"}
                </DialogTitle>
                <DialogDescription>
                  {viewMode === "list"
                    ? `Data: ${new Date(date + "T12:00:00").toLocaleDateString("pt-BR")}`
                    : `Itens serão vinculados à data ${new Date(date + "T12:00:00").toLocaleDateString("pt-BR")}`}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {viewMode === "list" ? (
            // LIST VIEW
            <div className="flex-1 flex flex-col overflow-hidden">
              {loadingTransactions ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ReceiptText className="h-12 w-12 mb-4 opacity-50" />
                  <p className="font-medium mb-1">Nenhuma transação registrada</p>
                  <p className="text-sm text-center px-8">
                    Adicione itens retroativos usando o botão abaixo
                  </p>
                </div>
              ) : (
                <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
                  <div className="space-y-2">
                    {transactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {getItemIcon(transaction.item_type)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm truncate">
                                {transaction.item_name}
                              </p>
                          {getCategoryBadge(
                                transaction.item_type,
                                transaction.service_category
                              )}
                            </div>
                            {transaction.client_name && (
                              <p className="text-xs text-muted-foreground/80">
                                Cliente: {transaction.client_name}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(transaction.price_sold)} · Comissão: {formatCurrency(transaction.commission_amount)}
                            </p>
                          </div>
                        </div>
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={() => setDeleteConfirm({ open: true, transactionId: transaction.id })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}


              {/* Footer with totals and add button */}
              <div className="border-t px-6 py-4 space-y-4 bg-muted/30">
                {transactions.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <span className="font-medium">Total ({transactions.length} itens):</span>
                      <span className="text-xl font-bold text-primary">
                        {formatCurrency(totalTransactions)}
                      </span>
                    </div>
                  </div>
                )}
                {!readOnly && (
                  <Button
                    onClick={() => setViewMode("add")}
                    className="w-full h-12 text-base gap-2"
                  >
                    <PlusCircle className="h-5 w-5" />
                    Adicionar Item Retroativo
                  </Button>
                )}
              </div>
            </div>
          ) : (
            // ADD VIEW - Catalog
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as CategoryTab)}
              className="flex-1 min-h-0 flex flex-col overflow-hidden"
            >
              {/* Search */}
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

              {/* Tabs */}
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

              {/* Services Grid */}
              <TabsContent value="services" className="flex-1 min-h-0 m-0 overflow-hidden">
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
              <TabsContent value="products" className="flex-1 min-h-0 m-0 overflow-hidden">
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

              {/* Footer with cart */}
              <div className="border-t px-6 py-4 space-y-4 bg-muted/30">
                {/* Cart Summary */}
                {cart.length > 0 && (
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-background border text-sm"
                      >
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
                            <span className="w-5 text-center font-bold text-xs">
                              {item.quantity}x
                            </span>
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
                            onClick={() => setCart((prev) => prev.filter((i) => i.id !== item.id))}
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* Total */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <span className="font-medium">Total ({cartItemsTotal} itens):</span>
                      <span className="text-xl font-bold text-primary">
                        {formatCurrency(cartTotal)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setViewMode("list");
                      setCart([]);
                      setSearchQuery("");
                    }}
                    className="flex-1"
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleAddItems}
                    className="flex-1 gap-2"
                    disabled={isSubmitting || cart.length === 0}
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Adicionar ({cartItemsTotal})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, transactionId: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O item será removido e os totais serão recalculados
              automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteConfirm.transactionId && handleDeleteTransaction(deleteConfirm.transactionId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        <p className="font-bold text-sm leading-tight line-clamp-2 text-foreground">{item.name}</p>
        <p className="text-xl font-black text-primary">{formatCurrency(item.default_price)}</p>
        {item.category && (
          <Badge variant={item.category === "basic" ? "secondary" : "default"} className="text-xs">
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
