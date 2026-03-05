import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Radio,
  BarChart3,
  Users,
  UserCircle,
  Building2,
  Target,
  Package,
  TrendingUp,
  Trophy,
  Bot,
  Repeat,
  CalendarDays,
  ChevronDown,
  Menu,
  Briefcase,
  FileText,
  DollarSign,
  Calculator,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ManagerNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  hasSubscriptionModule: boolean;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

export default function ManagerNavigation({
  activeTab,
  onTabChange,
  hasSubscriptionModule,
}: ManagerNavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const directLinks: NavItem[] = [
    { id: "live", label: "Ao Vivo", icon: Radio },
    { id: "overview", label: "Dashboard", icon: BarChart3 },
  ];

  const gestaoItems: NavItem[] = [
    { id: "barbers", label: "Barbeiros", icon: Users },
    { id: "clients", label: "Clientes", icon: UserCircle },
    { id: "units", label: "Unidades", icon: Building2 },
    { id: "goals", label: "Metas", icon: Target },
  ];

  if (hasSubscriptionModule) {
    gestaoItems.push({ id: "plans", label: "Planos", icon: Repeat });
  }

  const gestaoGroup: NavGroup = {
    id: "gestao",
    label: "Gestão",
    icon: Briefcase,
    items: gestaoItems,
  };

  const financeiroItems: NavItem[] = [
    { id: "catalog", label: "Comissões", icon: Package },
    { id: "daily-goals", label: "Dia a Dia", icon: CalendarDays },
  ];

  if (hasSubscriptionModule) {
    financeiroItems.push(
      { id: "comparison", label: "Money", icon: DollarSign },
      { id: "subscription", label: "Assinaturas", icon: Repeat }
    );
  }

  const financeiroGroup: NavGroup = {
    id: "financeiro",
    label: "Financeiro",
    icon: DollarSign,
    items: financeiroItems,
  };

  const relatoriosGroup: NavGroup = {
    id: "relatorios",
    label: "Relatórios",
    icon: FileText,
    items: [
      { id: "payroll", label: "Fechamento Mensal", icon: Calculator },
      { id: "evolution", label: "Evolução", icon: TrendingUp },
      { id: "leaderboard", label: "Rankings", icon: Trophy },
      { id: "subscriptions", label: "Assinaturas", icon: Repeat },
      { id: "ai-usage", label: "Uso IA", icon: Bot },
    ],
  };

  const groups = [gestaoGroup, financeiroGroup, relatoriosGroup];

  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) => item.id === activeTab);

  const handleSelect = (id: string) => {
    onTabChange(id);
    setMobileOpen(false);
  };

  // Desktop Navigation
  const DesktopNav = () => (
    <nav className="hidden md:flex items-center gap-1">
      {/* Direct Links */}
      {directLinks.map((link) => (
        <Button
          key={link.id}
          variant={activeTab === link.id ? "default" : "ghost"}
          size="sm"
          onClick={() => handleSelect(link.id)}
          className={cn(
            "gap-2",
            link.id === "live" && "font-bold text-destructive hover:text-destructive"
          )}
        >
          <link.icon className={cn("w-4 h-4", link.id === "live" && "animate-pulse")} />
          {link.label}
        </Button>
      ))}

      {/* Dropdown Groups */}
      {groups.map((group) => (
        <DropdownMenu key={group.id}>
          <DropdownMenuTrigger asChild>
            <Button
              variant={isGroupActive(group) ? "secondary" : "ghost"}
              size="sm"
              className="gap-2"
            >
              <group.icon className="w-4 h-4" />
              {group.label}
              <ChevronDown className="w-3 h-3 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-48 bg-popover border-border"
          >
            {group.items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={cn(
                  "gap-2 cursor-pointer",
                  activeTab === item.id && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </nav>
  );

  // Mobile Navigation
  const MobileNav = () => (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetTrigger asChild className="md:hidden">
        <Button variant="ghost" size="icon">
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-background border-border p-0">
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-bold">Menu</h2>
          </div>
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {/* Direct Links */}
            {directLinks.map((link) => (
              <Button
                key={link.id}
                variant={activeTab === link.id ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  link.id === "live" && "font-bold text-destructive hover:text-destructive"
                )}
                onClick={() => handleSelect(link.id)}
              >
                <link.icon className={cn("w-4 h-4", link.id === "live" && "animate-pulse")} />
                {link.label}
              </Button>
            ))}

            {/* Groups */}
            {groups.map((group) => (
              <div key={group.id} className="pt-4">
                <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  <group.icon className="w-4 h-4" />
                  {group.label}
                </div>
                <div className="space-y-1 pl-2">
                  {group.items.map((item) => (
                    <Button
                      key={item.id}
                      variant={activeTab === item.id ? "secondary" : "ghost"}
                      className="w-full justify-start gap-3"
                      onClick={() => handleSelect(item.id)}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="flex items-center">
      <MobileNav />
      <DesktopNav />
    </div>
  );
}
