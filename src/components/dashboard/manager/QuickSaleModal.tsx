import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import {
  Loader2,
  Search,
  Scissors,
  Package,
  Zap,
  Hash,
  Check,
  Minus,
  Plus,
  Users,
  Building2,
  Home,
  UserPlus,
  CalendarIcon,
  ChevronLeft,
  X,
  Phone,
  Smartphone,
  Crown,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getManausDate, getTodayString } from "@/lib/dateUtils";
import { formatPhone, isValidPhone, sanitizePhone } from "@/lib/phoneUtils";
import { useClientHistory } from "@/hooks/useClientHistory";
import { useClientAutocomplete } from "@/hooks/useClientAutocomplete";
import { registerClientOrThrow } from "@/lib/clientRegistry";
import { recordClientPurchasesBestEffort } from "@/lib/clientPurchaseHistory";


interface QuickSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barberId: string;
  barberName: string;
  organizationId: string;
  onSuccess: () => void;
  initialIsNewClient?: boolean;
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

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
}

type CategoryTab = "services" | "products" | "manual";

type ClientType = "new" | "without_subscription" | "with_subscription";

const normalizePlanLabel = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeServiceLabel = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const getSubscriptionIncludedServices = (planName: string, availableServiceNames: string[]) => {
  const normalizedPlan = normalizePlanLabel(planName);
  const includes = new Set<string>();

  const hasInfantilService = availableServiceNames.some((name) =>
    normalizeServiceLabel(name).includes("infantil")
  );

  // Regra específica: clube da barba cobre apenas barba
  if (normalizedPlan.includes("clube da barba")) {
    includes.add("barba");
    return includes;
  }

  // Regra específica: plano infantil cobre corte infantil; fallback para corte adulto
  if (normalizedPlan.includes("infantil")) {
    includes.add(hasInfantilService ? "corte_infantil" : "corte");
    return includes;
  }

  // Regra geral dos planos de assinatura da casa
  includes.add("corte");

  if (normalizedPlan.includes("barba")) {
    includes.add("barba");
  }

  if (normalizedPlan.includes("gold")) {
    includes.add("sobrancelha");
  }

  return includes;
};

const serviceIsIncludedInPlan = (
  serviceName: string,
  planName: string,
  availableServiceNames: string[]
) => {
  const normalizedService = normalizeServiceLabel(serviceName);
  const includedServices = getSubscriptionIncludedServices(planName, availableServiceNames);

  if (includedServices.has("corte_infantil") && normalizedService.includes("infantil")) return true;
  if (includedServices.has("corte") && normalizedService.includes("corte")) return true;
  if (includedServices.has("barba") && normalizedService.includes("barba")) return true;
  if (includedServices.has("sobrancelha") && normalizedService.includes("sobrancelha")) return true;

  return false;
};

const isSubscriptionPlanFieldMissing = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  return (
    message.includes("subscription_plan_id") ||
    details.includes("subscription_plan_id") ||
    message.includes("schema cache")
  );
};

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
  initialIsNewClient,
}: QuickSaleModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const isSubmittingRef = useRef(false);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("services");
  
  // Wizard step
  const [step, setStep] = useState<1 | 2>(1);
  
  // Cart state (individualized with tempId)
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientsCount, setClientsCount] = useState(1);
  
  // Manual sale state
  const [manualValue, setManualValue] = useState("");
  const [manualCategory, setManualCategory] = useState<"basic" | "extra" | "product">("basic");
  
  // Reception mode (no barber attribution)
  const [isReceptionSale, setIsReceptionSale] = useState(false);

  // Client type tracking (for conversion metrics and assinatura status)
  const [clientType, setClientType] = useState<ClientType>(initialIsNewClient ? "new" : "without_subscription");
  const [clientName, setClientName] = useState("");
  const [manualOverride, setManualOverride] = useState(false);

  // Phone state
  const [mobilePhone, setMobilePhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [selectedSubscriptionPlanId, setSelectedSubscriptionPlanId] = useState<string>("");
  const [subscriptionPlanAutoDetected, setSubscriptionPlanAutoDetected] = useState(false);
  const [isResolvingSubscription, setIsResolvingSubscription] = useState(false);
  const [selectedPlanIncludedServiceIds, setSelectedPlanIncludedServiceIds] = useState<string[]>([]);

  // Client history hook
  const clientHistory = useClientHistory(organizationId);
  const { nameSuggestions, phoneSuggestions, loading: loadingClientSuggestions } = useClientAutocomplete({
    organizationId,
    nameQuery: clientName,
    phoneQuery: mobilePhone,
    enabled: open,
  });

  // Date picker state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Fetch catalog items
  useEffect(() => {
    if (open && organizationId) {
      fetchCatalog();
      fetchSubscriptionPlans();
    }
  }, [open, organizationId, barberId]);

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

  const fetchSubscriptionPlans = async () => {
    try {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, price")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name");

      if (error) {
        if (isSubscriptionPlanFieldMissing(error)) {
          setSelectedSubscriptionPlanId("");
          setSubscriptionPlanAutoDetected(false);
          return;
        }
        throw error;
      }
      setSubscriptionPlans(data || []);
    } catch (error) {
      console.error("Erro ao carregar planos de assinatura:", error);
      setSubscriptionPlans([]);
    }
  };

  const resetForm = () => {
    setStep(1);
    setCart([]);
    setClientsCount(1);
    setManualValue("");
    setManualCategory("basic");
    setSearchQuery("");
    setActiveTab("services");
    setIsReceptionSale(false);
    setClientType(initialIsNewClient ? "new" : "without_subscription");
    setClientName("");
    setMobilePhone("");
    setPhoneError(null);
    setSelectedSubscriptionPlanId("");
    setSubscriptionPlanAutoDetected(false);
    setIsResolvingSubscription(false);
    setSelectedPlanIncludedServiceIds([]);
    setManualOverride(false);
    clientHistory.reset();
    setSelectedDate(new Date());
    setDatePickerOpen(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  // Phone input handler with mask
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatPhone(raw);
    setMobilePhone(formatted);

    const digits = sanitizePhone(raw);
    const matchedClient = phoneSuggestions.find((client) => client.mobile_phone === digits);
    if (matchedClient) {
      setClientName(matchedClient.name);
      if (!manualOverride) setClientType("without_subscription");
    }
    if (digits.length === 11) {
      if (!isValidPhone(raw)) {
        setPhoneError("Telefone inválido");
      } else {
        setPhoneError(null);
      }
    } else if (digits.length > 0 && digits.length < 11) {
      setPhoneError(null); // Still typing
    } else {
      setPhoneError(null);
    }
  };

  // Phone blur: trigger history check
  const handlePhoneBlur = useCallback(async () => {
    const digits = sanitizePhone(mobilePhone);
    if (digits.length !== 11 || !isValidPhone(mobilePhone)) return;

    const res = await clientHistory.checkHistory(mobilePhone, clientName);
    if (!res) return;

    if (res.status === "phone_found" && res.suggestedName) {
      setClientName(res.suggestedName);
      if (!manualOverride) setClientType("without_subscription");
    } else if (res.status === "name_found") {
      if (!manualOverride) setClientType("without_subscription");
    } else if (res.status === "not_found") {
      // Não muda automaticamente — o gestor decide manualmente
    }
  }, [mobilePhone, clientName, manualOverride, clientHistory]);

  // Name blur: re-check if phone wasn't found
  const handleNameBlur = useCallback(async () => {
    if (clientHistory.status === "not_found" || clientHistory.status === "idle") {
      const digits = sanitizePhone(mobilePhone);
      if (digits.length === 11 && isValidPhone(mobilePhone) && clientName.trim().length >= 3) {
        const res = await clientHistory.checkHistory(mobilePhone, clientName);
        if (res && res.status === "name_found" && !manualOverride) {
          setClientType("without_subscription");
        }
      }
    }
  }, [mobilePhone, clientName, manualOverride, clientHistory]);

  // Handle manual override of client type
  const handleClientTypeChange = (value: ClientType) => {
    setManualOverride(true);
    setClientType(value);
    if (value !== "with_subscription") {
      setSelectedSubscriptionPlanId("");
      setSubscriptionPlanAutoDetected(false);
    }
  };

  // Cart operations (individualized with tempId)
  const handleAddToCart = (item: CatalogItem) => {
    const effectivePrice = getEffectiveItemPrice(item, item.default_price);
    setCart(prev => [...prev, {
      ...item,
      tempId: crypto.randomUUID(),
      customPrice: effectivePrice,
      customPriceInput: effectivePrice.toFixed(2).replace(".", ","),
    }]);

    if (effectivePrice === 0 && selectedSubscriptionPlan?.name) {
      toast.info(`Serviço incluído na assinatura ${selectedSubscriptionPlan.name}. Valor zerado automaticamente.`);
    }
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

      const cleaned = newValue.replace(/[^\d,.\-]/g, "");
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
  const availableServiceNames = useMemo(
    () => services.map((service) => service.name),
    [services]
  );
  const selectedSubscriptionPlan = useMemo(
    () => subscriptionPlans.find((plan) => plan.id === selectedSubscriptionPlanId) || null,
    [subscriptionPlans, selectedSubscriptionPlanId]
  );

  useEffect(() => {
    const fetchIncludedServices = async () => {
      if (!selectedSubscriptionPlanId) {
        setSelectedPlanIncludedServiceIds([]);
        return;
      }

      const { data, error } = await supabase
        .from("subscription_plan_services")
        .select("catalog_service_id")
        .eq("subscription_plan_id", selectedSubscriptionPlanId)
        .eq("organization_id", organizationId);

      if (error) {
        console.error("Erro ao carregar serviços do plano:", error);
        setSelectedPlanIncludedServiceIds([]);
        return;
      }

      setSelectedPlanIncludedServiceIds((data || []).map((row) => row.catalog_service_id));
    };

    void fetchIncludedServices();
  }, [organizationId, selectedSubscriptionPlanId]);

  const resolveSubscriptionForClient = useCallback(async () => {
    if (clientType !== "with_subscription") {
      return;
    }

    const phoneDigitsToLookup = sanitizePhone(mobilePhone);
    if (phoneDigitsToLookup.length !== 11 || !isValidPhone(mobilePhone)) {
      setSelectedSubscriptionPlanId("");
      setSubscriptionPlanAutoDetected(false);
      return;
    }

    setIsResolvingSubscription(true);

    try {
      const { data, error } = await (supabase
        .from("clients") as any)
        .select("subscription_plan_id")
        .eq("organization_id", organizationId)
        .eq("mobile_phone", phoneDigitsToLookup)
        .maybeSingle();

      if (error) throw error;

      if (data?.subscription_plan_id) {
        setSelectedSubscriptionPlanId(data.subscription_plan_id);
        setSubscriptionPlanAutoDetected(true);
      } else {
        setSelectedSubscriptionPlanId("");
        setSubscriptionPlanAutoDetected(false);
      }
    } catch (error) {
      console.error("Erro ao identificar assinatura do cliente:", error);
      setSelectedSubscriptionPlanId("");
      setSubscriptionPlanAutoDetected(false);
    } finally {
      setIsResolvingSubscription(false);
    }
  }, [clientType, mobilePhone, organizationId]);

  useEffect(() => {
    void resolveSubscriptionForClient();
  }, [resolveSubscriptionForClient]);

  const getEffectiveItemPrice = (item: CatalogItem, enteredPrice: number) => {
    if (
      clientType === "with_subscription" &&
      item.type === "service" &&
      selectedPlanIncludedServiceIds.includes(item.id)
    ) {
      return 0;
    }

    return enteredPrice;
  };

  useEffect(() => {
    setCart((prev) => {
      if (clientType !== "with_subscription" || selectedPlanIncludedServiceIds.length === 0) return prev;

      let changed = false;
      const next = prev.map((item) => {
        if (
          item.type === "service" &&
          item.customPrice !== 0 &&
          selectedPlanIncludedServiceIds.includes(item.catalogItemId)
        ) {
          changed = true;
          return { ...item, customPrice: 0, customPriceInput: "0,00" };
        }
        return item;
      });

      return changed ? next : prev;
    });
  }, [clientType, selectedPlanIncludedServiceIds]);

  const cartItemIncludedBySubscription = (item: CartItem) => {
    return (
      clientType === "with_subscription" &&
      item.type === "service" &&
      selectedPlanIncludedServiceIds.includes(item.catalogItemId)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (activeTab === "manual") {
      await handleManualSale();
    } else {
      await handleCartCheckout();
    }
  };

  const ensureSubscriptionAssigned = async (mobilePhoneSanitized: string) => {
    if (clientType !== "with_subscription") return;

    if (!selectedSubscriptionPlanId) {
      throw new Error("Selecione a assinatura do cliente para continuar.");
    }

    const { error } = await (supabase
      .from("clients") as any)
      .update({ subscription_plan_id: selectedSubscriptionPlanId })
      .eq("organization_id", organizationId)
      .eq("mobile_phone", mobilePhoneSanitized);

    if (error && !isSubscriptionPlanFieldMissing(error)) throw error;
  };

  // Check if phone is valid for proceeding
  const phoneDigits = sanitizePhone(mobilePhone);
  const isPhoneComplete = phoneDigits.length === 11 && isValidPhone(mobilePhone);
  const hasClientName = clientName.trim().length >= 3;
  const hasSubscriptionResolved =
    clientType !== "with_subscription" || (!!selectedSubscriptionPlanId && !isResolvingSubscription);
  const canProceedStep1 =
    isPhoneComplete && hasClientName && !clientHistory.checking && !phoneError && hasSubscriptionResolved;

  const handleCartCheckout = async () => {
    if (isSubmittingRef.current) return;
    if (cart.length === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    isSubmittingRef.current = true;
    setIsLoading(true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const effectiveBarberId = isReceptionSale ? null : barberId;
    const phoneSanitized = sanitizePhone(mobilePhone) || null;

    try {
      if (!phoneSanitized || !clientName.trim()) {
        toast.error("Preencha nome e celular do cliente");
        return;
      }

      const registeredClient = await registerClientOrThrow({
        organizationId,
        clientName,
        mobilePhone: phoneSanitized,
      });

      await ensureSubscriptionAssigned(registeredClient.mobilePhone);

      if (registeredClient.reusedByPhone && registeredClient.clientName !== clientName.trim()) {
        toast.info(`Cliente identificado pelo celular: ${registeredClient.clientName}`);
      }

      // Look up or create daily_production
      let productionId: string | null = null;
      
      if (!isReceptionSale) {
        const { data: existingProduction } = await supabase
          .from("daily_productions")
          .select("id")
          .eq("barber_id", barberId)
          .eq("date", dateStr)
          .maybeSingle();

        if (existingProduction) {
          productionId = existingProduction.id;
        } else {
          const { data: newProd } = await supabase
            .from("daily_productions")
            .insert({
              organization_id: organizationId,
              barber_id: barberId,
              date: dateStr,
              services_total: 0,
              products_total: 0,
              clients_count: 0,
              services_count: 0,
              products_count: 0,
              commission_earned: 0,
              confirmed_presence: false,
            })
            .select("id")
            .single();
          productionId = newProd?.id || null;
        }
      }

      // 1 transaction per cart item (individualized)
      const transactions = cart.map(item => {
        const effectivePrice = getEffectiveItemPrice(item, item.customPrice);

        return {
        organization_id: organizationId,
        barber_id: effectiveBarberId,
        daily_production_id: productionId,
        item_type: item.type,
        catalog_service_id: item.type === "service" ? item.id : null,
        catalog_product_id: item.type === "product" ? item.id : null,
        item_name: item.name,
        service_category: item.type === "service" ? item.category : null,
        price_sold: effectivePrice,
        commission_rate_used: 0,
        commission_amount: 0,
        is_new_client: clientType === "new",
        client_name: registeredClient.clientName,
        mobile_phone: registeredClient.mobilePhone,
        created_at: selectedDate.toISOString(),
      }});

      const { error } = await supabase.from("sale_transactions").insert(transactions as any);
      if (error) throw error;

      await recordClientPurchasesBestEffort({
        organizationId,
        clientName: registeredClient.clientName,
        mobilePhone: registeredClient.mobilePhone,
        purchases: cart.map((item) => ({
          itemName: item.name,
          itemType: item.type,
          amount: getEffectiveItemPrice(item, item.customPrice),
          quantity: 1,
          purchasedAt: selectedDate.toISOString(),
        })),
      });

      const sellerName = isReceptionSale ? "Recepção / Loja" : barberName;
      toast.success(`${cart.length} ${cart.length === 1 ? 'item registrado' : 'itens registrados'} para ${sellerName}`, {
        description: `Total: R$ ${cartTotal.toFixed(2)} • ${clientsCount} ${clientsCount === 1 ? 'cliente' : 'clientes'}`,
      });

      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error registering sale:", error);
      toast.error(error?.message || "Erro ao registrar venda");
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleManualSale = async () => {
    if (isSubmittingRef.current) return;
    const numericValue = parseFloat(manualValue.replace(",", "."));
    if (isNaN(numericValue) || numericValue <= 0) {
      toast.error("Informe um valor válido");
      return;
    }

    isSubmittingRef.current = true;
    setIsLoading(true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    try {
      const phoneSanitized = sanitizePhone(mobilePhone);
      if (!phoneSanitized || !clientName.trim()) {
        toast.error("Preencha nome e celular do cliente");
        return;
      }

      const registeredClient = await registerClientOrThrow({
        organizationId,
        clientName,
        mobilePhone: phoneSanitized,
      });

      await ensureSubscriptionAssigned(registeredClient.mobilePhone);

      if (registeredClient.reusedByPhone && registeredClient.clientName !== clientName.trim()) {
        toast.info(`Cliente identificado pelo celular: ${registeredClient.clientName}`);
      }

      // Buscar ou criar daily_production
      let productionId: string | null = null;
      const { data: existingProduction } = await supabase
        .from("daily_productions")
        .select("id")
        .eq("barber_id", barberId)
        .eq("date", dateStr)
        .maybeSingle();

      if (existingProduction) {
        productionId = existingProduction.id;
      } else {
        const { data: newProd } = await supabase
          .from("daily_productions")
          .insert({
            organization_id: organizationId,
            barber_id: barberId,
            date: dateStr,
            services_total: 0,
            products_total: 0,
            clients_count: 0,
            services_count: 0,
            products_count: 0,
            commission_earned: 0,
            confirmed_presence: false,
          })
          .select("id")
          .single();
        productionId = newProd?.id || null;
      }

      const itemType = manualCategory === "product" ? "product" : "service";
      const serviceCategory = manualCategory === "basic" ? "basic" : manualCategory === "extra" ? "extra" : null;
      const itemName = manualCategory === "basic" ? "Serviço básico (manual)" 
        : manualCategory === "extra" ? "Serviço extra (manual)" 
        : "Produto (manual)";
      const manualItemForPricing: CatalogItem = {
        id: "manual",
        name: itemName,
        type: itemType,
        default_price: numericValue,
        fixed_commission: 0,
        category: serviceCategory || undefined,
      };
      const effectiveManualPrice = getEffectiveItemPrice(manualItemForPricing, numericValue);

      const { error } = await supabase.from("sale_transactions").insert({
        barber_id: barberId,
        organization_id: organizationId,
        daily_production_id: productionId,
        item_type: itemType,
        item_name: itemName,
        service_category: serviceCategory,
        price_sold: effectiveManualPrice,
        commission_rate_used: 0,
        commission_amount: 0,
        source: "manager",
        client_name: registeredClient.clientName,
        mobile_phone: registeredClient.mobilePhone,
        created_at: selectedDate.toISOString(),
      } as any);

      if (error) throw error;

      await recordClientPurchasesBestEffort({
        organizationId,
        clientName: registeredClient.clientName,
        mobilePhone: registeredClient.mobilePhone,
        purchases: [
          {
            itemName,
            itemType,
            amount: effectiveManualPrice,
            quantity: 1,
            purchasedAt: selectedDate.toISOString(),
          },
        ],
      });

      toast.success(`Venda manual registrada para ${barberName}`);
      
      resetForm();
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error registering manual sale:", error);
      toast.error(error?.message || "Erro ao registrar venda");
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
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

  // ─── Client Status Badge ───
  const renderClientBadge = () => {
    if (clientHistory.checking) {
      return (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          Verificando histórico...
        </Badge>
      );
    }
    if (clientHistory.status === "phone_found") {
      return (
        <Badge className="gap-1 text-xs bg-green-600 hover:bg-green-700 text-white border-0">
          <Smartphone className="h-3 w-3" />
          Identificado pelo Celular ({clientHistory.visitCount} {clientHistory.visitCount === 1 ? "visita" : "visitas"})
        </Badge>
      );
    }
    if (clientHistory.status === "name_found") {
      return (
        <Badge className="gap-1 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0">
          <Users className="h-3 w-3" />
          Histórico encontrado pelo nome. Vinculando celular...
        </Badge>
      );
    }
    if (clientHistory.status === "not_found" && isPhoneComplete) {
      return (
        <Badge className="gap-1 text-xs bg-blue-500 hover:bg-blue-600 text-white border-0">
          <UserPlus className="h-3 w-3" />
          Primeiro registro deste cliente
        </Badge>
      );
    }
    if (manualOverride) {
      return (
        <Badge variant="secondary" className="gap-1 text-xs border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          Classificação alterada manualmente
        </Badge>
      );
    }
    return null;
  };

  // ─── STEP 1: Client Data ───
  const renderStep1 = () => (
    <>
      <DialogHeader className="px-6 pt-6 pb-4 border-b">
        <DialogTitle className="text-lg font-semibold">
          Venda Rápida — {isReceptionSale ? "🏢 Recepção / Loja" : barberName}
        </DialogTitle>
        <DialogDescription>
          Preencha os dados do atendimento
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {/* DatePicker */}
        <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
          <Label className="text-sm font-medium">Data da Venda</Label>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-10",
                  format(selectedDate, "yyyy-MM-dd") !== getTodayString() && "border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, "yyyy-MM-dd") === getTodayString()
                  ? "Hoje"
                  : format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
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
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Mobile Phone (required) */}
        <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
          <Label htmlFor="mobile-phone" className="text-sm font-medium">
            Celular do Cliente
          </Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="mobile-phone"
              type="tel"
              inputMode="numeric"
              placeholder="(11) 99999-9999"
              value={mobilePhone}
              onChange={handlePhoneChange}
              onBlur={handlePhoneBlur}
              className={cn("h-10 pl-10", phoneError && "border-destructive")}
              maxLength={15}
              list="quick-sale-phone-suggestions"
            />
          </div>
          {phoneError && (
            <p className="text-xs text-destructive font-medium">{phoneError}</p>
          )}
          <datalist id="quick-sale-phone-suggestions">
            {phoneSuggestions.map((client) => (
              <option key={client.id} value={formatPhone(client.mobile_phone)}>
                {client.name}
              </option>
            ))}
          </datalist>
        </div>

        {/* Client Name */}
        <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
          <Label htmlFor="client-name" className="text-sm font-medium">
            Nome do Cliente {clientHistory.status === "phone_found" ? "(auto-preenchido)" : "*"}
          </Label>
          <Input
            id="client-name"
            type="text"
            placeholder="Ex: João"
            value={clientName}
            onChange={(e) => {
              const nextName = e.target.value;
              setClientName(nextName);
              const matchedClient = nameSuggestions.find(
                (client) => client.name.toLowerCase() === nextName.trim().toLowerCase()
              );
              if (matchedClient) {
                setMobilePhone(formatPhone(matchedClient.mobile_phone));
                if (!manualOverride) setClientType("without_subscription");
              }
            }}
            onBlur={handleNameBlur}
            className="h-10"
            list="quick-sale-name-suggestions"
          />
        </div>
        <datalist id="quick-sale-name-suggestions">
          {nameSuggestions.map((client) => (
            <option key={client.id} value={client.name}>
              {formatPhone(client.mobile_phone)}
            </option>
          ))}
        </datalist>

        {(loadingClientSuggestions && (clientName.trim().length >= 2 || phoneDigits.length >= 3)) && (
          <p className="px-1 text-xs text-muted-foreground">Buscando sugestões de clientes...</p>
        )}

        {/* Client Status Badge */}
        {renderClientBadge() && (
          <div className="px-1">
            {renderClientBadge()}
          </div>
        )}

        {/* Toggle Reception Sale */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
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

        {/* Client Type Selector */}
        <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
          <Label className="text-sm font-medium">Tipo de Cliente</Label>
          <ToggleGroup
            type="single"
            value={clientType}
            onValueChange={(v) => {
              if (v) handleClientTypeChange(v as ClientType);
            }}
            className="justify-start"
          >
            <ToggleGroupItem
              value="new"
              aria-label="Cliente Novo"
              className="flex-1 gap-2 data-[state=on]:bg-green-600 data-[state=on]:text-white"
            >
              <UserPlus className="w-4 h-4" />
              Cliente Novo
            </ToggleGroupItem>
            <ToggleGroupItem
              value="without_subscription"
              aria-label="Cliente sem Assinatura"
              className="flex-1 gap-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <Home className="w-4 h-4" />
              Sem Assinatura
            </ToggleGroupItem>
            <ToggleGroupItem
              value="with_subscription"
              aria-label="Cliente com Assinatura"
              className="flex-1 gap-2 data-[state=on]:bg-amber-500 data-[state=on]:text-black"
            >
              <Crown className="w-4 h-4" />
              Com Assinatura
            </ToggleGroupItem>
          </ToggleGroup>

          {clientType === "with_subscription" && (
            <div className="space-y-2 rounded-lg border bg-background p-3">
              <Label className="text-xs font-medium">Plano de assinatura</Label>
              <Select
                value={selectedSubscriptionPlanId}
                onValueChange={(value) => {
                  setSelectedSubscriptionPlanId(value);
                  setSubscriptionPlanAutoDetected(false);
                }}
                disabled={isResolvingSubscription}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      isResolvingSubscription
                        ? "Lendo assinatura do cliente..."
                        : "Selecione a assinatura do cliente"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {subscriptionPlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedSubscriptionPlan && (
                <Badge variant="secondary" className="text-[11px]">
                  {subscriptionPlanAutoDetected
                    ? `Assinatura identificada automaticamente: ${selectedSubscriptionPlan.name}`
                    : `Assinatura selecionada: ${selectedSubscriptionPlan.name}`}
                </Badge>
              )}

              {!selectedSubscriptionPlanId && !isResolvingSubscription && (
                <p className="text-xs text-muted-foreground">
                  Cliente sem assinatura atribuída: selecione o plano para atribuir e continuar.
                </p>
              )}

              {selectedSubscriptionPlan && (
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const labels = services
                      .filter((service) => selectedPlanIncludedServiceIds.includes(service.id))
                      .map((service) => service.name);

                    if (labels.length === 0) {
                      const included = getSubscriptionIncludedServices(
                        selectedSubscriptionPlan.name,
                        availableServiceNames
                      );
                      if (included.has("corte_infantil")) labels.push("corte infantil");
                      if (included.has("corte")) labels.push("corte");
                      if (included.has("barba")) labels.push("barba");
                      if (included.has("sobrancelha")) labels.push("sobrancelha");
                    }

                    return `Serviços incluídos e zerados automaticamente: ${labels.join(", ") || "—"}.`;
                  })()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Step 1 Footer */}
      <div className="border-t px-6 py-4 flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleClose(false)}
          className="flex-1"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={() => setStep(2)}
          disabled={!canProceedStep1}
        >
          {clientHistory.checking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Continuar
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </>
          )}
        </Button>
      </div>
    </>
  );

  // ─── STEP 2: Catalog ───
  const renderStep2 = () => (
    <>
      {/* Compact Header: Back + Title + Cart Badge */}
      <div className="flex items-center gap-2 px-2 pt-3 pb-2 border-b">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => setStep(1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h3 className="text-sm font-semibold truncate flex-1">
          Selecionar Itens
        </h3>
        {cart.length > 0 && (
          <Badge className="shrink-0 text-xs">
            {cart.length} {cart.length === 1 ? "item" : "itens"} • {formatCurrency(cartTotal)}
          </Badge>
        )}
      </div>

      {/* Search */}
      <div className="px-3 pt-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar serviço ou produto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10"
            autoFocus
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs 
        value={activeTab} 
        onValueChange={(v) => setActiveTab(v as CategoryTab)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="px-3 pt-2">
          <TabsList className="grid w-full grid-cols-3 h-10">
            <TabsTrigger value="services" className="gap-1.5 text-xs">
              <Scissors className="h-3.5 w-3.5" />
              Serviços
              {services.length > 0 && (
                <span className="text-[10px] bg-muted-foreground/20 px-1 py-0.5 rounded">
                  {services.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5 text-xs">
              <Package className="h-3.5 w-3.5" />
              Produtos
              {products.length > 0 && (
                <span className="text-[10px] bg-muted-foreground/20 px-1 py-0.5 rounded">
                  {products.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-1.5 text-xs">
              <Hash className="h-3.5 w-3.5" />
              Manual
            </TabsTrigger>
          </TabsList>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          {/* Services Grid */}
          <TabsContent value="services" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col">
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
              <div className="flex-1 min-h-0 px-3 py-3 overflow-y-auto overscroll-contain touch-pan-y">
                <div className="grid grid-cols-2 gap-2">
                  {filteredItems.map((item) => (
                    <CatalogCard
                      key={item.id}
                      item={item}
                      countInCart={countInCart(item.id)}
                      onSelect={() => handleAddToCart(item)}
                      formatCurrency={formatCurrency}
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Products Grid */}
          <TabsContent value="products" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col">
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
              <div className="flex-1 min-h-0 px-3 py-3 overflow-y-auto overscroll-contain touch-pan-y">
                <div className="grid grid-cols-2 gap-2">
                  {filteredItems.map((item) => (
                    <CatalogCard
                      key={item.id}
                      item={item}
                      countInCart={countInCart(item.id)}
                      onSelect={() => handleAddToCart(item)}
                      formatCurrency={formatCurrency}
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Manual Entry */}
          <TabsContent value="manual" className="flex-1 m-0 px-3 py-4">
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
                  onFocus={(e) => setTimeout(() => e.target.select(), 0)}
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
          <div className="border-t px-3 py-3 space-y-3 bg-muted/30">
            {/* Cart Items */}
            {cart.length > 0 && activeTab !== "manual" && (
              <div className="space-y-2 max-h-[25vh] overflow-y-auto overscroll-contain">
                {cart.map((item) => (
                  <div key={item.tempId} className="flex items-center gap-2 p-1.5 rounded-lg bg-background border min-h-[44px]">
                    <span className="truncate text-xs font-medium flex-1 min-w-0 pl-1">{item.name}</span>
                    {cartItemIncludedBySubscription(item) && (
                      <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                        Assinatura
                      </Badge>
                    )}
                    {item.fixed_commission !== null && (
                      <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                        <Zap className="h-2 w-2 mr-0.5" />
                        {item.fixed_commission}%
                      </Badge>
                    )}
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={item.customPriceInput}
                      onChange={(e) => updateCartItemPriceInput(item.tempId, e.target.value)}
                      onFocus={handleCartItemPriceFocus}
                      onBlur={() => finalizeCartItemPrice(item.tempId)}
                      className="w-20 text-right font-bold text-xs h-8"
                      disabled={cartItemIncludedBySubscription(item)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removeFromCart(item.tempId)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {/* Clients Counter */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-background border">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">Clientes</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setClientsCount(prev => Math.max(1, prev - 1))}
                      disabled={clientsCount <= 1}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-6 text-center font-bold text-sm">{clientsCount}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setClientsCount(prev => prev + 1)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Summary Line */}
            {cart.length > 0 && activeTab !== "manual" && (
              <div className="text-center font-bold text-sm">
                {cart.length} {cart.length === 1 ? "item" : "itens"} • {formatCurrency(cartTotal)}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="gap-1"
                disabled={isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar
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
    </>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-hidden flex flex-col p-0">
        {step === 1 ? renderStep1() : renderStep2()}
      </DialogContent>
    </Dialog>
  );
}

// ─── Catalog Card (30% smaller) ───
interface CatalogCardProps {
  item: CatalogItem;
  countInCart: number;
  onSelect: () => void;
  formatCurrency: (value: number) => string;
}

function CatalogCard({ item, countInCart, onSelect, formatCurrency }: CatalogCardProps) {
  return (
    <Card
      onClick={onSelect}
      className={cn(
        "relative cursor-pointer p-2.5 transition-all duration-200 hover:shadow-lg active:scale-[0.98]",
        countInCart > 0
          ? "ring-2 ring-primary bg-primary/10 shadow-lg border-primary"
          : "hover:bg-accent/50 hover:border-primary/30"
      )}
    >
      {/* Fixed Commission Badge */}
      {item.fixed_commission !== null && (
        <Badge 
          variant="secondary" 
          className="absolute -top-2 -right-2 bg-amber-500 text-white border-0 shadow-md text-[10px] px-1.5 py-0"
        >
          <Zap className="h-2.5 w-2.5 mr-0.5" />
          {item.fixed_commission}%
        </Badge>
      )}
      
      <div className="space-y-1">
        <p className="font-bold text-xs leading-tight line-clamp-2 text-foreground">
          {item.name}
        </p>
        <p className="text-base font-black text-primary">
          {formatCurrency(item.default_price)}
        </p>
        {item.category && (
          <Badge 
            variant={item.category === "basic" ? "secondary" : "default"}
            className="text-[10px] px-1.5 py-0"
          >
            {item.category === "basic" ? "Básico" : "Extra"}
          </Badge>
        )}
      </div>
      
      {/* Count Badge */}
      {countInCart > 0 && (
        <div className="absolute bottom-1.5 right-1.5">
          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shadow-md">
            <span className="text-[10px] font-bold text-primary-foreground">{countInCart}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
