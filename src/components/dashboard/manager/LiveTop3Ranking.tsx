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
  const sorted = [...barbers]
    .sort((a, b) => b.revenue - a.revenue);

  if (sorted.length === 0) {
    return null;
  }

  const getMedal = (index: number) => {
    const medals = ["🥇", "🥈", "🥉"];
    if (index < 3) return medals[index];
    return null;
  };

  return (
    <div className="space-y-1">
      {sorted.map((barber, index) => {
        const medal = getMedal(index);
        const isTop3 = index < 3;

        return (
          <motion.div
            key={barber.id}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
              index === 0
                ? "bg-amber-500/10 border border-amber-500/30"
                : isTop3
                  ? "bg-card/60 border border-border/30"
                  : "hover:bg-card/40"
            }`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {medal ? (
                <span className="text-base shrink-0">{medal}</span>
              ) : (
                <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">
                  {index + 1}º
                </span>
              )}
              <span className={`text-sm truncate ${isTop3 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {barber.name.split(" ")[0]}
              </span>
            </div>
            <span className={`text-sm font-bold shrink-0 ml-2 ${
              index === 0 ? "text-primary" : isTop3 ? "text-foreground" : "text-muted-foreground"
            }`}>
              {barber.revenue.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
