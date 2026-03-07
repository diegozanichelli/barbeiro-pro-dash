import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";

interface BarberRanking {
  id: string;
  name: string;
  revenue: number;
}

interface LiveTop3RankingProps {
  barbers: BarberRanking[];
}

export default function LiveTop3Ranking({ barbers }: LiveTop3RankingProps) {
  const top3 = [...barbers]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (top3.length === 0) {
    return null;
  }

  const cardConfig = [
    {
      medal: "🥇",
      border: "border-amber-500/40",
      bg: "bg-amber-500/10",
      glow: "shadow-[0_0_12px_hsl(38_92%_50%/0.2)]",
      ring: "ring-1 ring-amber-400/50",
    },
    {
      medal: "🥈",
      border: "border-slate-400/30",
      bg: "bg-slate-400/10",
      glow: "shadow-[0_0_8px_hsl(0_0%_70%/0.15)]",
      ring: "ring-1 ring-slate-300/40",
    },
    {
      medal: "🥉",
      border: "border-orange-500/30",
      bg: "bg-orange-500/10",
      glow: "shadow-[0_0_8px_hsl(25_80%_50%/0.15)]",
      ring: "ring-1 ring-orange-400/40",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {top3.map((barber, index) => {
        const config = cardConfig[index];

        return (
          <motion.div
            key={barber.id}
            className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl border ${config.border} ${config.bg} ${config.glow} backdrop-blur-sm`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.4, type: "spring", stiffness: 140 }}
          >
            {/* Medal */}
            <span className="text-lg sm:text-xl shrink-0">{config.medal}</span>

            {/* Avatar */}
            <Avatar className={`h-8 w-8 sm:h-9 sm:w-9 shrink-0 ${config.ring}`}>
              <AvatarFallback className="bg-card text-primary font-bold text-xs">
                {getInitials(barber.name)}
              </AvatarFallback>
            </Avatar>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-semibold text-foreground truncate">
                {barber.name.split(" ")[0]}
              </p>
              <p className="text-xs font-bold text-primary">
                {barber.revenue.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
