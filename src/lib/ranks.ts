export interface RankInfo {
  name: string;
  tier: "madeira" | "bronze" | "prata" | "ouro";
  level: number;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  emoji: string;
}

export const RANKS: Record<number, RankInfo> = {
  1: { name: "Madeira", tier: "madeira", level: 1, colorClass: "text-rank-madeira", bgClass: "bg-rank-madeira/10", borderClass: "border-rank-madeira", emoji: "🪵" },
  2: { name: "Bronze", tier: "bronze", level: 2, colorClass: "text-rank-bronze", bgClass: "bg-rank-bronze/10", borderClass: "border-rank-bronze", emoji: "🥉" },
  3: { name: "Prata", tier: "prata", level: 3, colorClass: "text-rank-prata", bgClass: "bg-rank-prata/10", borderClass: "border-rank-prata", emoji: "🥈" },
  4: { name: "Ouro", tier: "ouro", level: 4, colorClass: "text-rank-ouro", bgClass: "bg-rank-ouro/10", borderClass: "border-rank-ouro", emoji: "🥇" },
};

export const getRank = (level: number): RankInfo => RANKS[level] || RANKS[1];

export const getYearName = (level: number): string => {
  const map: Record<number, string> = { 1: "1º Ano", 2: "2º Ano", 3: "3º Ano", 4: "4º Ano" };
  return map[level] || "1º Ano";
};
