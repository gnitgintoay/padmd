export function calculateSyncedScrollTop({ sourceTop, sourceRange, targetRange, sameContent = false }) {
  const safeSourceTop = Number.isFinite(sourceTop) ? Math.max(0, sourceTop) : 0;
  const safeTargetRange = Number.isFinite(targetRange) ? Math.max(0, targetRange) : 0;
  if (safeTargetRange === 0) return 0;
  if (sameContent) return Math.min(safeSourceTop, safeTargetRange);
  const safeSourceRange = Number.isFinite(sourceRange) ? Math.max(0, sourceRange) : 0;
  if (safeSourceRange === 0) return 0;
  return Math.min((safeSourceTop / safeSourceRange) * safeTargetRange, safeTargetRange);
}
