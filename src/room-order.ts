// Join order does not change when host rights are handed to another player.
export function remainingJoinOrder(joinOrder: readonly string[], departing: string): string[] {
  return joinOrder.filter(uid => uid !== departing);
}

export function nextHost(joinOrder: readonly string[], departing: string): string | null {
  return remainingJoinOrder(joinOrder, departing)[0] ?? null;
}
