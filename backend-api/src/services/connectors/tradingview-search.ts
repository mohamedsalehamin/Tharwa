import { createRequire } from 'node:module';
import { observeConnector } from '../../lib/connector-metrics.js';

const require = createRequire(import.meta.url);

export type TvSymbolSearchRow = {
  id: string;
  exchange: string;
  fullExchange: string;
  symbol: string;
  description: string;
  type: string;
};

export type TvIndicatorSearchRow = {
  id: string;
  version: string;
  name: string;
  authorId: number;
  authorUsername: string;
  image: string;
  access: string;
  scriptType: 'study' | 'strategy' | string;
};

type TvModule = {
  searchMarketV3: (
    search: string,
    filter?: string,
    offset?: number,
  ) => Promise<
    Array<{
      id: string;
      exchange: string;
      fullExchange: string;
      symbol: string;
      description: string;
      type: string;
      getTA?: () => unknown;
    }>
  >;
  searchIndicator: (search?: string) => Promise<
    Array<{
      id: string;
      version: string;
      name: string;
      author: { id: number; username: string };
      image: string;
      access: string;
      source: string;
      type: string;
      get?: () => unknown;
    }>
  >;
};

function loadTradingView(): TvModule {
  return require('@mathieuc/tradingview') as TvModule;
}

/** Symbol / company search (TradingView symbol_search v3). */
export async function tradingViewSearchSymbols(
  q: string,
  type: string | undefined,
  offset: number,
): Promise<TvSymbolSearchRow[]> {
  const operation = type ? `search_symbols_${type}` : 'search_symbols';
  return observeConnector('tradingview_search', operation, async () => {
    const TV = loadTradingView();
    const filter = type ?? '';
    const rows = await TV.searchMarketV3(q, filter, offset);
    return rows.map(({ id, exchange, fullExchange, symbol, description, type: t }) => ({
      id,
      exchange,
      fullExchange,
      symbol,
      description,
      type: t,
    }));
  });
}

/** Pine study / strategy search (built-ins + public scripts). Omits non-serializable `get` from upstream. */
export async function tradingViewSearchIndicators(q: string, limit: number): Promise<TvIndicatorSearchRow[]> {
  return observeConnector('tradingview_search', 'search_indicators', async () => {
  const TV = loadTradingView();
  const rows = await TV.searchIndicator(q);
  return rows.slice(0, limit).map((r) => ({
    id: r.id,
    version: r.version,
    name: r.name,
    authorId: r.author.id,
    authorUsername: r.author.username,
    image: r.image ?? '',
    access: r.access,
    scriptType: r.type,
  }));
  });
}
