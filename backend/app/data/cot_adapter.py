"""CFTC Commitment of Traders (COT) data — institutional positioning in gold futures."""

import csv
import io
from datetime import datetime, timezone

import httpx

from backend.app.logging_config import get_logger

logger = get_logger("cot_adapter")

# CFTC Disaggregated Futures-Only report (current year)
DISAGG_URL = "https://www.cftc.gov/dea/newcot/f_disagg.txt"

# Disaggregated report column indices (0-based) — verified from CFTC data
# Row structure: Market Name, YYMMDD, YYYY-MM-DD, CFTC Code, Exchange, ...
COL_MARKET = 0
COL_DATE = 2
COL_CFTC_CODE = 3
COL_OI = 7
COL_PROD_LONG = 8
COL_PROD_SHORT = 9
COL_SWAP_LONG = 10
COL_MM_LONG = 11
COL_MM_SHORT = 12
COL_OTHER_LONG = 13
COL_OTHER_SHORT = 14
COL_NONREP_LONG = 21
COL_NONREP_SHORT = 22
# Changes from previous week (cols 55+)
COL_CHG_OI = 55
COL_CHG_PROD_LONG = 56
COL_CHG_PROD_SHORT = 57
COL_CHG_SWAP_LONG = 58
COL_CHG_MM_LONG = 59
COL_CHG_MM_SHORT = 60
COL_CHG_OTHER_LONG = 61
COL_CHG_OTHER_SHORT = 62


class COTAdapter:
    """Parses CFTC Commitment of Traders reports for gold futures positioning."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None
        self._cache: dict | None = None
        self._cache_time: datetime | None = None

    async def connect(self):
        self._client = httpx.AsyncClient(timeout=60.0)

    async def disconnect(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    def _is_cached(self, max_age_hours: int = 12) -> bool:
        if self._cache_time:
            age = (datetime.now(timezone.utc) - self._cache_time).total_seconds() / 3600
            return age < max_age_hours
        return False

    async def get_gold_cot(self) -> dict:
        """Fetch and parse COT data for gold futures."""
        if self._is_cached():
            return self._cache

        if not self._client:
            await self.connect()

        try:
            result = await self._fetch_disaggregated("GOLD")
            if result:
                self._cache = result
                self._cache_time = datetime.now(timezone.utc)
                return result
        except Exception as e:
            logger.error("cot_fetch_failed", error=str(e))

        return self._empty_cot_report()

    async def _fetch_disaggregated(self, commodity: str) -> dict | None:
        """Parse the disaggregated futures-only report using positional columns."""
        try:
            resp = await self._client.get(DISAGG_URL)
            resp.raise_for_status()
        except Exception as e:
            logger.warning("disagg_fetch_failed", error=str(e))
            return None

        reader = csv.reader(io.StringIO(resp.text))
        gold_row = None

        for row in reader:
            if len(row) > COL_MARKET and commodity.upper() in row[COL_MARKET].upper():
                if gold_row is None or row[COL_DATE] > gold_row[COL_DATE]:
                    gold_row = row

        if not gold_row:
            logger.warning("gold_not_found_in_cot")
            return None

        return self._parse_positional_row(gold_row)

    def _parse_positional_row(self, row: list[str]) -> dict:
        """Extract positioning data from positional CSV row."""

        def val(idx: int) -> int:
            try:
                return int(row[idx].strip().replace(",", ""))
            except (IndexError, ValueError):
                return 0

        report_date = row[COL_DATE].strip() if len(row) > COL_DATE else ""
        oi = val(COL_OI)

        # Positions
        prod_long = val(COL_PROD_LONG)
        prod_short = val(COL_PROD_SHORT)
        swap_long = val(COL_SWAP_LONG)
        mm_long = val(COL_MM_LONG)
        mm_short = val(COL_MM_SHORT)
        other_long = val(COL_OTHER_LONG)
        other_short = val(COL_OTHER_SHORT)
        nonrep_long = val(COL_NONREP_LONG)
        nonrep_short = val(COL_NONREP_SHORT)

        # Weekly changes
        mm_long_chg = val(COL_CHG_MM_LONG)
        mm_short_chg = val(COL_CHG_MM_SHORT)
        prod_long_chg = val(COL_CHG_PROD_LONG)
        prod_short_chg = val(COL_CHG_PROD_SHORT)

        # Net positions
        mm_net = mm_long - mm_short
        prod_net = prod_long - prod_short
        swap_net = swap_long - val(COL_SWAP_LONG + 1) if len(row) > COL_SWAP_LONG + 1 else swap_long

        # Analysis signals
        signals = []

        if mm_net > 0:
            if mm_long_chg > 0:
                signals.append(f"Hedge funds net long {mm_net:,} contracts, adding {mm_long_chg:,} longs this week — bullish")
            elif mm_long_chg < 0:
                signals.append(f"Hedge funds net long {mm_net:,} but reduced by {abs(mm_long_chg):,} — momentum fading")
            else:
                signals.append(f"Hedge funds net long {mm_net:,} contracts — bullish positioning")
        else:
            signals.append(f"Hedge funds net short {abs(mm_net):,} — bearish positioning")

        if prod_net < -50000:
            signals.append(f"Producers hedging heavily ({prod_net:,} net) — expect higher prices")

        if mm_short_chg < -1000:
            signals.append(f"Short covering: {abs(mm_short_chg):,} shorts closed — bullish catalyst")

        # Overall signal
        gold_signal = "bullish" if mm_net > 0 and mm_long_chg >= 0 else "bearish" if mm_net < 0 else "neutral"

        return {
            "report_date": report_date,
            "open_interest": oi,
            "managed_money": {
                "long": mm_long,
                "short": mm_short,
                "net": mm_net,
                "change_long": mm_long_chg,
                "change_short": mm_short_chg,
            },
            "producers": {
                "long": prod_long,
                "short": prod_short,
                "net": prod_net,
                "change_long": prod_long_chg,
                "change_short": prod_short_chg,
            },
            "swap_dealers": {
                "long": swap_long,
                "short": 0,
                "net": swap_long,
            },
            "other_reportable": {
                "long": other_long,
                "short": other_short,
                "net": other_long - other_short,
            },
            "non_reportable": {
                "long": nonrep_long,
                "short": nonrep_short,
                "net": nonrep_long - nonrep_short,
            },
            "signals": signals,
            "gold_signal": gold_signal,
        }

    def _empty_cot_report(self) -> dict:
        return {
            "report_date": "",
            "open_interest": 0,
            "managed_money": {"long": 0, "short": 0, "net": 0, "change_long": 0, "change_short": 0},
            "producers": {"long": 0, "short": 0, "net": 0, "change_long": 0, "change_short": 0},
            "swap_dealers": {"long": 0, "short": 0, "net": 0},
            "other_reportable": {"long": 0, "short": 0, "net": 0},
            "non_reportable": {"long": 0, "short": 0, "net": 0},
            "signals": ["Data unavailable"],
            "gold_signal": "neutral",
        }


# Singleton
cot_adapter = COTAdapter()
