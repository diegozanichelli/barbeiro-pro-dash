import { useState, useEffect, useMemo, useCallback, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  Loader2,
  Minus,
  Package,
  Plus,
  Scissors,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import DivergenceModal from "./DivergenceModal";
import StatusDoDiaDialog, { type PresenceType } from "./StatusDoDiaDialog";

interface DayReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberId: string;
  organizationId: string;
  date: string; // yyyy-MM-dd
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
  catalogRefId: string | null;
  fromLive: boolean; // true = veio do AO VIVO
}

interface LiveTransaction {
  id: string;
  item_name: string;
  item_type: "service" | "product";
  service_category: string | null;
  catalog_service_id: string | null;
  catalog_product_id: string | null;
  price_sold: number;
}

type CategoryTab = "services" | "products";

let tempIdCounter = 0;
const generateTempId = () => `review-${Date.now()}-${++tempIdCounter}`;

export default function DayReviewModal({
  open,
  onOpenChange,
  barberId,
  organizationId,
  date,
  onSuccess,
}: DayReviewModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [liveTransactions, setLiveTransactions] = useState<LiveTransaction[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientsCount, setClientsCount] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("services");
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [isSavingPresence, setIsSavingPresence] = useState(false);
  const [statusWarningOpen, setStatusWarningOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<PresenceType | null>(null);

  const [divergenceModal, setDivergenceModal] = useState({
    open: false,
    manualTotal: 0,
    txTotal: 0,
    hasDivergence: false,
  });

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    try {
      const nextDay = format(
        new Date(new Date(`${date}T12:00:00`).getTime() + 86400000),
        "yyyy-MM-dd"
      );

      const [servicesRes, productsRes, liveRes] = await Promise.all([
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
          .select("id, item_name, item_type, service_category, catalog_service_id, catalog_product_id, price_sold")
          .eq("barber_id", barberId)
          .eq("source", "manager")
          .gte("created_at", `${date}T00:00:00`)
          .lt("created_at", `${nextDay}T00:00:00`)
          .order("created_at", { ascending: true }),
      ]);

      const services: CatalogItem[] = (servicesRes.data ?? []).map((item) => ({
        ...item,
        type: "service",
      }));
      const products: CatalogItem[] = (productsRes.data ?? []).map((item) => ({
        ...item,
        type: "product",
      }));
      setCatalogItems([...services, ...products]);

      const live = (liveRes.data ?? []) as LiveTransaction[];
      setLiveTransactions(live);

      // Pre-populate cart with live transactions
      const cartFromLive: CartItem[] = live.map((tx) => ({
        id:
          tx.item_type === "service"
            ? tx.catalog_service_id ?? tx.id
            : tx.catalog_product_id ?? tx.id,
        name: tx.item_name,
        default_price: tx.price_sold,
        fixed_commission: null,
        category: tx.service_category ?? undefined,
        type: tx.item_type,
        tempId: generateTempId(),
        customPrice: tx.price_sold,
        catalogRefId:
          tx.item_type === "service"
            ? tx.catalog_service_id
            : tx.catalog_product_id,
        fromLive: true,
      }));
      setCart(cartFromLive);

      // Estimate clients from basic services count
      const basicServicesCount = live.filter(
        (tx) => tx.item_type === "service" && tx.service_category === "basic"
      ).length;
      setClientsCount(Math.max(1, basicServicesCount));
    } catch (error) {
      console.error("Erro ao buscar dados de conferência:", error);
      toast.error("Erro ao carregar dados do dia");
    } finally {
      setLoadingData(false);
    }
  }, [organizationId, barberId, date]);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

  const resetForm = useCallback(() => {
    setCart([]);
    setSearchQuery("");
    setActiveTab("services");
    setAddItemDialogOpen(false);
    setStatusDialogOpen(false);
    setStatusWarningOpen(false);
    setPendingStatus(null);
    setClientsCount(1);
  }, []);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handleAddToCart = (item: CatalogItem) => {
    setCart((prev) => [
      ...prev,
      {
        ...item,
        tempId: generateTempId(),
        customPrice: item.default_price,
        catalogRefId: item.id,
        fromLive: false,
      },
    ]);
  };

  const updateCartItemPrice = (tempId: string, newPrice: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.tempId === tempId ? { ...item, customPrice: newPrice } : item
      )
    );
  };

  const removeFromCart = (tempId: string) => {
    setCart((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  // Status do dia (folga, falta, etc.)
  const handleRequestStatusConfirm = (selectedStatus: PresenceType) => {
    if (cart.length > 0) {
      setPendingStatus(selectedStatus);
      setStatusWarningOpen(true);
      return;
    }
    handleConfirmStatus(selectedStatus);
  };

  const handleConfirmStatus = async (selectedStatus: PresenceType) => {
    setIsSavingPresence(true);
    try {
      // Get or create daily_production
      const { data: existingProd } = await supabase
        .from("daily_productions")
        .select("id")
        .eq("barber_id", barberId)
        .eq("date", date)
        .maybeSingle();

      if (existingProd) {
        // Delete previous barber transactions
        await supabase
          .from("sale_transactions")
          .delete()
          .eq("daily_production_id", existingProd.id)
          .eq("barber_id", barberId)
          .eq("source", "barber");

        await supabase
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
          .eq("id", existingProd.id);
      } else {
        await supabase.from("daily_productions").insert({
          barber_id: barberId,
          organization_id: organizationId,
          date,
          services_basic_total: 0,
          services_extra_total: 0,
          products_total: 0,
          services_total: 0,
          clients_count: 0,
          services_count: 0,
          products_count: 0,
          confirmed_presence: true,
          presence_type: selectedStatus,
        });
      }

      toast.success("Status do dia registrado!");
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      console.error("Erro ao confirmar status:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao confirmar status"
      );
    } finally {
      setIsSavingPresence(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (cart.length === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    setIsLoading(true);
    try {
      // 1. Get or create daily_production
      let dailyProductionId: string;
      const { data: existingProd } = await supabase
        .from("daily_productions")
        .select("id")
        .eq("barber_id", barberId)
        .eq("date", date)
        .maybeSingle();

      if (existingProd) {
        dailyProductionId = existingProd.id;

        // Delete previous barber transactions
        await supabase
          .from("sale_transactions")
          .delete()
          .eq("daily_production_id", dailyProductionId)
          .eq("barber_id", barberId)
          .eq("source", "barber");
      } else {
        const { data: newProd, error: insertError } = await supabase
          .from("daily_productions")
          .insert({
            barber_id: barberId,
            organization_id: organizationId,
            date,
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

      // 2. Insert barber transactions from cart
      const transactions = cart.map((item) => ({
        organization_id: organizationId,
        barber_id: barberId,
        daily_production_id: dailyProductionId,
        item_name: item.name,
        item_type: item.type,
        service_category: item.category || null,
        catalog_service_id:
          item.type === "service" ? item.catalogRefId : null,
        catalog_product_id:
          item.type === "product" ? item.catalogRefId : null,
        price_sold: item.customPrice,
        commission_rate_used: 0,
        commission_amount: 0,
        source: "barber",
        created_at: `${date}T12:00:00`,
      }));

      const { error: insertError } = await supabase
        .from("sale_transactions")
        .insert(transactions);
      if (insertError) throw insertError;

      // 3. Update clients_count
      await supabase
        .from("daily_productions")
        .update({
          manual_clients_count: clientsCount,
          clients_count: clientsCount,
          confirmed_presence: true,
          presence_type: "present",
        })
        .eq("id", dailyProductionId);

      // 4. Check divergence
      let servicesBasicTotal = 0;
      let servicesExtraTotal = 0;
      let productsTotal = 0;
      cart.forEach((item) => {
        if (item.type === "product") productsTotal += item.customPrice;
        else if (item.category === "extra")
          servicesExtraTotal += item.customPrice;
        else servicesBasicTotal += item.customPrice;
      });

      const manualTotal =
        servicesBasicTotal + servicesExtraTotal + productsTotal;
      const txTotal = liveTransactions.reduce(
        (sum, tx) => sum + tx.price_sold,
        0
      );

      let hasDivergence = false;
      if (txTotal > 0) {
        const percentDiff = Math.abs((manualTotal - txTotal) / txTotal);
        hasDivergence = percentDiff > 0.05;
      }

      if (txTotal > 0) {
        setDivergenceModal({
          open: true,
          manualTotal,
          txTotal,
          hasDivergence,
        });
      } else {
        toast.success("Produção confirmada com sucesso!");
      }

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      console.error("Erro ao confirmar produção:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao confirmar produção"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  const shortDate = format(new Date(`${date}T00:00:00`), "dd/MM/yyyy", {
    locale: ptBR,
  });

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.customPrice, 0),
    [cart]
  );

  const liveTotal = useMemo(
    () => liveTransactions.reduce((sum, tx) => sum + tx.price_sold, 0),
    [liveTransactions]
  );

  const filteredCatalogItems = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return catalogItems.filter((item) => {
      const matchesTab =
        (activeTab === "services" && item.type === "service") ||
        (activeTab === "products" && item.type === "product");
      const matchesSearch = !query || item.name.toLowerCase().includes(query);
      return matchesTab && matchesSearch;
    });
  }, [catalogItems, activeTab, searchQuery]);

  const serviceCount = catalogItems.filter((i) => i.type === "service").length;
  const productCount = catalogItems.filter((i) => i.type === "product").length;

  const liveItemsInCart = cart.filter((i) => i.fromLive).length;
  const addedItems = cart.filter((i) => !i.fromLive).length;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-xl h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 md:px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Conferência do Dia
            </DialogTitle>
            <DialogDescription className="text-sm">
              {shortDate} • {liveTransactions.length} itens registrados pela
              recepção
            </DialogDescription>
          </DialogHeader>

          {loadingData ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Live summary banner */}
              {liveTransactions.length > 0 && (
                <div className="px-4 md:px-6 py-3 border-b bg-primary/5 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-primary/40 text-primary"
                      >
                        AO VIVO
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {liveTransactions.length} itens •{" "}
                        {formatCurrency(liveTotal)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Registrado pela recepção
                    </span>
                  </div>
                </div>
              )}

              {/* Clients count */}
              <div className="px-4 md:px-6 py-3 border-b bg-muted/30 shrink-0">
                <div className="flex items-center justify-between rounded-lg border bg-background px-3 min-h-12">
                  <Label className="text-sm font-semibold">
                    Clientes Atendidos
                  </Label>
                  <span className="text-xl font-black">{clientsCount}</span>
                </div>
              </div>

              <form
                onSubmit={handleSubmit}
                className="flex-1 min-h-0 flex flex-col"
              >
                <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-3 space-y-2">
                  {/* Cart items */}
                  {cart.length === 0 ? (
                    <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
                      <ShoppingCart className="mx-auto h-8 w-8 mb-2 opacity-60" />
                      <p className="text-sm">
                        Nenhum item para conferir neste dia.
                      </p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div
                        key={item.tempId}
                        className={cn(
                          "flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 bg-background",
                          item.fromLive && "border-primary/20 bg-primary/5"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {item.type === "service" ? (
                              <Scissors className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            ) : (
                              <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-sm font-medium truncate">
                              {item.name}
                            </span>
                            {item.fromLive && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1 py-0 border-primary/30 text-primary"
                              >
                                AO VIVO
                              </Badge>
                            )}
                          </div>
                          {item.category && (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-5">
                              {item.category === "basic"
                                ? "Básico"
                                : "Extra"}
                            </span>
                          )}
                        </div>
                        <div className="w-28 h-9 rounded-md border bg-muted/30 flex items-center justify-end px-2 text-sm font-medium">
                          {formatCurrency(item.customPrice)}
                        </div>
                      </div>
                    ))
                  )}

                </div>

                {/* Footer */}
                <div className="border-t px-4 md:px-6 py-4 shrink-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Total conferido
                      </p>
                      <p className="text-xl font-bold">
                        {formatCurrency(cartTotal)}
                      </p>
                    </div>
                    {liveTotal > 0 && cartTotal !== liveTotal && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Total AO VIVO
                        </p>
                        <p
                          className={cn(
                            "text-sm font-medium",
                            Math.abs(cartTotal - liveTotal) / liveTotal > 0.05
                              ? "text-destructive"
                              : "text-success"
                          )}
                        >
                          {formatCurrency(liveTotal)}
                        </p>
                      </div>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isLoading || cart.length === 0}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Confirmando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Confirmar Produção do Dia
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle className="text-base">Adicionar Item</DialogTitle>
          </DialogHeader>
          <div className="px-4 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="px-4 pb-2 shrink-0">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as CategoryTab)}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="services" className="gap-1.5">
                  <Scissors className="w-4 h-4" />
                  Serviços
                  {serviceCount > 0 && (
                    <Badge variant="secondary" className="text-xs ml-1">
                      {serviceCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="products" className="gap-1.5">
                  <Package className="w-4 h-4" />
                  Produtos
                  {productCount > 0 && (
                    <Badge variant="secondary" className="text-xs ml-1">
                      {productCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-1">
            {filteredCatalogItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                Nenhum item encontrado
              </p>
            ) : (
              filteredCatalogItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-accent transition-colors text-left"
                  onClick={() => {
                    handleAddToCart(item);
                    setAddItemDialogOpen(false);
                    setSearchQuery("");
                  }}
                >
                  <div className="flex items-center gap-2">
                    {item.type === "service" ? (
                      <Scissors className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Package className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.category && (
                        <p className="text-[10px] uppercase text-muted-foreground">
                          {item.category === "basic" ? "Básico" : "Extra"}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {formatCurrency(item.default_price)}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Status do Dia Dialog */}
      <StatusDoDiaDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        barberId={barberId}
        date={date}
        isLoading={isSavingPresence}
        onConfirm={handleRequestStatusConfirm}
      />

      {/* Warning: items will be lost */}
      <AlertDialog open={statusWarningOpen} onOpenChange={setStatusWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar itens?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem {cart.length} itens no carrinho. Ao confirmar o status do
              dia como folga/falta, todos os itens serão descartados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStatus) handleConfirmStatus(pendingStatus);
                setStatusWarningOpen(false);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Divergence Modal */}
      <DivergenceModal
        open={divergenceModal.open}
        onClose={() =>
          setDivergenceModal((prev) => ({ ...prev, open: false }))
        }
        manualTotal={divergenceModal.manualTotal}
        txTotal={divergenceModal.txTotal}
        hasDivergence={divergenceModal.hasDivergence}
      />
    </>
  );
}
