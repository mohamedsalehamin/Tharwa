export type HeatmapSectorInput = {
  code: string;
  titleAr: string;
  titleEn: string;
  sortOrder: number;
  symbols: string[];
};

export type SectorHeatmapCell = {
  code: string;
  titleAr: string;
  titleEn: string;
  memberCount: number;
  quotedCount: number;
  changePct: number | null;
};

/**
 * Equal-weight mean of member `changePct` values. Missing quotes are skipped,
 * not treated as zero.
 */
export function aggregateSectorHeatmap(
  sectors: HeatmapSectorInput[],
  quotesBySymbol: Map<string, number | null>,
): SectorHeatmapCell[] {
  const cells = sectors.map((sector) => {
    const symbols = sector.symbols.map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0);
    let sum = 0;
    let quotedCount = 0;
    for (const sym of symbols) {
      const pct = quotesBySymbol.get(sym);
      if (pct == null || !Number.isFinite(pct)) continue;
      sum += pct;
      quotedCount += 1;
    }
    return {
      code: sector.code,
      titleAr: sector.titleAr,
      titleEn: sector.titleEn,
      memberCount: symbols.length,
      quotedCount,
      changePct:
        quotedCount === 0 ? null : Math.round((sum / quotedCount) * 10000) / 10000,
    };
  });
  return cells.sort((a, b) => {
    const sa = sectors.find((s) => s.code === a.code)?.sortOrder ?? 0;
    const sb = sectors.find((s) => s.code === b.code)?.sortOrder ?? 0;
    if (sa !== sb) return sa - sb;
    return a.titleEn.localeCompare(b.titleEn);
  });
}
