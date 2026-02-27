"""Data source registry — manages adapters and symbol routing."""

from backend.app.data.base import DataSourceAdapter
from backend.app.logging_config import get_logger

logger = get_logger("data_registry")


class DataSourceRegistry:
    """
    Central registry for data adapters.
    Routes symbol requests to the appropriate adapter.
    """

    def __init__(self):
        self._adapters: dict[str, DataSourceAdapter] = {}
        # symbol -> adapter name mapping
        self._symbol_routes: dict[str, str] = {}

    def register(self, adapter: DataSourceAdapter) -> None:
        self._adapters[adapter.name] = adapter
        logger.info("adapter_registered", name=adapter.name, market=adapter.market_type.value)

    def get_adapter(self, name: str) -> DataSourceAdapter:
        if name not in self._adapters:
            raise KeyError(f"Adapter '{name}' not registered. Available: {list(self._adapters)}")
        return self._adapters[name]

    # Known crypto base currencies for auto-detection
    _CRYPTO_BASES = {"BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "DOT", "AVAX", "MATIC", "LINK", "UNI"}

    # Known forex base currencies
    _FOREX_BASES = {"EUR", "GBP", "USD", "JPY", "AUD", "CAD", "NZD", "CHF"}

    def route_symbol(self, symbol: str) -> DataSourceAdapter:
        """Find the right adapter for a symbol."""
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

    def list_adapters(self) -> list[dict]:
        return [
            {"name": a.name, "market_type": a.market_type.value}
            for a in self._adapters.values()
        ]


# Global registry
data_registry = DataSourceRegistry()
