"""Data source registry — manages adapters and symbol routing."""

from backend.app.data.base import DataSourceAdapter, OrderBook
from backend.app.logging_config import get_logger

logger = get_logger("data_registry")


class DataSourceRegistry:
    """
    Central registry for data adapters.
    Routes symbol requests to the appropriate adapter.
    """

    def __init__(self):
        self._adapters: dict[str, DataSourceAdapter] = {}
        # symbol -> adapter name mapping (for OHLCV / ticker)
        self._symbol_routes: dict[str, str] = {}
        # symbol -> adapter name for orderbook specifically
        self._orderbook_routes: dict[str, str] = {}

    def register(self, adapter: DataSourceAdapter) -> None:
        self._adapters[adapter.name] = adapter
        logger.info("adapter_registered", name=adapter.name, market=adapter.market_type.value)

    def get_adapter(self, name: str) -> DataSourceAdapter:
        if name not in self._adapters:
            raise KeyError(f"Adapter '{name}' not registered. Available: {list(self._adapters)}")
        return self._adapters[name]

    # Known crypto base currencies for auto-detection (must match platform's full crypto list)
    _CRYPTO_BASES = {
        "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT", "AVAX",
        "MATIC", "LINK", "UNI", "LTC", "NEAR", "SUI", "TRX", "PEPE", "SHIB",
        "AAVE", "TAO", "BCH", "ICP", "APT", "HBAR", "FIL", "XLM", "ARB",
        "SEI", "TON", "ONDO", "BONK", "ENA", "WLD", "TIA", "RENDER", "FTM",
        "INJ", "OP", "ATOM", "WIF",
    }

    # Known forex base currencies
    _FOREX_BASES = {"EUR", "GBP", "USD", "JPY", "AUD", "CAD", "NZD", "CHF"}

    def route_symbol(self, symbol: str) -> DataSourceAdapter:
        """Find the right adapter for a symbol (OHLCV / ticker)."""
        symbol = symbol.upper()

        # Check explicit routes first
        if symbol in self._symbol_routes:
            return self._adapters[self._symbol_routes[symbol]]

        # Gold/Silver → commodity/forex adapter
        if symbol in {"XAUUSD", "XAGUSD", "GC", "SI", "GLD"}:
            for adapter in self._adapters.values():
                if adapter.market_type.value in ("commodity", "forex"):
                    return adapter

        # Crypto detection: base currency is a known crypto
        if len(symbol) >= 5 and symbol[:3] in self._CRYPTO_BASES:
            for adapter in self._adapters.values():
                if adapter.market_type.value == "crypto":
                    return adapter

        # Also check 4-char crypto bases (e.g. DOGE, AVAX)
        for base in self._CRYPTO_BASES:
            if symbol.startswith(base):
                for adapter in self._adapters.values():
                    if adapter.market_type.value == "crypto":
                        return adapter

        # Forex (6-char pairs where base is a known fiat currency)
        if len(symbol) == 6 and symbol.isalpha() and symbol[:3] in self._FOREX_BASES:
            for adapter in self._adapters.values():
                if adapter.market_type.value == "forex":
                    return adapter

        raise ValueError(f"No adapter found for symbol: {symbol}")

    def set_route(self, symbol: str, adapter_name: str) -> None:
        """Manually route a symbol to a specific adapter."""
        self._symbol_routes[symbol.upper()] = adapter_name

    def set_orderbook_route(self, symbol: str, adapter_name: str) -> None:
        """Route a symbol's orderbook requests to a specific adapter."""
        self._orderbook_routes[symbol.upper()] = adapter_name

    async def fetch_real_orderbook(self, symbol: str, depth: int = 500) -> OrderBook | None:
        """Fetch REAL orderbook data. Tries orderbook-specific adapter first,
        then primary adapter, then all adapters.

        Returns None only if no real data is available.
        NEVER generates synthetic/fake data.
        """
        symbol = symbol.upper()
        tried: set[str] = set()

        # 1. Try orderbook-specific adapter (e.g. Binance for crypto, OANDA for forex)
        if symbol in self._orderbook_routes:
            name = self._orderbook_routes[symbol]
            adapter = self._adapters.get(name)
            if adapter:
                tried.add(name)
                try:
                    await adapter.connect()
                    ob = await adapter.fetch_orderbook(symbol, depth)
                    if ob and ob.bids and ob.asks:
                        logger.info("orderbook_real", symbol=symbol, adapter=name,
                                    bids=len(ob.bids), asks=len(ob.asks))
                        return ob
                except Exception as e:
                    logger.warning("orderbook_failed", symbol=symbol, adapter=name, error=str(e))
                finally:
                    try:
                        await adapter.disconnect()
                    except Exception:
                        pass

        # 2. Try the primary symbol adapter
        try:
            primary = self.route_symbol(symbol)
            if primary.name not in tried:
                tried.add(primary.name)
                await primary.connect()
                try:
                    ob = await primary.fetch_orderbook(symbol, depth)
                    if ob and ob.bids and ob.asks:
                        logger.info("orderbook_real", symbol=symbol, adapter=primary.name,
                                    bids=len(ob.bids), asks=len(ob.asks))
                        return ob
                finally:
                    try:
                        await primary.disconnect()
                    except Exception:
                        pass
        except Exception as e:
            logger.warning("orderbook_primary_failed", symbol=symbol, error=str(e))

        # 3. Try ALL remaining adapters (brute force — find anyone with real data)
        for adapter in self._adapters.values():
            if adapter.name in tried:
                continue
            try:
                await adapter.connect()
                ob = await adapter.fetch_orderbook(symbol, depth)
                if ob and ob.bids and ob.asks:
                    logger.info("orderbook_real_fallback", symbol=symbol, adapter=adapter.name,
                                bids=len(ob.bids), asks=len(ob.asks))
                    return ob
            except Exception:
                continue
            finally:
                try:
                    await adapter.disconnect()
                except Exception:
                    pass

        logger.warning("no_real_orderbook_available", symbol=symbol)
        return None

    def list_adapters(self) -> list[dict]:
        return [
            {"name": a.name, "market_type": a.market_type.value}
            for a in self._adapters.values()
        ]


# Global registry
data_registry = DataSourceRegistry()
