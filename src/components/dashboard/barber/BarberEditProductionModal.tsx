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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ChevronDown,
  Loader2,
  Minus,
  Package,
  Plus,
  Scissors,
  Search,
  ShoppingCart,
  Trash2,
  History,
} from "lucide-react";
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
  tempId: string;
  customPrice: number;
  catalogRefId: string | null;
}

interface ExistingProduction {
  services_basic_total: number;
  services_extra_total: number;
  products_total: number;
  clients_count: number;
  tx_basic_total: number;
  tx_extra_total: number;
  tx_products_total: number;
}

interface PreviousCommandItem {
  id: string;
  item_name: string;
  item_type: "service" | "product";
  service_category: string | null;
  catalog_service_id: string | null;
  catalog_product_id: string | null;
  price_sold: number;
  created_at: string | null;
}

type CategoryTab = "services" | "products";
type PresenceType = "present" | "day_off" | "absence";

let tempIdCounter = 0;
const generateTempId = () => `edit-${Date.now()}-${++tempIdCounter}`;

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
  const [isSavingPresence, setIsSavingPresence] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("services");
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);

  const [existingData, setExistingData] = useState<ExistingProduction | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [previousCommandItems, setPreviousCommandItems] = useState<PreviousCommandItem[]>([]);
  const [clientsCount, setClientsCount] = useState(1);
  const [statusWarningOpen, setStatusWarningOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<PresenceType | null>(null);

  const [divergenceModal, setDivergenceModal] = useState({
    open: false,
    manualTotal: 0,
    txTotal: 0,
    hasDivergence: false,
  });

  const fetchData = useCallback(async () => {
    setLoadingCatalog(true);

    try {
      const [servicesRes, productsRes, productionRes, previousTransactionsRes] = await Promise.all([
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
          .select("services_basic_total, services_extra_total, products_total, clients_count, tx_basic_total, tx_extra_total, tx_products_total")
          .eq("id", productionId)
          .single(),
        supabase
          .from("sale_transactions")
          .select("id, item_name, item_type, service_category, catalog_service_id, catalog_product_id, price_sold, created_at")
          .eq("daily_production_id", productionId)
          .eq("barber_id", barberId)
          .eq("source", "barber")
          .order("created_at", { ascending: true }),
      ]);

      const services: CatalogItem[] = (servicesRes.data ?? []).map((item) => ({ ...item, type: "service" }));
      const products: CatalogItem[] = (productsRes.data ?? []).map((item) => ({ ...item, type: "product" }));

      setCatalogItems([...services, ...products]);

      const previousItems = (previousTransactionsRes.data ?? []) as PreviousCommandItem[];
      setPreviousCommandItems(previousItems);

      const stagedFromPrevious: CartItem[] = previousItems.map((transaction) => ({
        id: transaction.item_type === "service"
          ? transaction.catalog_service_id ?? transaction.id
          : transaction.catalog_product_id ?? transaction.id,
        name: transaction.item_name,
        default_price: transaction.price_sold,
        fixed_commission: null,
        category: transaction.service_category ?? undefined,
        type: transaction.item_type,
        tempId: generateTempId(),
        customPrice: transaction.price_sold,
        catalogRefId: transaction.item_type === "service" ? transaction.catalog_service_id : transaction.catalog_product_id,
      }));
      setCart(stagedFromPrevious);

      if (productionRes.data) {
        setExistingData({
          services_basic_total: productionRes.data.services_basic_total ?? 0,
          services_extra_total: productionRes.data.services_extra_total ?? 0,
          products_total: productionRes.data.products_total ?? 0,
          clients_count: productionRes.data.clients_count ?? 0,
          tx_basic_total: productionRes.data.tx_basic_total ?? 0,
          tx_extra_total: productionRes.data.tx_extra_total ?? 0,
          tx_products_total: productionRes.data.tx_products_total ?? 0,
        });
        setClientsCount(productionRes.data.clients_count && productionRes.data.clients_count > 0 ? productionRes.data.clients_count : 1);
      }
    } catch (error) {
      console.error("Erro ao buscar dados de edição:", error);
      toast.error("Não foi possível carregar os dados da produção");
    } finally {
      setLoadingCatalog(false);
    }
  }, [organizationId, productionId, barberId]);

  useEffect(() => {
    if (open && organizationId && productionId) {
      fetchData();
    }
  }, [open, organizationId, productionId, fetchData]);

  const resetForm = useCallback(() => {
    setCart([]);
    setPreviousCommandItems([]);
    setSearchQuery("");
    setActiveTab("services");
    setAddItemDialogOpen(false);
    setStatusWarningOpen(false);
    setPendingStatus(null);
    setExistingData(null);
    setClientsCount(1);
  }, []);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handleAddToCart = (item: CatalogItem) => {
    setCart((prev) => [...prev, { ...item, tempId: generateTempId(), customPrice: item.default_price, catalogRefId: item.id }]);
  };

  const updateCartItemPrice = (tempId: string, newPrice: number) => {
    setCart((prev) => prev.map((item) => (item.tempId === tempId ? { ...item, customPrice: newPrice } : item)));
  };

  const removeFromCart = (tempId: string) => {
    setCart((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const handleConfirmStatus = async (selectedStatus: PresenceType) => {
    setIsSavingPresence(true);
    try {
      const { error: deleteError } = await supabase
        .from("sale_transactions")
        .delete()
        .eq("daily_production_id", productionId)
        .eq("barber_id", barberId)
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
        .eq("id", productionId)
        .eq("barber_id", barberId);

      if (updateError) throw updateError;

      toast.success("Status do dia registrado com sucesso!");
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (cart.length === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    setIsLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from("sale_transactions")
        .delete()
        .eq("daily_production_id", productionId)
        .eq("source", "barber");

      if (deleteError) throw deleteError;

      const transactions = cart.map((item) => ({
        organization_id: organizationId,
        barber_id: barberId,
        daily_production_id: productionId,
        item_name: item.name,
        item_type: item.type,
        service_category: item.category || null,
        catalog_service_id: item.type === "service" ? item.catalogRefId : null,
        catalog_product_id: item.type === "product" ? item.catalogRefId : null,
        price_sold: item.customPrice,
        commission_rate_used: 0,
        commission_amount: 0,
        source: "barber",
      }));

      if (transactions.length > 0) {
        const { error: insertError } = await supabase.from("sale_transactions").insert(transactions);
        if (insertError) throw insertError;
      }

      const { error: updateError } = await supabase
        .from("daily_productions")
        .update({ manual_clients_count: clientsCount, clients_count: clientsCount })
        .eq("id", productionId);

      if (updateError) throw updateError;

      let servicesBasicTotal = 0;
      let servicesExtraTotal = 0;
      let productsTotal = 0;

      cart.forEach((item) => {
        if (item.type === "product") productsTotal += item.customPrice;
        else if (item.category === "extra") servicesExtraTotal += item.customPrice;
        else servicesBasicTotal += item.customPrice;
      });

      const manualTotal = servicesBasicTotal + servicesExtraTotal + productsTotal;
      const txTotal = existingData ? existingData.tx_basic_total + existingData.tx_extra_total + existingData.tx_products_total : 0;

      let hasDivergence = false;
      if (txTotal > 0) {
        const percentDiff = Math.abs((manualTotal - txTotal) / txTotal);
        hasDivergence = percentDiff > 0.05;
      }

      if (txTotal > 0) {
        setDivergenceModal({ open: true, manualTotal, txTotal, hasDivergence });
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const shortDate = format(new Date(`${productionDate}T00:00:00`), "dd/MM/yyyy", { locale: ptBR });

  const existingTotal = useMemo(() => {
    if (!existingData) return 0;
    return existingData.services_basic_total + existingData.services_extra_total + existingData.products_total;
  }, [existingData]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.customPrice, 0), [cart]);

  const previousCommandTotal = useMemo(() => previousCommandItems.reduce((sum, item) => sum + item.price_sold, 0), [previousCommandItems]);

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

  const serviceCount = catalogItems.filter((item) => item.type === "service").length;
  const productCount = catalogItems.filter((item) => item.type === "product").length;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-xl h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 md:px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="text-lg font-bold">Editar Produção</DialogTitle>
            <DialogDescription className="text-sm">{shortDate}</DialogDescription>
          </DialogHeader>

          <div className="px-4 md:px-6 py-3 border-b bg-muted/30 shrink-0">
            <div className="flex items-center justify-between rounded-lg border bg-background px-3 min-h-12">
              <Label className="text-sm font-semibold">Clientes Atendidos</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-12"
                  onClick={() => setClientsCount((prev) => Math.max(0, prev - 1))}
                  disabled={clientsCount <= 0}
                >
                  <Minus className="h-5 w-5" />
                </Button>
                <span className="w-10 text-center text-xl font-black">{clientsCount}</span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-12"
                  onClick={() => setClientsCount((prev) => prev + 1)}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-3 space-y-2">
              {previousCommandItems.length > 0 && (
                <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico da comanda anterior</p>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{formatCurrency(previousCommandTotal)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Somente visualização para conferência. Ao salvar, o lançamento antigo é substituído pelo corrigido.</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {previousCommandItems.map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between rounded-md bg-background px-2 py-1.5 text-xs">
                        <span className="truncate">{transaction.item_name}</span>
                        <span className="font-medium">{formatCurrency(transaction.price_sold)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cart.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-muted-foreground">
                  <ShoppingCart className="mx-auto h-8 w-8 mb-2 opacity-60" />
                  <p className="text-sm">Nenhum item lançado ainda.</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.tempId}
                    className="flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 bg-background"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      {item.category && (
                        <Badge variant={item.category === "basic" ? "secondary" : "default"} className="mt-1 text-[10px]">
                          {item.category === "basic" ? "Básico" : "Extra"}
                        </Badge>
                      )}
                    </div>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="ghost" className="h-12 px-2 font-bold text-sm">
                          {formatCurrency(item.customPrice)}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 space-y-2">
                        <p className="text-sm font-medium">Editar preço</p>
                        <CurrencyInput value={item.customPrice} onChange={(value) => updateCartItemPrice(item.tempId, value)} />
                      </PopoverContent>
                    </Popover>

                    <Button
                      type="button"
                      variant="ghost"
                      className="h-12 w-12 text-destructive hover:text-destructive"
                      onClick={() => removeFromCart(item.tempId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full min-h-12"
                onClick={() => setAddItemDialogOpen(true)}
              >
                + Adicionar Serviço/Produto
              </Button>

              {existingTotal > 0 && (
                <div className="rounded-lg border bg-primary/5 border-primary/20 px-3 py-2 text-xs">
                  <p>
                    Anterior: <strong>{formatCurrency(existingTotal)}</strong> · Novo: <strong>{formatCurrency(cartTotal)}</strong>
                  </p>
                </div>
              )}
            </div>

            <div className="border-t px-4 md:px-6 py-3 flex flex-wrap items-center gap-2 bg-muted/30 shrink-0">
              <div className="text-sm text-muted-foreground">
                {cart.length} {cart.length === 1 ? "item" : "itens"} · <strong className="text-foreground">{formatCurrency(cartTotal)}</strong>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="outline" className="h-11" onClick={() => handleClose(false)} disabled={isLoading || isSavingPresence}>
                  Cancelar
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" className="h-11" disabled={isLoading || isSavingPresence}>
                      Registrar Presença
                      <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => handleRequestStatusConfirm("present")}>Trabalhei mas não vendi</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleRequestStatusConfirm("day_off")}>Folga</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleRequestStatusConfirm("absence")}>Falta / Atestado</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button type="submit" className="h-11" disabled={isLoading || isSavingPresence || cart.length === 0}>
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
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
        <DialogContent className="max-w-lg p-0 gap-0">
          <DialogHeader className="px-4 py-4 border-b">
            <DialogTitle>Adicionar Serviço/Produto</DialogTitle>
            <DialogDescription>Toque para adicionar rapidamente ao extrato.</DialogDescription>
          </DialogHeader>

          <div className="px-4 py-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar serviço ou produto..."
                className="pl-9 h-11"
              />
            </div>
          </div>

          <div className="px-4 py-3 border-b">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CategoryTab)}>
              <TabsList className="grid w-full grid-cols-2 h-11">
                <TabsTrigger value="services" className="gap-1.5">
                  <Scissors className="h-4 w-4" /> Serviços ({serviceCount})
                </TabsTrigger>
                <TabsTrigger value="products" className="gap-1.5">
                  <Package className="h-4 w-4" /> Produtos ({productCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="max-h-[45vh] overflow-y-auto px-2 py-2">
            {loadingCatalog ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredCatalogItems.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">Nenhum item encontrado.</div>
            ) : (
              filteredCatalogItems.map((item) => {
                const inCartCount = cart.filter((cartItem) => cartItem.id === item.id).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "w-full min-h-12 flex items-center justify-between gap-2 text-left rounded-md px-3 py-2 hover:bg-accent",
                      inCartCount > 0 && "bg-primary/5"
                    )}
                    onClick={() => handleAddToCart(item)}
                  >
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.category && (
                        <p className="text-xs text-muted-foreground">{item.category === "basic" ? "Serviço básico" : "Serviço extra"}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(item.default_price)}</p>
                      {inCartCount > 0 && <p className="text-xs text-primary">No extrato: {inCartCount}</p>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

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
        onClose={() => setDivergenceModal((prev) => ({ ...prev, open: false }))}
        manualTotal={divergenceModal.manualTotal}
        txTotal={divergenceModal.txTotal}
        hasDivergence={divergenceModal.hasDivergence}
      />
    </>
  );
}
