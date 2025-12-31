import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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

  const medals = ["🥇", "🥈", "🥉"];
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

  return (
    <div className="flex items-end justify-center gap-4 py-4">
      {podiumOrder.map((position) => {
        const barber = top3[position];
        if (!barber) return null;

        const isFirst = position === 0;
        const podiumHeight = isFirst ? "h-24" : position === 1 ? "h-20" : "h-16";
        const avatarSize = isFirst ? "h-16 w-16" : "h-12 w-12";
        const textSize = isFirst ? "text-lg font-bold" : "text-sm font-medium";

        return (
          <div
            key={barber.id}
            className="flex flex-col items-center animate-fade-in"
            style={{ animationDelay: `${position * 100}ms` }}
          >
            <span className="text-2xl mb-1">{medals[position]}</span>
            <Avatar className={`${avatarSize} border-2 border-primary mb-2`}>
              <AvatarFallback className="bg-primary/20 text-primary font-bold">
                {getInitials(barber.name)}
              </AvatarFallback>
            </Avatar>
            <span className={`${textSize} text-foreground text-center max-w-[80px] truncate`}>
              {barber.name.split(" ")[0]}
            </span>
            <span className="text-primary font-bold text-sm">
              {barber.revenue.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </span>
            <div
              className={`${podiumHeight} w-16 mt-2 rounded-t-lg ${
                isFirst
                  ? "bg-gradient-to-t from-primary/80 to-primary"
                  : position === 1
                  ? "bg-gradient-to-t from-muted to-muted-foreground/30"
                  : "bg-gradient-to-t from-orange-900/50 to-orange-700/30"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
