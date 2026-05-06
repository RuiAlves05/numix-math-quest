export const STREAK_TIERS = [
  { min: 0, multiplier: 1.0, next: 5 },
  { min: 5, multiplier: 1.3, next: 10 },
  { min: 10, multiplier: 1.5, next: 15 },
  { min: 15, multiplier: 1.8, next: 20 },
  { min: 20, multiplier: 2.0, next: null as number | null },
];

export function getStreakInfo(streak: number) {
  const tier = [...STREAK_TIERS].reverse().find((t) => streak >= t.min)!;
  const toNext = tier.next === null ? 0 : tier.next - streak;
  return { multiplier: tier.multiplier, nextThreshold: tier.next, toNext };
}

export function previewMultiplier(currentStreak: number) {
  // multiplier that would apply if next answer is correct (streak+1)
  return getStreakInfo(currentStreak + 1).multiplier;
}
