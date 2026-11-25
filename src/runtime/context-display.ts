/** Format a readable, fixed-width context bar for detailed /context output. */
export function formatContextBar(usedTokens: number, contextWindowTokens: number, width = 24): string {
  const cells = Math.max(1, Math.min(60, Math.floor(width)));
  const valid = Number.isFinite(usedTokens) && Number.isFinite(contextWindowTokens) && contextWindowTokens > 0;
  const ratio = valid ? Math.min(1, Math.max(0, usedTokens / contextWindowTokens)) : 1;
  const filled = Math.round(ratio * cells);
  return '█'.repeat(filled) + '░'.repeat(cells - filled);
}
