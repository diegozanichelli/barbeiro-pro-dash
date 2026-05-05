import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Radio,
  BarChart3,
  Users,
  Building2,
  Target,
  Package,
  TrendingUp,
  Trophy,
  Bot,
  Repeat,
  CalendarDays,
  Menu,
  Briefcase,
  FileText,
  DollarSign,
  Calculator,
  UserRound,
  ChevronRight,
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
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);

  const directLinks: NavItem[] = [
    { id: "live", label: "Ao Vivo", icon: Radio },
    { id: "overview", label: "Dashboard", icon: BarChart3 },
  ];

  const gestaoItems: NavItem[] = [
    { id: "barbers", label: "Barbeiros", icon: Users },
    { id: "clients", label: "Clientes", icon: UserRound },
    { id: "units", label: "Unidades", icon: Building2 },
    { id: "goals", label: "Metas", icon: Target },
  ];

  if (hasSubscriptionModule) {
    gestaoItems.push({ id: "plans", label: "Planos", icon: Repeat });
  }

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

  const relatoriosItems: NavItem[] = [
    { id: "payroll", label: "Fechamento Mensal", icon: Calculator },
    { id: "evolution", label: "Evolução", icon: TrendingUp },
    { id: "leaderboard", label: "Rankings", icon: Trophy },
    { id: "subscriptions", label: "Assinaturas", icon: Repeat },
    { id: "ai-usage", label: "Uso IA", icon: Bot },
  ];

  const groups: NavGroup[] = [
    { id: "gestao", label: "Gestão", icon: Briefcase, items: gestaoItems },
    { id: "financeiro", label: "Financeiro", icon: DollarSign, items: financeiroItems },
    { id: "relatorios", label: "Relatórios", icon: FileText, items: relatoriosItems },
  ];

  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) => item.id === activeTab);

  const handleSelect = (id: string) => {
    onTabChange(id);
    setMobileOpen(false);
    setHoveredGroup(null);
  };

  // ---------- Desktop: left rail with hover-expand + flyout ----------
  const DesktopRail = () => (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 group/rail">
      <div
        className={cn(
          "h-full glass-strong border-r border-white/[0.06]",
          "flex flex-col py-3 transition-[width] duration-200 ease-out",
          "w-14 hover:w-56"
        )}
      >
        <nav className="flex-1 flex flex-col gap-1 px-2 overflow-hidden">
          {directLinks.map((link) => {
            const active = activeTab === link.id;
            return (
              <button
                key={link.id}
                onClick={() => handleSelect(link.id)}
                onMouseEnter={() => setHoveredGroup(null)}
                className={cn(
                  "h-10 flex items-center gap-3 rounded-lg px-2.5 text-sm transition-colors",
                  "hover:bg-accent/60",
                  active && "bg-accent text-foreground font-medium",
                  link.id === "live" && "text-destructive hover:text-destructive"
                )}
              >
                <link.icon
                  className={cn(
                    "w-5 h-5 shrink-0",
                    link.id === "live" && "animate-pulse"
                  )}
                />
                <span className="opacity-0 group-hover/rail:opacity-100 transition-opacity whitespace-nowrap">
                  {link.label}
                </span>
              </button>
            );
          })}

          <div className="my-2 mx-2 h-px bg-white/[0.06]" />

          {groups.map((group) => {
            const active = isGroupActive(group);
            return (
              <button
                key={group.id}
                onClick={() =>
                  setHoveredGroup(hoveredGroup === group.id ? null : group.id)
                }
                className={cn(
                  "h-10 flex items-center gap-3 rounded-lg px-2.5 text-sm transition-colors",
                  "hover:bg-accent/60",
                  active && "bg-accent/40 text-foreground font-medium"
                )}
              >
                <group.icon className="w-5 h-5 shrink-0" />
                <span className="flex-1 text-left opacity-0 group-hover/rail:opacity-100 transition-opacity whitespace-nowrap">
                  {group.label}
                </span>
                <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover/rail:opacity-60 transition-opacity" />
              </button>
            );
          })}
        </nav>
      </div>

      {/* Flyout panel for hovered group */}
      {hoveredGroup && (
        <div
          onMouseEnter={() => {/* keep open */}}
          className="h-full w-56 glass-strong border-r border-white/[0.06] py-3 px-2 animate-in fade-in slide-in-from-left-2 duration-150"
        >
          <p className="px-2 pb-2 text-[10px] font-mono uppercase tracking-[0.22em] text-primary/80">
            {groups.find((g) => g.id === hoveredGroup)?.label}
          </p>
          <div className="flex flex-col gap-1">
            {groups
              .find((g) => g.id === hoveredGroup)
              ?.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className={cn(
                    "h-9 flex items-center gap-3 rounded-lg px-2.5 text-sm transition-colors",
                    "hover:bg-accent/60",
                    activeTab === item.id &&
                      "bg-accent text-foreground font-medium"
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </aside>
  );

  // ---------- Mobile: sheet ----------
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
            {directLinks.map((link) => (
              <Button
                key={link.id}
                variant={activeTab === link.id ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  link.id === "live" &&
                    "font-bold text-destructive hover:text-destructive"
                )}
                onClick={() => handleSelect(link.id)}
              >
                <link.icon
                  className={cn("w-4 h-4", link.id === "live" && "animate-pulse")}
                />
                {link.label}
              </Button>
            ))}

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
    <>
      <DesktopRail />
      <MobileNav />
    </>
  );
}
