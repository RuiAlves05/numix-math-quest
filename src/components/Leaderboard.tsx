import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Flame, Trophy } from "lucide-react";
import { RANKS, getRank } from "@/lib/ranks";
import { cn } from "@/lib/utils";

interface Row {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  points: number;
  best_streak: number;
  correct_answers: number;
  total_answers: number;
  rank: number;
}

interface LeaderboardProps {
  defaultLevel?: number;
  currentUserId?: string;
  limit?: number;
}

const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : `#${r}`);

export const Leaderboard = ({ defaultLevel = 1, currentUserId, limit = 10 }: LeaderboardProps) => {
  const [level, setLevel] = useState(defaultLevel);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc("get_leaderboard" as any, {
        _level: level,
        _limit: limit,
      });
      if (error) setError(error.message);
      else setRows((data as Row[]) || []);
      setLoading(false);
    };
    load();
  }, [level, limit]);

  const rank = getRank(level);
  const top = rows.filter((r) => r.rank <= limit);
  const me = rows.find((r) => r.user_id === currentUserId);
  const meOutside = me && me.rank > limit ? me : null;

  return (
    <div className="space-y-4">
      <Tabs value={String(level)} onValueChange={(v) => setLevel(Number(v))}>
        <TabsList className="grid grid-cols-4 w-full">
          {[1, 2, 3, 4].map((l) => (
            <TabsTrigger key={l} value={String(l)} className="gap-1">
              <span>{RANKS[l].emoji}</span>
              <span className="hidden sm:inline">{RANKS[l].name}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className={cn("flex items-center gap-2 px-1")}>
        <Badge className={cn(rank.bgClass, rank.colorClass, "border", rank.borderClass)} variant="outline">
          <Trophy className="w-3 h-3 mr-1" />
          Ranking {rank.name}
        </Badge>
      </div>

      {loading && (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-destructive text-center py-4">Erro: {error}</p>
      )}

      {!loading && !error && top.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          Sê o primeiro a marcar pontos neste ranking!
        </p>
      )}

      <div className="space-y-2">
        {top.map((r) => (
          <Row key={r.user_id} row={r} highlight={r.user_id === currentUserId} />
        ))}
        {meOutside && (
          <>
            <p className="text-xs text-muted-foreground text-center pt-2">A tua posição</p>
            <Row row={meOutside} highlight />
          </>
        )}
      </div>
    </div>
  );
};

const Row = ({ row, highlight }: { row: Row; highlight: boolean }) => {
  const accuracy = row.total_answers > 0 ? Math.round((row.correct_answers / row.total_answers) * 100) : 0;
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl border transition-colors",
        highlight ? "border-primary bg-primary/10" : "border-border bg-card"
      )}
    >
      <div className="w-8 text-center font-bold text-sm">{medal(row.rank)}</div>
      <Avatar className="w-10 h-10">
        {row.avatar_url ? <AvatarImage src={row.avatar_url} /> : null}
        <AvatarFallback>{row.display_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{row.display_name}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <span className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-accent" />
            {row.best_streak}
          </span>
          <span>•</span>
          <span>{accuracy}% acerto</span>
        </p>
      </div>
      <div className="text-right">
        <p className="font-bold text-primary">{row.points}</p>
        <p className="text-xs text-muted-foreground">pts</p>
      </div>
    </div>
  );
};
