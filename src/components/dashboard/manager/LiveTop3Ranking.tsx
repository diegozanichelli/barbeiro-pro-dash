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

  const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd for visual podium

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

  const podiumConfig = [
    {
      height: "h-28",
      avatarSize: "h-20 w-20",
      textSize: "text-xl font-extrabold",
      revenueSize: "text-lg",
      medal: "🥇",
      delay: 0.2,
      ringColor: "ring-amber-400 ring-offset-2 ring-offset-card",
      gradient: "from-amber-500/30 via-amber-400/20 to-amber-600/30",
      podiumGradient: "from-amber-500 to-amber-600",
      glowShadow: "shadow-[0_0_30px_hsl(38_92%_50%/0.4)]",
      scale: 1.05,
    },
    {
      height: "h-20",
      avatarSize: "h-14 w-14",
      textSize: "text-base font-bold",
      revenueSize: "text-sm",
      medal: "🥈",
      delay: 0.4,
      ringColor: "ring-slate-300 ring-offset-2 ring-offset-card",
      gradient: "from-slate-300/20 via-slate-200/10 to-slate-400/20",
      podiumGradient: "from-slate-400 to-slate-500",
      glowShadow: "shadow-[0_0_20px_hsl(0_0%_70%/0.3)]",
      scale: 1,
    },
    {
      height: "h-16",
      avatarSize: "h-12 w-12",
      textSize: "text-sm font-semibold",
      revenueSize: "text-xs",
      medal: "🥉",
      delay: 0.6,
      ringColor: "ring-orange-400 ring-offset-2 ring-offset-card",
      gradient: "from-orange-500/20 via-orange-400/10 to-orange-600/20",
      podiumGradient: "from-orange-600 to-orange-700",
      glowShadow: "shadow-[0_0_15px_hsl(25_80%_50%/0.3)]",
      scale: 1,
    },
  ];

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6 py-6 px-2">
      {podiumOrder.map((position) => {
        const barber = top3[position];
        if (!barber) return null;

        const config = podiumConfig[position];

        return (
          <motion.div
            key={barber.id}
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 40, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: config.scale }}
            transition={{
              delay: config.delay,
              duration: 0.6,
              type: "spring",
              stiffness: 120,
            }}
          >
            {/* Medal */}
            <motion.span
              className="text-3xl mb-2"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: config.delay + 0.3, type: "spring", stiffness: 200 }}
            >
              {config.medal}
            </motion.span>

            {/* Avatar with glow */}
            <div className={`relative rounded-full ${config.glowShadow} mb-2`}>
              <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${config.gradient} blur-md`} />
              <Avatar className={`${config.avatarSize} ring-2 ${config.ringColor} relative`}>
                <AvatarFallback className="bg-card text-primary font-bold text-lg">
                  {getInitials(barber.name)}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Name */}
            <span className={`${config.textSize} text-foreground text-center max-w-[90px] truncate`}>
              {barber.name.split(" ")[0]}
            </span>

            {/* Revenue */}
            <motion.span
              className={`text-primary font-bold ${config.revenueSize} mt-0.5`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: config.delay + 0.5 }}
            >
              {barber.revenue.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </motion.span>

            {/* Podium block */}
            <motion.div
              className={`${config.height} w-16 sm:w-20 mt-3 rounded-t-xl bg-gradient-to-t ${config.podiumGradient} relative overflow-hidden`}
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              transition={{ delay: config.delay + 0.1, duration: 0.5, ease: "easeOut" }}
            >
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <div className="absolute bottom-2 left-0 right-0 text-center">
                <span className="text-white/80 font-bold text-xs">
                  #{position + 1}
                </span>
              </div>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}
