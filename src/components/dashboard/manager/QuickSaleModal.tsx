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
  initialDate?: string; // yyyy-MM-dd from LiveDashboard
  initialMode?: "barber" | "reception"; // attribution mode preselected
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

type SubscriptionAction = "new" | "renew" | "upgrade" | "downgrade";

interface SubscriptionCartItem {
  tempId: string;
  type: "subscription";
  planId: string;
  name: string;
  customPrice: number;
  action: SubscriptionAction;
  downgradeReason?: string;
}

type AnyCartItem = CartItem | SubscriptionCartItem;

const isSubscriptionCartItem = (i: AnyCartItem): i is SubscriptionCartItem =>
  (i as SubscriptionCartItem).type === "subscription";

const SUBSCRIPTION_ACTION_LABELS: Record<SubscriptionAction, string> = {
  new: "Nova adesão",
  renew: "Renovação",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
};

type CategoryTab = "services" | "products" | "subscription" | "manual";

type ClientType = "new" | "without_subscription" | "with_subscription";

function inferSubscriptionAction(
  clientType: ClientType,
  currentPlan: SubscriptionPlan | null,
  newPlan: SubscriptionPlan
): SubscriptionAction {
  if (clientType === "new" || clientType === "without_subscription") return "new";
  if (!currentPlan) return "new";
  if (currentPlan.id === newPlan.id) return "renew";
  return newPlan.price >= currentPlan.price ? "upgrade" : "downgrade";
}


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
  const cleaned = newValue.replace(/[^\d,.-]/g, "");
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
  initialDate,
  initialMode,
}: QuickSaleModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const isSubmittingRef = useRef(false);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("services");
  
  // Wizard step
  const [step, setStep] = useState<1 | 2>(1);
  
  // Cart state (individualized with tempId) — supports services, products and subscription plans
  const [cart, setCart] = useState<AnyCartItem[]>([]);
  const [clientsCount, setClientsCount] = useState(1);
  
  // Manual sale state
  const [manualValue, setManualValue] = useState("");
  const [manualCategory, setManualCategory] = useState<"basic" | "extra" | "product">("basic");
  
  // Attribution: Barbeiro vs Recepção (mandatory selection at Step 1)
  const [attribution, setAttribution] = useState<"barber" | "reception" | null>(
    initialMode ?? (barberId ? "barber" : null)
  );
  const isReceptionSale = attribution === "reception";

  // In-modal barber picker (used when modal is opened without a pre-selected barber)
  const [availableBarbers, setAvailableBarbers] = useState<{ id: string; name: string }[]>([]);
  const [pickedBarberId, setPickedBarberId] = useState<string>("");
  // Effective IDs/names — prefer prop barberId, fallback to in-modal pick
  const effectiveBarberIdResolved = barberId || pickedBarberId;
  const effectiveBarberName =
    barberName ||
    availableBarbers.find((b) => b.id === pickedBarberId)?.name ||
    "Barbeiro";

  // Client type tracking (for conversion metrics and assinatura status)
  const [clientType, setClientType] = useState<ClientType>(initialIsNewClient ? "new" : "without_subscription");
  const [clientName, setClientName] = useState("");
  const [manualOverride, setManualOverride] = useState(false);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const nameSuggestionsRef = useRef<HTMLDivElement>(null);
  const phoneSuggestionsRef = useRef<HTMLDivElement>(null);

  // Phone state
  const [mobilePhone, setMobilePhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [selectedSubscriptionPlanId, setSelectedSubscriptionPlanId] = useState<string>("");
  const [subscriptionPlanAutoDetected, setSubscriptionPlanAutoDetected] = useState(false);
  const [isResolvingSubscription, setIsResolvingSubscription] = useState(false);
  const [selectedPlanIncludedServiceIds, setSelectedPlanIncludedServiceIds] = useState<string[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);

  // Client history hook
  const clientHistory = useClientHistory(organizationId);
  const { nameSuggestions, phoneSuggestions, loading: loadingClientSuggestions } = useClientAutocomplete({
    organizationId,
    nameQuery: clientName,
    phoneQuery: mobilePhone,
    enabled: open,
  });

  // Date picker state - use initialDate from LiveDashboard if provided
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (initialDate) {
      // Parse yyyy-MM-dd as local date
      const [y, m, d] = initialDate.split("-").map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
    return new Date();
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Sync selectedDate + attribution with initial props when modal opens
  useEffect(() => {
    if (open && initialDate) {
      const [y, m, d] = initialDate.split("-").map(Number);
      setSelectedDate(new Date(y, m - 1, d, 12, 0, 0));
    }
    if (open) {
      setAttribution(initialMode ?? (barberId ? "barber" : null));
    }
  }, [open, initialDate, initialMode, barberId]);

  const fetchCatalog = useCallback(async () => {
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
  }, [organizationId]);

  // Fetch catalog items
  useEffect(() => {
    if (open && organizationId) {
      fetchCatalog();
      fetchSubscriptionPlans();
    }
  }, [open, organizationId, barberId, fetchCatalog]);

  useEffect(() => {
    if (!open) return;

    if (!organizationId) {
      setLoadingCatalog(false);
      toast.error("Organização não identificada. Feche e recarregue a página.");
    }
  }, [open, organizationId]);

  // Fetch active barbers when modal opens without a pre-selected barber
  // (used for the in-modal "Barbeiro" picker on the unified "Nova Venda" flow)
  useEffect(() => {
    if (!open || !organizationId || barberId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("barbers")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("name");
      if (cancelled) return;
      if (error) {
        console.error("Erro ao carregar barbeiros:", error);
        return;
      }
      setAvailableBarbers(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, barberId]);

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
    setAttribution(initialMode ?? (barberId ? "barber" : null));
    setPickedBarberId("");
    setClientType(initialIsNewClient ? "new" : "without_subscription");
    setClientName("");
    setMobilePhone("");
    setPhoneError(null);
    setSelectedSubscriptionPlanId("");
    setSubscriptionPlanAutoDetected(false);
    setIsResolvingSubscription(false);
    setSelectedPlanIncludedServiceIds([]);
    setManualOverride(false);
    setShowNameSuggestions(false);
    setShowPhoneSuggestions(false);
    clientHistory.reset();
    if (initialDate) {
      const [y, m, d] = initialDate.split("-").map(Number);
      setSelectedDate(new Date(y, m - 1, d, 12, 0, 0));
    } else {
      setSelectedDate(new Date());
    }
    setDatePickerOpen(false);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  // Select a client from suggestion dropdown (fills both name + phone + auto-detects subscription)
  const selectClientSuggestion = useCallback(async (client: { name: string; mobile_phone: string }) => {
    setClientName(client.name);
    setMobilePhone(formatPhone(client.mobile_phone));
    setShowNameSuggestions(false);
    setShowPhoneSuggestions(false);
    setPhoneError(null);

    // Trigger history check
    clientHistory.checkHistory(formatPhone(client.mobile_phone), client.name).then((res) => {
      if (!res) return;
      if (res.status === "phone_found" && res.suggestedName) {
        setClientName(res.suggestedName);
      }
    });

    // Auto-detect subscription for this client
    autoDetectSubscription(client.mobile_phone);
  }, [clientHistory]);

  // Auto-detect if client has a subscription plan
  const autoDetectSubscription = useCallback(async (phoneDigits: string) => {
    if (manualOverride) return;
    try {
      const { data, error } = await (supabase
        .from("clients") as any)
        .select("subscription_plan_id")
        .eq("organization_id", organizationId)
        .eq("mobile_phone", phoneDigits)
        .maybeSingle();

      if (error) return;

      if (data?.subscription_plan_id) {
        setClientType("with_subscription");
        setSelectedSubscriptionPlanId(data.subscription_plan_id);
        setSubscriptionPlanAutoDetected(true);
      }
    } catch {
      // silent
    }
  }, [organizationId, manualOverride]);

  // Phone input handler with mask
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatPhone(raw);
    setMobilePhone(formatted);
    setShowPhoneSuggestions(true);

    const digits = sanitizePhone(raw);
    if (digits.length === 11) {
      setShowPhoneSuggestions(false);
      if (!isValidPhone(raw)) {
        setPhoneError("Telefone inválido");
      } else {
        setPhoneError(null);
        // Auto-trigger client history check when phone is complete
        clientHistory.checkHistory(formatted, clientName).then((res) => {
          if (!res) return;
          if (res.status === "phone_found" && res.suggestedName) {
            setClientName(res.suggestedName);
            if (!manualOverride) setClientType("without_subscription");
          } else if (res.status === "name_found") {
            if (!manualOverride) setClientType("without_subscription");
          }
        });
        // Auto-detect subscription
        autoDetectSubscription(digits);
      }
    } else if (digits.length > 0 && digits.length < 11) {
      setPhoneError(null);
      clientHistory.reset();
    } else {
      setPhoneError(null);
      clientHistory.reset();
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
    try {
      console.log("[QuickSaleModal] handleClientTypeChange:", value);
      setManualOverride(true);
      setClientType(value);
      if (value !== "with_subscription") {
        setSelectedSubscriptionPlanId("");
        setSubscriptionPlanAutoDetected(false);
      }
    } catch (error) {
      console.error("[QuickSaleModal] Erro ao mudar tipo de cliente:", error);
      toast.error("Erro ao alterar tipo de cliente.");
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

  const countInCart = (itemId: string) =>
    cart.filter((i) => !isSubscriptionCartItem(i) && i.id === itemId).length;

  const removeFromCart = (tempId: string) => {
    setCart(prev => prev.filter(i => i.tempId !== tempId));
  };

  const updateCartItemPriceInput = (tempId: string, newValue: string) => {
    setCart(prev => prev.map(item => {
      if (item.tempId !== tempId) return item;
      if (isSubscriptionCartItem(item)) return item; // subscription price is fixed by plan

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
      if (isSubscriptionCartItem(item)) return item;

      const formattedInput = item.customPrice > 0 
        ? item.customPrice.toFixed(2).replace(".", ",")
        : "0,00";
      
      return { ...item, customPriceInput: formattedInput };
    }));
  };

  // ─── Subscription cart helpers ───
  const updateSubscriptionAction = (tempId: string, action: SubscriptionAction) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId || !isSubscriptionCartItem(item)) return item;
        return {
          ...item,
          action,
          downgradeReason: action === "downgrade" ? item.downgradeReason ?? "" : undefined,
        };
      })
    );
  };

  const updateSubscriptionReason = (tempId: string, reason: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.tempId !== tempId || !isSubscriptionCartItem(item)) return item;
        return { ...item, downgradeReason: reason };
      })
    );
  };

  const subscriptionInCart = useMemo(
    () => cart.find(isSubscriptionCartItem) ?? null,
    [cart]
  );

  const handleAddSubscriptionToCart = (plan: SubscriptionPlan) => {
    if (subscriptionInCart) {
      toast.warning("Apenas 1 plano de assinatura por venda. Remova o plano atual para trocar.");
      return;
    }
    const currentPlan = selectedSubscriptionPlan;
    const action = inferSubscriptionAction(clientType, currentPlan, plan);
    setCart((prev) => [
      ...prev,
      {
        tempId: crypto.randomUUID(),
        type: "subscription",
        planId: plan.id,
        name: plan.name,
        customPrice: plan.price,
        action,
        downgradeReason: action === "downgrade" ? "" : undefined,
      },
    ]);
    toast.success(`Plano ${plan.name} adicionado — ${SUBSCRIPTION_ACTION_LABELS[action]}`);
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
  const selectedSubscriptionPlan = useMemo(
    () => subscriptionPlans.find((plan) => plan.id === selectedSubscriptionPlanId) || null,
    [subscriptionPlans, selectedSubscriptionPlanId]
  );

  // The plan that drives the discount logic.
  // Priority: plan added to cart (live conversion) > plan already linked to the client.
  const effectivePlanIdForDiscount = subscriptionInCart?.planId || selectedSubscriptionPlanId;

  useEffect(() => {
    const fetchIncludedServices = async () => {
      if (!effectivePlanIdForDiscount) {
        setSelectedPlanIncludedServiceIds([]);
        return;
      }

      const { data, error } = await supabase
        .from("subscription_plan_services")
        .select("catalog_service_id")
        .eq("subscription_plan_id", effectivePlanIdForDiscount)
        .eq("organization_id", organizationId);

      if (error) {
        console.error("Erro ao carregar serviços do plano:", error);
        setSelectedPlanIncludedServiceIds([]);
        return;
      }

      setSelectedPlanIncludedServiceIds((data || []).map((row) => row.catalog_service_id));
    };

    void fetchIncludedServices();
  }, [organizationId, effectivePlanIdForDiscount]);


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
    let cancelled = false;
    const run = async () => {
      try {
        await resolveSubscriptionForClient();
      } catch (error) {
        if (!cancelled) {
          console.error("[QuickSaleModal] Erro em resolveSubscriptionForClient:", error);
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [resolveSubscriptionForClient]);

  // Discount applies if either:
  //  • client is already subscriber (clientType=with_subscription) OR
  //  • a subscription plan is being added in this same sale (live conversion)
  const subscriptionDiscountActive =
    clientType === "with_subscription" || !!subscriptionInCart;

  const getEffectiveItemPrice = (item: CatalogItem, enteredPrice: number) => {
    if (
      subscriptionDiscountActive &&
      item.type === "service" &&
      selectedPlanIncludedServiceIds.includes(item.id)
    ) {
      return 0;
    }

    return enteredPrice;
  };

  useEffect(() => {
    setCart((prev) => {
      if (!subscriptionDiscountActive || selectedPlanIncludedServiceIds.length === 0) return prev;

      let changed = false;
      const next = prev.map((item) => {
        if (isSubscriptionCartItem(item)) return item;
        if (
          item.type === "service" &&
          item.customPrice !== 0 &&
          selectedPlanIncludedServiceIds.includes(item.id)
        ) {
          changed = true;
          return { ...item, customPrice: 0, customPriceInput: "0,00" };
        }
        return item;
      });

      return changed ? next : prev;
    });
  }, [subscriptionDiscountActive, selectedPlanIncludedServiceIds]);

  const cartItemIncludedBySubscription = (item: CartItem) => {
    return (
      subscriptionDiscountActive &&
      item.type === "service" &&
      selectedPlanIncludedServiceIds.includes(item.id)
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
  // Require client verification to have completed (not idle) when phone is complete
  const isClientVerified = !isPhoneComplete || (clientHistory.status !== "idle" && clientHistory.status !== "checking");
  const attributionResolved =
    attribution === "reception" || (attribution === "barber" && !!effectiveBarberIdResolved);
  const canProceedStep1 =
    attributionResolved && isPhoneComplete && hasClientName && isClientVerified && !phoneError && hasSubscriptionResolved;

  const handleCartCheckout = async () => {
    if (isSubmittingRef.current) return;
    if (!organizationId) {
      toast.error("Organização não identificada");
      return;
    }

    if (!attribution) {
      toast.error("Ação necessária: Selecione um Barbeiro ou 'Venda Recepção' para prosseguir.");
      return;
    }
    if (attribution === "barber" && !effectiveBarberIdResolved) {
      toast.error("Selecione qual barbeiro fará a venda.");
      return;
    }
    if (cart.length === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    isSubmittingRef.current = true;
    setIsLoading(true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const effectiveBarberId = isReceptionSale ? null : effectiveBarberIdResolved;
    const phoneSanitized = sanitizePhone(mobilePhone) || null;

    try {
      if (!phoneSanitized || phoneSanitized.length !== 11) {
        toast.error("Preencha um celular válido com DDD (11 dígitos)");
        return;
      }
      if (!clientName.trim() || clientName.trim().length < 3) {
        toast.error("Preencha o nome do cliente (mínimo 3 caracteres)");
        return;
      }

      const registeredClient = await registerClientOrThrow({
        organizationId,
        clientName,
        mobilePhone: phoneSanitized,
      });

      if (!registeredClient?.clientName || !registeredClient?.mobilePhone) {
        console.error("[QuickSaleModal] registerClientOrThrow retornou dados inválidos:", registeredClient);
        throw new Error("Falha ao obter dados do cliente para a venda. Tente novamente.");
      }

      const safeClientName = registeredClient.clientName || clientName.trim() || "Cliente";

      // Validate subscription cart item before any side-effect (downgrade reason)
      if (subscriptionInCart && subscriptionInCart.action === "downgrade") {
        if (!subscriptionInCart.downgradeReason || subscriptionInCart.downgradeReason.trim().length < 3) {
          toast.error("Informe o motivo do downgrade da assinatura.");
          return;
        }
      }

      await ensureSubscriptionAssigned(registeredClient.mobilePhone);

      if (registeredClient.reusedByPhone && registeredClient.clientName !== clientName.trim()) {
        toast.info(`Cliente identificado pelo celular: ${safeClientName}`);
      }

      // Build transaction payload for RPC
      const transactions = cart.map((item) => {
        if (isSubscriptionCartItem(item)) {
          return {
            item_type: "subscription" as const,
            catalog_service_id: null,
            catalog_product_id: null,
            item_name: `Assinatura ${item.name}`,
            service_category: null,
            price_sold: item.customPrice,
            is_new_client: clientType === "new",
            client_name: safeClientName,
            mobile_phone: registeredClient.mobilePhone,
            subscription_plan_id: item.planId,
            subscription_action: item.action,
            downgrade_reason: item.action === "downgrade" ? (item.downgradeReason ?? null) : null,
            commission_rate_used: 0,
            commission_amount: 0,
          };
        }
        return {
          item_type: item.type,
          catalog_service_id: item.type === "service" ? item.id : null,
          catalog_product_id: item.type === "product" ? item.id : null,
          item_name: item.name,
          service_category: item.type === "service" ? (item.category || null) : null,
          price_sold: item.customPrice,
          is_new_client: clientType === "new",
          client_name: safeClientName,
          mobile_phone: registeredClient.mobilePhone,
        };
      });

      const { error } = await supabase.rpc("create_sale_and_ensure_production", {
        p_organization_id: organizationId,
        p_barber_id: effectiveBarberId,
        p_date: dateStr,
        p_transactions: transactions,
        p_source: "manager",
      });
      if (error) throw error;

      // If a subscription plan was sold in this transaction, link it to the client
      if (subscriptionInCart) {
        try {
          const { error: linkError } = await (supabase
            .from("clients") as any)
            .update({ subscription_plan_id: subscriptionInCart.planId })
            .eq("organization_id", organizationId)
            .eq("mobile_phone", registeredClient.mobilePhone);
          if (linkError && !isSubscriptionPlanFieldMissing(linkError)) {
            console.error("Erro ao vincular assinatura ao cliente:", linkError);
          }
        } catch (linkErr) {
          console.error("Erro inesperado ao vincular assinatura:", linkErr);
        }
      }

      await recordClientPurchasesBestEffort({
        organizationId,
        clientName: registeredClient.clientName,
        mobilePhone: registeredClient.mobilePhone,
        purchases: cart.map((item) => ({
          itemName: isSubscriptionCartItem(item) ? `Assinatura ${item.name}` : item.name,
          itemType: isSubscriptionCartItem(item) ? "subscription" : item.type,
          amount: item.customPrice,
          quantity: 1,
          purchasedAt: `${dateStr}T12:00:00`,
        })),
      });

      const sellerName = isReceptionSale ? "Recepção / Loja" : effectiveBarberName;
      const subDescription = subscriptionInCart
        ? ` • ${SUBSCRIPTION_ACTION_LABELS[subscriptionInCart.action]}: ${subscriptionInCart.name}`
        : "";
      toast.success(`${cart.length} ${cart.length === 1 ? 'item registrado' : 'itens registrados'} para ${sellerName}`, {
        description: `Total: R$ ${cartTotal.toFixed(2)} • ${clientsCount} ${clientsCount === 1 ? 'cliente' : 'clientes'}${subDescription}`,
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
    if (!organizationId) {
      toast.error("Organização não identificada");
      return;
    }

    if (!attribution) {
      toast.error("Ação necessária: Selecione um Barbeiro ou 'Venda Recepção' para prosseguir.");
      return;
    }
    if (attribution === "barber" && !effectiveBarberIdResolved) {
      toast.error("Selecione qual barbeiro fará a venda.");
      return;
    }

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
      if (!phoneSanitized || phoneSanitized.length !== 11) {
        toast.error("Preencha um celular válido com DDD (11 dígitos)");
        return;
      }
      if (!clientName.trim() || clientName.trim().length < 3) {
        toast.error("Preencha o nome do cliente (mínimo 3 caracteres)");
        return;
      }

      const registeredClient = await registerClientOrThrow({
        organizationId,
        clientName,
        mobilePhone: phoneSanitized,
      });

      if (!registeredClient?.clientName || !registeredClient?.mobilePhone) {
        console.error("[QuickSaleModal] registerClientOrThrow retornou dados inválidos (manual):", registeredClient);
        throw new Error("Falha ao obter dados do cliente para a venda. Tente novamente.");
      }

      const safeClientName = registeredClient.clientName || clientName.trim() || "Cliente";

      await ensureSubscriptionAssigned(registeredClient.mobilePhone);

      if (registeredClient.reusedByPhone && registeredClient.clientName !== clientName.trim()) {
        toast.info(`Cliente identificado pelo celular: ${safeClientName}`);
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

      // Use atomic RPC
      const transaction = {
        item_type: itemType,
        item_name: itemName,
        service_category: serviceCategory,
        price_sold: effectiveManualPrice,
        is_new_client: clientType === "new",
          client_name: safeClientName,
          mobile_phone: registeredClient.mobilePhone,
          catalog_service_id: null,
          catalog_product_id: null,
      };

      const { error } = await supabase.rpc("create_sale_and_ensure_production", {
        p_organization_id: organizationId,
        p_barber_id: isReceptionSale ? null : effectiveBarberIdResolved,
        p_date: dateStr,
        p_transactions: [transaction],
        p_source: "manager",
      });

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
            purchasedAt: `${dateStr}T12:00:00`,
          },
        ],
      });

      toast.success(`Venda manual registrada para ${isReceptionSale ? "Recepção / Loja" : effectiveBarberName}`);
      
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
  const isToday = format(selectedDate, "yyyy-MM-dd") === getTodayString();
  const isYesterday = (() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return format(selectedDate, "yyyy-MM-dd") === format(yesterday, "yyyy-MM-dd");
  })();

  const setToday = () => setSelectedDate(new Date());
  const setYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };

  const renderStep1 = () => (
    <>
      <DialogHeader className="px-6 pt-5 pb-3">
        <DialogTitle className="text-lg font-semibold">
          {attribution === null
            ? "Nova Venda"
            : `Venda Rápida — ${isReceptionSale ? "🏢 Recepção / Loja" : effectiveBarberName}`}
        </DialogTitle>
        <DialogDescription className="text-xs">
          Preencha os dados do atendimento
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
        {!organizationId && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Organização não identificada. Feche o modal e recarregue a página.
          </div>
        )}

        {/* Date Selection */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground font-medium shrink-0">Data:</Label>
          <div className="flex items-center gap-1.5 flex-1">
            <button
              type="button"
              onClick={setToday}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                isToday
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              Hoje ({format(new Date(), "dd/MM")})
            </button>
            <button
              type="button"
              onClick={setYesterday}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                isYesterday
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              Ontem
            </button>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1",
                    !isToday && !isYesterday
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {!isToday && !isYesterday
                    ? format(selectedDate, "dd/MM", { locale: ptBR })
                    : "Outra"}
                </button>
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
        </div>

        {/* Client Name */}
        <div className="space-y-1.5 relative">
          <Label htmlFor="client-name" className="text-xs text-muted-foreground font-medium">
            Nome do Cliente {clientHistory.status === "phone_found" ? "(auto)" : "*"}
          </Label>
          <Input
            ref={nameInputRef}
            id="client-name"
            type="text"
            autoComplete="off"
            placeholder="Ex: João"
            value={clientName}
            onChange={(e) => {
              setClientName(e.target.value);
              setShowNameSuggestions(true);
            }}
            onFocus={() => setShowNameSuggestions(true)}
            onBlur={(e) => {
              // Delay to allow click on suggestion
              setTimeout(() => setShowNameSuggestions(false), 200);
              handleNameBlur();
            }}
            className="h-10"
          />
          {showNameSuggestions && nameSuggestions.length > 0 && (
            <div
              ref={nameSuggestionsRef}
              className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto"
            >
              {nameSuggestions.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectClientSuggestion(client)}
                >
                  <span className="font-medium">{client.name}</span>
                  <span className="text-xs text-muted-foreground">{formatPhone(client.mobile_phone)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mobile Phone */}
        <div className="space-y-1.5 relative">
          <Label htmlFor="mobile-phone" className="text-xs text-muted-foreground font-medium">
            Celular do Cliente
          </Label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={phoneInputRef}
              id="mobile-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              placeholder="(11) 99999-9999"
              value={mobilePhone}
              onChange={handlePhoneChange}
              onFocus={() => setShowPhoneSuggestions(true)}
              onBlur={(e) => {
                setTimeout(() => setShowPhoneSuggestions(false), 200);
                handlePhoneBlur();
              }}
              className={cn("h-10 pl-10", phoneError && "border-destructive")}
              maxLength={15}
            />
          </div>
          {phoneError && (
            <p className="text-xs text-destructive font-medium">{phoneError}</p>
          )}
          {showPhoneSuggestions && phoneSuggestions.length > 0 && (
            <div
              ref={phoneSuggestionsRef}
              className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto"
            >
              {phoneSuggestions.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectClientSuggestion(client)}
                >
                  <span className="text-xs font-mono">{formatPhone(client.mobile_phone)}</span>
                  <span className="text-xs text-muted-foreground">{client.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {(loadingClientSuggestions && (clientName.trim().length >= 2 || phoneDigits.length >= 3)) && (
          <p className="text-xs text-muted-foreground">Buscando sugestões...</p>
        )}

        {/* Client Status Badge */}
        {renderClientBadge() && (
          <div>{renderClientBadge()}</div>
        )}

        {/* Attribution + Client type — grouped visually */}
        <div className="rounded-lg border bg-muted/20 divide-y divide-border">
          {/* Mandatory Attribution Selector */}
          <div className="px-3 py-2.5 space-y-2">
            <Label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              Atribuição da Venda <span className="text-destructive">*</span>
            </Label>
            <ToggleGroup
              type="single"
              value={attribution ?? ""}
              onValueChange={(v) => {
                if (v === "barber" || v === "reception") setAttribution(v);
              }}
              className="justify-start w-full"
            >
              <ToggleGroupItem
                value="barber"
                aria-label="Atribuir ao barbeiro"
                className="flex-1 gap-1.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                onPointerDown={(e) => e.preventDefault()}
              >
                <Scissors className="w-3.5 h-3.5" />
                <span className="truncate">
                  {barberId
                    ? (barberName || "Barbeiro")
                    : pickedBarberId
                      ? effectiveBarberName
                      : "Barbeiro"}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="reception"
                aria-label="Venda da Recepção"
                className="flex-1 gap-1.5 text-xs data-[state=on]:bg-amber-500 data-[state=on]:text-black ring-1 ring-amber-500/40"
                onPointerDown={(e) => e.preventDefault()}
              >
                <Building2 className="w-3.5 h-3.5" />
                Venda Recepção
              </ToggleGroupItem>
            </ToggleGroup>

            {/* In-modal barber picker — visible when "Barbeiro" is chosen but no barber was pre-selected */}
            {attribution === "barber" && !barberId && (
              <Select value={pickedBarberId} onValueChange={setPickedBarberId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione qual barbeiro fará a venda..." />
                </SelectTrigger>
                <SelectContent>
                  {availableBarbers.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      Nenhum barbeiro ativo encontrado.
                    </div>
                  ) : (
                    availableBarbers.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">
                        {b.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}

            {!attribution && (
              <p className="text-[11px] text-destructive">
                Selecione um Barbeiro ou "Venda Recepção" para prosseguir.
              </p>
            )}
            {attribution === "barber" && !effectiveBarberIdResolved && (
              <p className="text-[11px] text-destructive">
                Escolha qual barbeiro fará a venda.
              </p>
            )}
          </div>

          {/* Client Type Selector */}
          <div className="px-3 py-2.5 space-y-2">
            <Label className="text-xs text-muted-foreground font-medium">Tipo de Cliente</Label>
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
                className="flex-1 gap-1.5 text-xs data-[state=on]:bg-green-600 data-[state=on]:text-white"
                onPointerDown={(e) => e.preventDefault()}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Novo
              </ToggleGroupItem>
              <ToggleGroupItem
                value="without_subscription"
                aria-label="Cliente sem Assinatura"
                className="flex-1 gap-1.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                onPointerDown={(e) => e.preventDefault()}
              >
                <Home className="w-3.5 h-3.5" />
                Da Casa
              </ToggleGroupItem>
              <ToggleGroupItem
                value="with_subscription"
                aria-label="Cliente com Assinatura"
                className="flex-1 gap-1.5 text-xs data-[state=on]:bg-amber-500 data-[state=on]:text-black"
                onPointerDown={(e) => e.preventDefault()}
              >
                <Crown className="w-3.5 h-3.5" />
                Assinante
              </ToggleGroupItem>
            </ToggleGroup>

            {(clientType === "new" || clientType === "without_subscription") && (
              <p className="text-[11px] text-muted-foreground">
                💡 Quer aderir um plano agora? Vá para o próximo passo e adicione a <strong>Assinatura</strong> no carrinho.
              </p>
            )}

            {clientType === "with_subscription" && (
              <div className="space-y-2 pt-1">
                <Select
                  value={selectedSubscriptionPlanId}
                  onValueChange={(value) => {
                    setSelectedSubscriptionPlanId(value);
                    setSubscriptionPlanAutoDetected(false);
                  }}
                  disabled={isResolvingSubscription}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue
                      placeholder={
                        isResolvingSubscription
                          ? "Lendo assinatura..."
                          : "Selecione o plano"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {subscriptionPlans.length > 0 ? (
                      subscriptionPlans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Nenhum plano cadastrado
                      </div>
                    )}
                  </SelectContent>
                </Select>

                {selectedSubscriptionPlan && (
                  <p className="text-[11px] text-muted-foreground">
                    {subscriptionPlanAutoDetected ? "✓ Identificado automaticamente" : "✓ Selecionado"}: {selectedSubscriptionPlan.name}
                    {(() => {
                      const labels = services
                        .filter((service) => selectedPlanIncludedServiceIds.includes(service.id))
                        .map((service) => service.name);
                      return labels.length > 0 ? ` — Serviços inclusos: ${labels.join(", ")}` : "";
                    })()}
                  </p>
                )}

                {!selectedSubscriptionPlanId && !isResolvingSubscription && (
                  <p className="text-[11px] text-muted-foreground">
                    Selecione o plano para continuar.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Step 1 Footer */}
      <div className="border-t px-6 py-3 flex gap-3">
        <Button
          type="button"
          variant="ghost"
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
          <TabsList className="grid w-full grid-cols-4 h-10">
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
            <TabsTrigger
              value="subscription"
              className="gap-1.5 text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-black"
            >
              <Crown className="h-3.5 w-3.5" />
              Assinatura
              {subscriptionPlans.length > 0 && (
                <span className="text-[10px] bg-muted-foreground/20 px-1 py-0.5 rounded">
                  {subscriptionPlans.length}
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

          {/* Subscription Plans Grid */}
          <TabsContent value="subscription" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col">
            {subscriptionPlans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground px-6 text-center">
                <Crown className="h-12 w-12 mb-4 opacity-50" />
                <p className="font-medium">Nenhum plano de assinatura cadastrado</p>
                <p className="text-xs mt-1">Cadastre planos em "Gestão → Assinaturas" para vendê-los aqui.</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 px-3 py-3 overflow-y-auto overscroll-contain touch-pan-y space-y-3">
                <div className="rounded-lg border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200">
                  <strong>Adesão / Renovação / Upgrade:</strong> escolha o plano. A ação é detectada automaticamente conforme o status atual do cliente — você pode ajustar no carrinho.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {subscriptionPlans.map((plan) => {
                    const alreadyInCart = subscriptionInCart?.planId === plan.id;
                    const disabled = !!subscriptionInCart && !alreadyInCart;
                    return (
                      <Card
                        key={plan.id}
                        onClick={() => !disabled && handleAddSubscriptionToCart(plan)}
                        className={cn(
                          "relative cursor-pointer p-3 transition-all duration-200",
                          alreadyInCart
                            ? "ring-2 ring-amber-500 bg-amber-500/10 border-amber-500"
                            : disabled
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:shadow-lg active:scale-[0.98] hover:bg-accent/50 hover:border-amber-400/50"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <Crown className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-bold text-xs leading-tight line-clamp-2 text-foreground">
                              {plan.name}
                            </p>
                            <p className="text-base font-black text-amber-600 dark:text-amber-400">
                              {formatCurrency(plan.price)}
                            </p>
                            {alreadyInCart && (
                              <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 text-black border-0">
                                No carrinho
                              </Badge>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>


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
                {cart.map((item) => {
                  if (isSubscriptionCartItem(item)) {
                    return (
                      <div
                        key={item.tempId}
                        className="flex flex-col gap-1.5 p-2 rounded-lg border bg-amber-50/60 dark:bg-amber-950/20 border-amber-300/60 min-h-[44px]"
                      >
                        <div className="flex items-center gap-2">
                          <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="truncate text-xs font-semibold flex-1 min-w-0">
                            Assinatura — {item.name}
                          </span>
                          <Badge className="shrink-0 text-[10px] px-1.5 py-0 bg-amber-500 text-black border-0">
                            {SUBSCRIPTION_ACTION_LABELS[item.action]}
                          </Badge>
                          <span className="text-xs font-bold tabular-nums w-20 text-right">
                            {formatCurrency(item.customPrice)}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => removeFromCart(item.tempId)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-[10px] text-muted-foreground shrink-0">Ação:</Label>
                          <Select
                            value={item.action}
                            onValueChange={(v) => updateSubscriptionAction(item.tempId, v as SubscriptionAction)}
                          >
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new" className="text-xs">Nova adesão</SelectItem>
                              <SelectItem value="renew" className="text-xs">Renovação</SelectItem>
                              <SelectItem value="upgrade" className="text-xs">Upgrade</SelectItem>
                              <SelectItem value="downgrade" className="text-xs">Downgrade</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {item.action === "downgrade" && (
                          <Input
                            type="text"
                            placeholder="Motivo do downgrade..."
                            value={item.downgradeReason ?? ""}
                            onChange={(e) => updateSubscriptionReason(item.tempId, e.target.value)}
                            className="h-8 text-xs"
                          />
                        )}
                      </div>
                    );
                  }
                  return (
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
                  );
                })}

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
