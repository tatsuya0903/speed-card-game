/** P50は中央値（偶数件は中央2値の平均）。P95はnearest-rank。 */
export function statistics(samples: readonly number[]) {
  if (!samples.length) return { latest: null, mean: null, p50: null, p95: null, max: null }
  const sorted = [...samples].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return {
    latest: samples.at(-1)!,
    mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    p50: sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
    max: sorted.at(-1)!,
  }
}
