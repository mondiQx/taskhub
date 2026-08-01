const PALETTE = ["#f0dfa0", "#e6bfae", "#bcd2b6", "#a9c4cf", "#c9b6cf"];

export function colorForId(id: string): string {
  const hash = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return PALETTE[hash % PALETTE.length];
}
