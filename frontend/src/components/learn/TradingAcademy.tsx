"use client";

import { useState, useCallback } from "react";
import {
  GraduationCap,
  ChevronDown,
  ChevronRight,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Brain,
  Target,
  Shield,
  Zap,
  Eye,
  BookOpen,
  Lightbulb,
  AlertTriangle,
  ArrowLeft,
  Crosshair,
  LineChart,
  CandlestickChart,
  Gauge,
  Globe,
  Flame,
  Clock,
  CheckCircle2,
  Trophy,
  XCircle,
  RotateCcw,
  Star,
  Award,
} from "lucide-react";
import Link from "next/link";

/* ═══════════════════════════════════════════════════════
   TYPES & DATA
   ═══════════════════════════════════════════════════════ */

interface SubSection {
  title: string;
  content: string;
  tip?: string;
  warning?: string;
  example?: string;
}

interface Chapter {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  icon: typeof GraduationCap;
  color: string;
  sections: SubSection[];
}

const CHAPTERS: Chapter[] = [
  /* ── Chapter 1 ── */
  {
    id: "welcome",
    number: 1,
    title: "Welcome to VISION",
    subtitle: "What this platform does and how to navigate it",
    icon: Eye,
    color: "var(--color-neon-cyan)",
    sections: [
      {
        title: "What is VISION?",
        content:
          "VISION is an institutional-grade trading analytics platform that gives retail traders the same tools used by hedge funds, prop desks, and market makers. It combines real-time price data, 14+ technical indicators, machine learning predictions, smart money tracking, and AI-powered analysis — all in one unified dashboard.",
        tip: "VISION is not a broker. It's an analytics layer that helps you make better trading decisions with data-driven insights rather than gut feelings.",
      },
      {
        title: "Dashboard Overview",
        content:
          "The dashboard is split into two panels. The LEFT panel shows the price chart with overlays, a volume profile sidebar, and the technical indicator panel. The RIGHT panel is a scrollable stack of analytical widgets — each providing a different perspective on the market. Widgets load progressively based on priority, so the most actionable tools appear first.",
      },
      {
        title: "Selecting an Asset",
        content:
          "Click the asset name in the top-left header (e.g., XAU/USD) to open the asset selector. Assets are grouped by category: Commodities (Gold), Crypto (BTC), Forex Majors (EUR/USD, GBP/USD, etc.), Forex Minors (cross pairs), and Indices (NAS100, SPX500). A green dot means the market is currently open; red means closed.",
      },
      {
        title: "Timeframes",
        content:
          "The timeframe selector sits above the chart. Each button (1m, 5m, 15m, 1H, 4H, 1D, 1W) changes the candle duration on the chart and recalculates all indicators. Lower timeframes (1m-15m) are for scalping and day trading. Higher timeframes (4H-1W) are for swing trading and identifying the bigger trend. Always check multiple timeframes before entering a trade.",
        tip: "Start with the daily (1D) chart to understand the trend, then zoom into 1H or 15m to find precise entries. This is called top-down analysis.",
      },
      {
        title: "Real-Time Data",
        content:
          "The LIVE badge in the header indicates you're receiving real-time price updates. Crypto prices stream via WebSocket from Binance. Forex and commodity prices update via REST polling every 10 seconds from OANDA. The price display next to the asset name shows the current bid price and session change percentage.",
      },
    ],
  },

  /* ── Chapter 2 ── */
  {
    id: "chart",
    number: 2,
    title: "Reading the Chart",
    subtitle: "Candlesticks, overlays, sessions, and volume",
    icon: CandlestickChart,
    color: "var(--color-neon-green)",
    sections: [
      {
        title: "Candlestick Basics",
        content:
          "Each candle represents one period of trading (determined by your timeframe). The body shows the Open and Close prices — green means price went up (close > open), red means it went down. The wicks (thin lines above and below) show the High and Low of that period. Long wicks suggest rejection at that price level. A candle with a tiny body and long wicks (doji) signals indecision.",
        example: "candlestick-anatomy",
        tip: "Pay attention to candle size relative to recent candles. An unusually large candle often signals institutional activity or a major breakout.",
      },
      {
        title: "Chart Overlay Toggles",
        content:
          "Above the chart you'll find toggle buttons: TP/SL shows estimated take-profit and stop-loss clusters as colored zones. Liq shows the liquidation heatmap (crypto only). Stops shows the stop-loss heatmap as a thermal overlay. MBO shows the Market-by-Order profile with institutional vs retail order segmentation. Toggle these on/off to layer different intelligence on the chart.",
      },
      {
        title: "Trading Sessions",
        content:
          "Financial markets have three major trading sessions: Tokyo (00:00-09:00 UTC), London (07:00-16:00 UTC), and New York (13:00-22:00 UTC). The London-New York overlap (13:00-16:00 UTC) is the highest-volume period when the biggest moves happen. For forex, the session determines liquidity — avoid trading thin sessions where spreads widen and moves are erratic.",
        example: "session-bands",
        warning: "Most fake breakouts happen at the start of a new session. Wait 15-30 minutes after a session opens before trading the breakout direction.",
      },
      {
        title: "Moving Averages on Chart",
        content:
          "Moving averages smooth out price noise to show the underlying trend. VISION plots SMA (Simple Moving Average) and EMA (Exponential Moving Average) with key periods: 8 (short-term momentum), 21 (intermediate trend), 50 (medium-term trend), and 200 (long-term trend). When shorter MAs cross above longer ones, it's bullish. When they cross below, it's bearish. These crossovers are called Golden Cross (bullish) and Death Cross (bearish).",
        example: "ma-cross",
      },
      {
        title: "Volume Bars",
        content:
          "Volume bars appear at the bottom of the chart. Green bars mean the candle closed higher (buying pressure), red bars mean it closed lower (selling pressure). The bar height represents how much volume traded in that period. Volume confirms price action — a breakout with high volume is more reliable than one with low volume. Declining volume during a trend suggests the move is losing steam.",
        tip: "Volume spikes (bars 2-3x taller than average) often mark the beginning or end of a significant move. They signal institutional participation.",
      },
    ],
  },

  /* ── Chapter 3 ── */
  {
    id: "indicators",
    number: 3,
    title: "Technical Indicators",
    subtitle: "RSI, MACD, Bollinger Bands, and how they combine",
    icon: Activity,
    color: "var(--color-neon-purple)",
    sections: [
      {
        title: "RSI (Relative Strength Index)",
        content:
          "RSI measures momentum on a scale from 0 to 100. It answers: 'How overbought or oversold is this asset?' Above 70 = overbought (price may be due for a pullback). Below 30 = oversold (price may be due for a bounce). Between 40-60 = neutral/trending zone. RSI divergence — when price makes new highs but RSI doesn't — is one of the most powerful reversal signals.",
        example: "rsi-zones",
        tip: "In strong trends, RSI can stay overbought/oversold for extended periods. Don't blindly sell at RSI 70 in an uptrend. Instead, use RSI divergence as your signal.",
      },
      {
        title: "MACD (Moving Average Convergence Divergence)",
        content:
          "MACD shows the relationship between two moving averages (12 and 26-period EMA). The MACD line is the difference between them. The Signal line is a 9-period EMA of MACD. The Histogram shows the gap between MACD and Signal — positive bars mean bullish momentum, negative mean bearish. Buy signals occur when MACD crosses above the Signal line. Sell signals when it crosses below.",
        example: "macd-example",
      },
      {
        title: "Stochastic RSI",
        content:
          "Stochastic RSI applies the stochastic oscillator formula to RSI values, creating a more sensitive momentum indicator. It oscillates between 0 and 100 with overbought (>80) and oversold (<20) zones. The %K line (fast) and %D line (slow) generate crossover signals. It's faster than regular RSI and better for catching short-term reversals.",
        warning: "Stochastic RSI is noisy on low timeframes. Use it on 15m+ for cleaner signals and always confirm with at least one other indicator.",
      },
      {
        title: "Bollinger Bands",
        content:
          "Bollinger Bands consist of three lines: a 20-period SMA (middle band) with upper and lower bands at 2 standard deviations away. When bands squeeze tight (low volatility), a big move is coming — this is called a Bollinger Squeeze. When price touches the upper band, it's extended; lower band means oversold. Bands expand during high volatility and contract during consolidation.",
        example: "bollinger-bands",
        tip: "A Bollinger Squeeze followed by a break outside the bands often signals the beginning of a strong trend. Combine with volume — high volume on the breakout confirms it.",
      },
      {
        title: "ATR (Average True Range)",
        content:
          "ATR measures market volatility — not direction. It calculates the average range of each candle over 14 periods. ATR is critical for position sizing: use 1.5-2x ATR for stop-loss placement and 2.5-4x ATR for take-profit targets. Higher ATR means wider stops are needed to avoid getting stopped out by normal noise. Lower ATR means tighter stops are appropriate.",
        tip: "Never use fixed-pip stop losses. Always scale your SL/TP to the current ATR. A 50-pip stop on EUR/USD might be fine during quiet hours but too tight during London session.",
      },
      {
        title: "How Indicators Combine → Composite Score",
        content:
          "No single indicator is reliable alone. VISION calculates a Composite Score (0-100) by weighting all indicators together. Each indicator votes bullish, bearish, or neutral with a specific weight. The score aggregates these votes: above 65 = bullish bias, below 35 = bearish bias, 35-65 = neutral. The more indicators that agree (confluence), the stronger the signal. The Trade Score widget shows the full breakdown.",
      },
    ],
  },

  /* ── Chapter 4 ── */
  {
    id: "volume",
    number: 4,
    title: "Volume & Order Flow",
    subtitle: "Where the money is moving and why it matters",
    icon: BarChart3,
    color: "var(--color-neon-blue)",
    sections: [
      {
        title: "Volume Spikes",
        content:
          "A volume spike occurs when trading volume is 2-3x higher than the 20-period average. This signals institutional participation — large players entering or exiting positions. Spikes at key support/resistance levels are especially significant. A spike at a support level with a bullish candle = strong buying interest. A spike at resistance with a bearish candle = strong distribution.",
        example: "volume-spike",
      },
      {
        title: "OBV (On-Balance Volume)",
        content:
          "OBV is a running total of volume — it adds volume on up days and subtracts it on down days. The direction of OBV reveals whether volume is flowing into (accumulation) or out of (distribution) the asset. If price is rising but OBV is flat or declining, it means the rally lacks volume support and may reverse. If OBV is rising while price is flat, institutions may be quietly accumulating before a breakout.",
        tip: "OBV divergence from price is one of the earliest warning signs of a trend reversal. Watch for price making new highs while OBV fails to confirm.",
      },
      {
        title: "A/D Line (Accumulation/Distribution)",
        content:
          "The A/D Line weighs volume by where price closes within the candle range. If price closes near the high, most volume is counted as buying (accumulation). Near the low = selling (distribution). Unlike OBV which only looks at close direction, A/D considers the close position within the range, making it more nuanced.",
      },
      {
        title: "Volume Profile (VAH / VAL / POC)",
        content:
          "Volume Profile shows the total volume traded at each price level over a period, displayed as a horizontal histogram. POC (Point of Control) is the price level with the MOST volume — it acts as a magnet that price tends to return to. VAH (Value Area High) and VAL (Value Area Low) define the range where 70% of all trading occurred. Price tends to oscillate within the Value Area.",
        example: "volume-profile",
        tip: "When price breaks above VAH with strong volume, it often accelerates. When it falls below VAL, it often cascades. These are high-probability breakout levels.",
      },
      {
        title: "Order Flow Analysis",
        content:
          "The Order Flow widget shows real-time market microstructure: Delta measures net buying vs selling pressure (buy volume minus sell volume). Positive delta = buyers dominant. Imbalance Ratio shows the proportion of aggressive orders. Buy/sell walls are large resting orders in the order book that can act as support or resistance. Absorption means a large wall is eating incoming orders without price moving — a sign of institutional accumulation.",
      },
      {
        title: "Deep Order Book",
        content:
          "The Deep Order Book shows bid (buy) and ask (sell) orders at multiple price levels with quantity and cumulative totals. It reveals where institutional liquidity is sitting. A massive bid wall means strong support; a massive ask wall means heavy resistance. The bid:ask ratio tells you the overall balance of supply and demand. However, be aware that large orders can be pulled (spoofing) — always confirm with actual price action.",
        warning: "Order book data is not 100% reliable because traders can place and cancel orders (spoofing). Use it as one input alongside price action, not as your sole decision tool.",
      },
    ],
  },

  /* ── Chapter 5 ── */
  {
    id: "smart-money",
    number: 5,
    title: "Smart Money Concepts",
    subtitle: "How institutions trade and how to follow them",
    icon: Layers,
    color: "#F59E0B",
    sections: [
      {
        title: "What is Smart Money?",
        content:
          "Smart money refers to institutional traders — banks, hedge funds, and market makers who move large volumes and often drive price direction. They have more information, better technology, and deeper pockets than retail traders. The key insight: retail traders tend to lose because they trade against institutional flow. By tracking where institutions are positioning, you can align your trades with the side that has the edge.",
      },
      {
        title: "Order Blocks",
        content:
          "An order block is a price zone where institutions placed significant buy or sell orders. It appears as the last bearish candle before a strong bullish move (bullish OB) or the last bullish candle before a strong bearish move (bearish OB). When price returns to these zones, institutions often defend their positions, causing bounces. VISION detects and displays these automatically on the chart.",
        example: "order-block",
        tip: "The strongest order blocks are those that caused a Break of Structure (BoS). When price returns to one of these after a BoS, it's a high-probability entry.",
      },
      {
        title: "Fair Value Gaps (FVG)",
        content:
          "A Fair Value Gap is a three-candle pattern where the middle candle is so large that it creates an imbalance — the first and third candles don't overlap. This gap represents an area where price moved too fast for the market to fairly price, and price often returns to fill it. VISION marks FVGs on the chart. When price fills an FVG and then reverses, it's a high-quality entry signal.",
        example: "fvg",
      },
      {
        title: "Break of Structure (BoS) vs Change of Character (ChoCH)",
        content:
          "BoS (Break of Structure) occurs when price breaks a previous swing high (bullish BoS) or swing low (bearish BoS), confirming the existing trend. ChoCH (Change of Character) is a BoS in the OPPOSITE direction of the current trend — it signals a potential trend reversal. ChoCH is the first warning sign that the trend may be shifting. VISION's Zones Overlay widget tracks both.",
        example: "bos-choch",
        warning: "A single ChoCH doesn't guarantee a reversal. Wait for a retest of the broken structure level with confirmation (e.g., bullish candle at a bullish ChoCH level).",
      },
      {
        title: "Supply & Demand Zones",
        content:
          "Supply zones are price areas where selling pressure overwhelmed buyers, causing price to drop. Demand zones are where buying pressure overwhelmed sellers, causing price to rise. They differ from support/resistance because they represent areas of UNFILLED orders — when price returns, those orders may still be waiting. The Zones Overlay widget shows supply zones (red), demand zones (green), their strength, and how many times they've been tested.",
        example: "supply-demand",
      },
      {
        title: "Support, Resistance, Pivots & Fibonacci",
        content:
          "Support is a price level where buying interest prevents further decline. Resistance is where selling pressure prevents further advance. Pivot Points (P, R1-R3, S1-S3) are calculated from the previous period's high, low, and close — floor traders and algorithms use these as intraday reference levels. Fibonacci levels (23.6%, 38.2%, 50%, 61.8%, 78.6%) are retracement targets during pullbacks. The 61.8% level is the 'golden ratio' and the most watched.",
        tip: "When multiple levels converge at the same price (e.g., a pivot point, a Fibonacci level, and a supply zone), that's a high-confluence area and a strong trade setup.",
      },
    ],
  },

  /* ── Chapter 6 ── */
  {
    id: "heatmaps",
    number: 6,
    title: "Heatmaps & Liquidity",
    subtitle: "Where the orders are and where institutions will hunt",
    icon: Flame,
    color: "var(--color-bear)",
    sections: [
      {
        title: "TP/SL Heatmap",
        content:
          "The TP/SL Heatmap overlays the chart with estimated clusters of take-profit and stop-loss orders. Green zones show where traders likely have take-profit orders (long TP above price, short TP below). Orange/amber zones show stop-loss clusters. These are estimated using round-number psychology, ATR-based placement, and order book data. Toggle this with the 'TP/SL' button above the chart.",
      },
      {
        title: "Stop-Loss Heatmap",
        content:
          "The Stop Heatmap is a 2D thermal overlay (time x price) showing the density of estimated stop-loss orders. The color scale ranges from dark (low density) through purple and red to bright yellow (highest density). Bright zones represent areas where many traders have their stop losses — these are the exact levels institutions target for stop hunts. Toggle this with the 'Stops' button.",
        example: "heatmap-example",
        warning: "Institutions deliberately push price into stop-loss clusters to trigger cascading liquidations, then reverse direction. Place your stops BEYOND these clusters, not inside them.",
      },
      {
        title: "Liquidation Heatmap (Crypto)",
        content:
          "Available for crypto pairs with perpetual contracts, the Liquidation Heatmap shows predicted forced-liquidation levels. In crypto, traders use leverage — when price moves against them past their margin, positions are forcibly closed (liquidated). Cascading liquidations at a price level can cause extreme price movements. Blue-to-green colors show moderate liquidation density; yellow-to-red shows extreme danger zones.",
      },
      {
        title: "Liquidity Forecast",
        content:
          "The Liquidity Forecast widget predicts where future liquidity clusters will form based on historical patterns, swing point analysis, and ATR-based stop estimation. It shows predicted liquidity levels with confidence scores and identifies 'liquidity magnets' — price levels that attract price movement. Price is drawn toward these magnets because that's where resting orders create the most efficient fills.",
        tip: "Use liquidity magnets as potential take-profit targets. Price tends to reach these levels before reversing, making them ideal exit points.",
      },
      {
        title: "MBO Profile (Market by Order)",
        content:
          "The MBO Profile displays bid and ask volume segmented by estimated order size: Institutional (brightest, largest orders), Large, Medium, and Small (faded, retail). This appears as horizontal bars on the right edge of the chart. Green bars show bid volume (buyers); red bars show ask volume (sellers). Heavy institutional bars at a price level signal that major players are positioned there.",
      },
      {
        title: "How Institutions Hunt Stops",
        content:
          "Stop hunts are a common institutional strategy: 1) Institutions identify clusters of retail stop losses (visible in heatmaps). 2) They push price through these levels with aggressive orders. 3) This triggers a cascade of stop-loss executions, creating liquidity. 4) Institutions fill their real orders at these artificially created prices. 5) Price then reverses back. To protect yourself: place stops beyond obvious levels, use ATR-based stops instead of round numbers, and check the stop heatmap before choosing your SL level.",
        warning: "Never place your stop loss at an obvious round number (e.g., exactly $3,000 for gold). Place it slightly beyond — the heatmap shows you exactly where the danger zones are.",
      },
    ],
  },

  /* ── Chapter 7 ── */
  {
    id: "ai-ml",
    number: 7,
    title: "AI & Machine Learning",
    subtitle: "How VISION's algorithms predict market direction",
    icon: Brain,
    color: "var(--color-neon-purple)",
    sections: [
      {
        title: "ML Prediction",
        content:
          "VISION uses an XGBoost machine learning model trained on historical price data and technical features. It predicts whether price will go up (bullish), down (bearish), or stay neutral in the near term. The ML Prediction widget shows: Direction (the model's call), Confidence (how sure the model is), and Top Features (which indicators most influenced the prediction). The model automatically retrains weekly to adapt to changing market conditions.",
      },
      {
        title: "Market Regime Detection",
        content:
          "Not all markets behave the same way. VISION detects the current market regime: Trending (strong directional movement), Ranging (price oscillating between levels), Volatile (large erratic moves), or Mean-Reverting (price pulling back to average). Regime matters because strategies that work in trends fail in ranges and vice versa. The regime detector uses volatility clustering, trend strength, and price distribution analysis.",
        tip: "Match your strategy to the regime. In trending regimes, use breakout entries and trail your stops. In ranging regimes, buy at support and sell at resistance. In volatile regimes, widen your stops or sit out.",
      },
      {
        title: "Market Narrator",
        content:
          "The Market Narrator is VISION's AI brain — it synthesizes ALL available data (price, indicators, ML prediction, regime, composite score, volatility, zones, divergence, order flow, and multi-timeframe analysis) into a clear, actionable narrative. It tells you: what's happening, where price is going, what to do (BUY/SELL/WAIT), specific price levels for entry/target/stop, and the probability of the predicted move. Updated every 5 minutes.",
      },
      {
        title: "Composite Score",
        content:
          "The Composite Score is VISION's master signal — a weighted aggregate of all indicators on a 0-100 scale. Each indicator contributes based on its reliability and current market conditions. Scores above 65 indicate bullish bias; below 35 indicate bearish bias. The Trade Score widget breaks down exactly how each indicator is voting and with what weight, so you can see the full reasoning behind the score.",
      },
      {
        title: "Understanding Confidence Percentages",
        content:
          "Confidence reflects how many data sources agree on a direction. 90%+ means nearly everything aligns — very rare and very strong. 75-89% means strong consensus with minor disagreements. 60-74% means moderate agreement but some conflicting signals. Below 60% means significant disagreement — proceed with caution or wait. VISION only sends signal alerts at 75%+ confidence to ensure quality.",
        tip: "Higher confidence doesn't mean guaranteed profit — it means higher probability. Even 85% confidence means 15% of the time it will be wrong. Always use a stop loss.",
      },
    ],
  },

  /* ── Chapter 8 ── */
  {
    id: "institutional",
    number: 8,
    title: "Institutional Tracking",
    subtitle: "COT reports, divergence, whale tracking, and macro context",
    icon: Globe,
    color: "#06B6D4",
    sections: [
      {
        title: "COT Reports (Commitment of Traders)",
        content:
          "The CFTC publishes weekly data showing how different trader categories are positioned in futures markets. Managed Money (hedge funds) positions reveal institutional sentiment. Producers/Commercials hedge their real business exposure. When managed money is heavily long, it may signal crowded positioning. When they flip from short to long, it often signals the early stages of a new trend. VISION displays this for gold and BTC.",
        tip: "COT data has a 3-day lag (released Friday for Tuesday positions). Use it for weekly bias, not intraday signals. When retail is heavily on one side and institutions on the other, follow institutions.",
      },
      {
        title: "Retail vs Institutional Divergence",
        content:
          "The Divergence widget compares retail trader positioning (from MyFxBook — percentage long vs short) against institutional positioning (from COT data, order flow, and whale tracking). When retail is heavily long but institutional data shows selling, that's a bearish divergence — a contrarian sell signal. The divergence score ranges from -100 (extreme bearish divergence) to +100 (extreme bullish divergence). Scores beyond 60 in either direction are significant.",
        warning: "The majority of retail traders lose money. When 80%+ of retail is positioned in one direction, the contrarian trade (going against them) has historically been more profitable.",
      },
      {
        title: "Whale Tracker (Crypto)",
        content:
          "For Bitcoin and Ethereum, the Whale Tracker monitors large on-chain transfers — transactions moving significant amounts between wallets and exchanges. When whales move crypto TO exchanges, it often signals upcoming selling. When they move FROM exchanges to cold wallets, it signals accumulation (holding). Each transfer shows block height, transaction hash, value, and whether an exchange is involved.",
      },
      {
        title: "Currency Heatmap (Forex)",
        content:
          "The Currency Heatmap shows the relative strength of each major currency (USD, EUR, GBP, JPY, AUD, CAD, NZD, CHF) across multiple timeframes (1h, 4h, 1d). Strong currencies are green; weak ones are red. The ideal forex trade pairs the strongest currency against the weakest. It also shows cross-pair correlations — if EUR/USD and GBP/USD are both bullish, USD weakness is confirmed.",
        tip: "Don't trade a pair where both currencies are neutral/flat. Look for maximum divergence — the strongest vs the weakest gives the highest-probability trades.",
      },
      {
        title: "Correlations & Macro Dashboard (Gold)",
        content:
          "For gold, VISION tracks key macro correlations: Gold typically moves inversely to the US Dollar Index (DXY) — when the dollar weakens, gold rises. Gold is also inversely correlated with real yields (US 10-Year Treasury minus inflation). The Macro Dashboard shows current US 10Y yield, yield curve (2Y-10Y spread), Fed Funds Rate, CPI, and annual inflation. These macro drivers are essential for understanding gold's medium-term direction.",
      },
    ],
  },

  /* ── Chapter 9 ── */
  {
    id: "scalper",
    number: 9,
    title: "Scalper Mode — Signal System",
    subtitle: "How VISION generates, tracks, and improves signals",
    icon: Crosshair,
    color: "var(--color-neon-green)",
    sections: [
      {
        title: "How Signals Are Generated",
        content:
          "VISION's signal engine runs 14+ indicators simultaneously, calculates a weighted composite score, cross-references with ML prediction and regime detection, applies smart money adjustments (order flow, institutional positioning), and checks against active loss patterns. Only signals that pass ALL filters with 75%+ confidence are shown and sent to channels. The system scans automatically every 5 minutes across multiple timeframes.",
      },
      {
        title: "Understanding Confidence",
        content:
          "Confidence starts from the composite score percentage, then gets adjusted: ML agreement boosts it (+30% blend). Regime incompatibility penalizes heavily (-60%). Multi-timeframe confluence adds +15%. Order flow alignment adds +12%. Institutional positioning agreement adds +10%. Counter-trend signals get penalized (-15%). Signals matching known loss patterns get -50%. The final confidence must be 75% or higher to qualify.",
      },
      {
        title: "Entry, Stop Loss & Take Profit",
        content:
          "Entry price is the current market price when the signal triggers. Stop Loss (SL) is placed beyond recent swing structure — below the swing low for longs, above the swing high for shorts — with an ATR buffer to avoid noise. The engine also checks the stop heatmap to avoid placing your SL inside a stop-loss cluster. Take Profit (TP) targets use ATR multiples and, when available, order book walls as natural targets.",
        tip: "VISION's SL placement is smarter than simple ATR-based stops. It uses market structure AND avoids known stop-loss clusters. Trust the levels — they're engineered to survive institutional stop hunts.",
      },
      {
        title: "Risk:Reward Ratio",
        content:
          "Risk:Reward (R:R) compares potential loss (entry to SL) against potential gain (entry to TP). An R:R of 1:2 means you risk $1 to make $2. VISION enforces minimum R:R by asset: BTC requires 1.8:1 (higher volatility needs more reward), crypto 1.5:1, and forex 1.3:1. A trader can be profitable with just 40% win rate if their average R:R is above 1.5:1. Focus on R:R, not just win rate.",
        example: "risk-reward",
        warning: "Never enter a trade with R:R below 1:1. Even 'sure things' can fail. A good R:R ensures that your winners compensate for your losers over time.",
      },
      {
        title: "Multi-Timeframe Confluence",
        content:
          "When the signal engine scans multiple timeframes (5m, 15m, 30m) and two or more agree on direction, the signal gets a MTF (Multi-Timeframe) badge and a +15% confidence boost. MTF confluence means the short-term setup aligns with the bigger-picture trend — these are the highest-quality signals. When you see the green MTF badge, it means multiple timeframes are confirming the trade.",
      },
      {
        title: "Signal Lifecycle",
        content:
          "Every signal goes through a lifecycle: PENDING means the signal was generated but the entry price hasn't been hit yet. ACTIVE means entry was triggered and the trade is live — the system monitors it against SL and TP levels. WIN means price reached the take-profit level. LOSS means price hit the stop-loss. EXPIRED means the signal was never triggered within its validity window (typically 12 candles). Each completed signal records its PnL for your journal.",
      },
      {
        title: "Journal & Performance",
        content:
          "The Journal tab shows all completed signals with their outcomes — win, loss, or expired. The summary displays: total win rate, total P&L, profit factor (ratio of gross wins to gross losses), and performance breakdown by timeframe and direction (long vs short). Use this data to understand which timeframes and directions work best for each asset. The equity curve shows your cumulative performance over time.",
      },
      {
        title: "Loss Learning (Adaptive Filters)",
        content:
          "VISION's unique loss learning system analyzes WHY signals fail and builds adaptive filters to avoid repeating mistakes. It categorizes losses into 7 types: False Breakout, Regime Mismatch, Low Confluence, Overextended (RSI extreme), Weak Volume, Against Trend, and News Event. When a loss pattern appears 3+ times, the engine activates a filter that reduces confidence for similar setups, effectively 'learning' from past mistakes.",
        tip: "Check the Learning tab regularly. The 'With Filters' win rate shows what your performance WOULD be if the loss filters had been active — this validates that the system is improving.",
      },
      {
        title: "Telegram & Discord Channels",
        content:
          "VISION broadcasts high-confidence signals (75%+) to dedicated channels: Telegram Gold, Telegram Crypto, and Telegram Forex. Each signal includes direction, entry, SL, TP, R:R, confidence, and regime context. Outcome notifications are sent when signals resolve (win/loss with P&L). Daily performance summaries are also broadcast. Join the channels from the header dropdown for real-time alerts.",
      },
    ],
  },

  /* ── Chapter 10 ── */
  {
    id: "workflow",
    number: 10,
    title: "Putting It All Together",
    subtitle: "Your pre-trade checklist and analysis workflow",
    icon: CheckCircle2,
    color: "var(--color-neon-amber)",
    sections: [
      {
        title: "Pre-Trade Checklist",
        content:
          "Before every trade, follow this checklist: 1) CHECK THE REGIME — is the market trending, ranging, or volatile? Match your strategy. 2) CHECK THE NARRATOR — what's the AI's overall assessment and direction? 3) CHECK COMPOSITE SCORE — is there strong directional bias (above 65 or below 35)? 4) CHECK MTF CONFLUENCE — do multiple timeframes agree? 5) CHECK SMART MONEY — are institutions aligned with your trade? 6) CHECK THE CALENDAR — any high-impact news events coming? 7) CHECK HEATMAPS — is your SL placed beyond stop clusters? Only enter when most boxes check green.",
      },
      {
        title: "Reading the Composite Score",
        content:
          "The Composite Score is your starting point. Open the Trade Score widget to see the full breakdown: each indicator's name, its signal (bullish/bearish/neutral), its weight in the composite, and the final direction. A score of 72 with 9 bullish indicators out of 12 is very different from 72 with 6 strongly bullish and 6 weakly bearish — the breakdown matters more than the number. Look for agreement across different categories (trend + momentum + volume).",
      },
      {
        title: "When to Trade vs When to Wait",
        content:
          "Trade when: confidence is 75%+, the regime supports your strategy, multiple timeframes agree, and no major news is imminent. WAIT when: signals are NEUTRAL, the Narrator says 'conflicting signals', the regime is 'volatile' or 'mean-reverting' against your bias, RSI is at extremes in the opposite direction, or a high-impact event (FOMC, NFP, CPI) is within 2 hours. Patience is a superpower — the best traders wait for high-probability setups.",
        tip: "The most common beginner mistake is overtrading. If VISION says WAIT or NEUTRAL, respect it. A day with no trades is better than a day with losing trades.",
      },
      {
        title: "Risk Management Principles",
        content:
          "Rule 1: Never risk more than 1-2% of your account on a single trade. Rule 2: Always use a stop loss — no exceptions. Rule 3: Focus on R:R ratio, not win rate. A 40% win rate with 2:1 R:R is profitable. Rule 4: Don't move your stop loss to 'give the trade more room' — that's emotional trading. Rule 5: Take partial profits at TP1 and move SL to break-even. Rule 6: Don't revenge trade after a loss. Rule 7: Respect your daily loss limit — stop trading after 2-3 consecutive losses.",
        warning: "Risk management is more important than technical analysis. You can have mediocre signals and still be profitable with good risk management. You cannot have perfect signals and survive with bad risk management.",
      },
      {
        title: "Economic Calendar Awareness",
        content:
          "The Economic Calendar widget shows upcoming data releases with impact ratings (HIGH, MEDIUM, LOW). High-impact events like FOMC decisions, Non-Farm Payrolls (NFP), CPI releases, and central bank rate decisions can cause extreme volatility. Close or reduce positions before major events. The countdown timer helps you plan — if a HIGH event is 30 minutes away, it's not the time to open a new trade.",
      },
      {
        title: "Building Your VISION Workflow",
        content:
          "Here's a suggested daily workflow: MORNING — Check the Narrator for overall market context. Review the macro dashboard for gold/forex. Check the economic calendar for the day's events. DURING SESSION — Use Scalper Mode's Scan All to find setups. Verify signals against heatmaps and zones. Check order flow for confirmation. ENTER only 75%+ confidence trades with proper SL/TP. AFTER SESSION — Review the Journal tab. Check the Learning tab for pattern insights. The system improves over time as it learns from your signals.",
        tip: "Treat trading like a business. The Journal and Learning tabs are your performance review tools. Successful traders constantly refine their approach based on data, not feelings.",
      },
    ],
  },
];

/* ═══════════════════════════════════════════════════════
   VISUAL EXAMPLE DIAGRAMS (SVG)
   ═══════════════════════════════════════════════════════ */

const D = {
  bull: "#10b981", bear: "#ef4444", cyan: "#06b6d4", purple: "#8b5cf6",
  blue: "#3b82f6", amber: "#f59e0b", green: "#10b981", orange: "#f97316",
  text: "#e2e8f0", textSec: "#94a3b8", muted: "#64748b",
  bg: "#111827", bgCard: "#151c2c", border: "#1e293b",
  grid: "rgba(59,130,246,0.06)",
} as const;
const FONT = "'JetBrains Mono', monospace";

/* ── 1. Candlestick Anatomy ── */
function CandlestickDiagram() {
  return (
    <svg viewBox="0 0 420 190" width="100%" role="img" aria-label="Candlestick anatomy diagram showing OHLC parts, bullish vs bearish">
      <rect width="420" height="190" fill={D.bg} rx="6" />
      {/* grid */}
      {[40,70,100,130,160].map(y=><line key={y} x1="0" y1={y} x2="420" y2={y} stroke={D.grid} />)}
      {/* Large annotated candle */}
      <line x1="90" y1="25" x2="90" y2="60" stroke={D.bull} strokeWidth="2" />
      <rect x="75" y="60" width="30" height="55" fill={D.bull} rx="2" />
      <line x1="90" y1="115" x2="90" y2="160" stroke={D.bull} strokeWidth="2" />
      {/* labels */}
      <line x1="110" y1="25" x2="135" y2="25" stroke={D.muted} strokeDasharray="3" />
      <text x="138" y="29" fill={D.text} fontSize="10" fontFamily={FONT}>High</text>
      <line x1="110" y1="60" x2="135" y2="60" stroke={D.muted} strokeDasharray="3" />
      <text x="138" y="64" fill={D.bull} fontSize="10" fontFamily={FONT}>Open</text>
      <line x1="110" y1="115" x2="135" y2="115" stroke={D.muted} strokeDasharray="3" />
      <text x="138" y="119" fill={D.bull} fontSize="10" fontFamily={FONT}>Close</text>
      <line x1="110" y1="160" x2="135" y2="160" stroke={D.muted} strokeDasharray="3" />
      <text x="138" y="164" fill={D.text} fontSize="10" fontFamily={FONT}>Low</text>
      {/* body/wick labels */}
      <text x="25" y="92" fill={D.textSec} fontSize="9" fontFamily={FONT}>Body</text>
      <line x1="50" y1="90" x2="73" y2="90" stroke={D.textSec} strokeDasharray="2" />
      <text x="20" y="38" fill={D.textSec} fontSize="9" fontFamily={FONT}>Wick</text>
      <line x1="50" y1="36" x2="88" y2="36" stroke={D.textSec} strokeDasharray="2" />
      {/* divider */}
      <line x1="210" y1="15" x2="210" y2="175" stroke={D.border} strokeDasharray="4" />
      {/* Bullish candle */}
      <text x="260" y="22" fill={D.bull} fontSize="10" fontFamily={FONT} textAnchor="middle">BULLISH</text>
      <line x1="260" y1="35" x2="260" y2="55" stroke={D.bull} strokeWidth="2" />
      <rect x="247" y="55" width="26" height="45" fill={D.bull} rx="2" />
      <line x1="260" y1="100" x2="260" y2="125" stroke={D.bull} strokeWidth="2" />
      <text x="260" y="140" fill={D.textSec} fontSize="9" fontFamily={FONT} textAnchor="middle">Close &gt; Open</text>
      <text x="260" y="152" fill={D.textSec} fontSize="9" fontFamily={FONT} textAnchor="middle">Price went UP</text>
      {/* Bearish candle */}
      <text x="360" y="22" fill={D.bear} fontSize="10" fontFamily={FONT} textAnchor="middle">BEARISH</text>
      <line x1="360" y1="35" x2="360" y2="55" stroke={D.bear} strokeWidth="2" />
      <rect x="347" y="55" width="26" height="45" fill={D.bear} rx="2" />
      <line x1="360" y1="100" x2="360" y2="125" stroke={D.bear} strokeWidth="2" />
      <text x="360" y="140" fill={D.textSec} fontSize="9" fontFamily={FONT} textAnchor="middle">Close &lt; Open</text>
      <text x="360" y="152" fill={D.textSec} fontSize="9" fontFamily={FONT} textAnchor="middle">Price went DOWN</text>
      <text x="210" y="185" fill={D.muted} fontSize="8" fontFamily={FONT} textAnchor="middle">Candlestick Anatomy — OHLC (Open, High, Low, Close)</text>
    </svg>
  );
}

/* ── 2. Trading Sessions ── */
function SessionBands() {
  const w = 400, pad = 30;
  const hourToX = (h: number) => pad + (h / 24) * (w - pad * 2);
  return (
    <svg viewBox={`0 0 ${w} 110`} width="100%" role="img" aria-label="Trading sessions timeline: Tokyo, London, New York">
      <rect width={w} height="110" fill={D.bg} rx="6" />
      {/* time axis */}
      <line x1={pad} y1="85" x2={w - pad} y2="85" stroke={D.border} />
      {[0,3,6,9,12,15,18,21,24].map(h => (
        <g key={h}><line x1={hourToX(h)} y1="82" x2={hourToX(h)} y2="88" stroke={D.muted} />
        <text x={hourToX(h)} y="98" fill={D.muted} fontSize="8" fontFamily={FONT} textAnchor="middle">{h}:00</text></g>
      ))}
      {/* sessions */}
      <rect x={hourToX(0)} y="20" width={hourToX(9)-hourToX(0)} height="16" rx="3" fill={D.purple} opacity="0.25" />
      <text x={(hourToX(0)+hourToX(9))/2} y="15" fill={D.purple} fontSize="9" fontFamily={FONT} textAnchor="middle">TOKYO</text>
      <rect x={hourToX(7)} y="38" width={hourToX(16)-hourToX(7)} height="16" rx="3" fill={D.blue} opacity="0.25" />
      <text x={(hourToX(7)+hourToX(16))/2} y="33" fill={D.blue} fontSize="9" fontFamily={FONT} textAnchor="middle">LONDON</text>
      <rect x={hourToX(13)} y="56" width={hourToX(22)-hourToX(13)} height="16" rx="3" fill={D.green} opacity="0.25" />
      <text x={(hourToX(13)+hourToX(22))/2} y="51" fill={D.green} fontSize="9" fontFamily={FONT} textAnchor="middle">NEW YORK</text>
      {/* overlap highlight */}
      <rect x={hourToX(13)} y="18" width={hourToX(16)-hourToX(13)} height="58" rx="2" fill={D.amber} opacity="0.12" stroke={D.amber} strokeWidth="1" strokeDasharray="3" />
      <text x={(hourToX(13)+hourToX(16))/2} y="105" fill={D.amber} fontSize="8" fontFamily={FONT} textAnchor="middle">OVERLAP</text>
    </svg>
  );
}

/* ── 3. Moving Average Cross ── */
function MovingAverageCross() {
  return (
    <svg viewBox="0 0 420 165" width="100%" role="img" aria-label="Golden Cross (buy) vs Death Cross (sell) diagram">
      <rect width="420" height="165" fill={D.bg} rx="6" />
      {/* left: golden cross */}
      <text x="105" y="18" fill={D.bull} fontSize="10" fontFamily={FONT} textAnchor="middle">GOLDEN CROSS</text>
      <polyline points="20,110 50,105 80,95 110,80 140,60 170,45" fill="none" stroke={D.bull} strokeWidth="2" />
      <polyline points="20,100 50,100 80,98 110,92 140,82 170,70" fill="none" stroke={D.muted} strokeWidth="1.5" strokeDasharray="4" />
      <circle cx="105" cy="86" r="5" fill={D.bull} opacity="0.8" />
      <text x="105" y="130" fill={D.bull} fontSize="9" fontFamily={FONT} textAnchor="middle">Short MA crosses ABOVE</text>
      <text x="105" y="142" fill={D.bull} fontSize="10" fontFamily={FONT} textAnchor="middle" fontWeight="bold">BUY SIGNAL</text>
      {/* divider */}
      <line x1="210" y1="10" x2="210" y2="155" stroke={D.border} strokeDasharray="4" />
      {/* right: death cross */}
      <text x="315" y="18" fill={D.bear} fontSize="10" fontFamily={FONT} textAnchor="middle">DEATH CROSS</text>
      <polyline points="230,45 260,55 290,70 320,85 350,100 380,115" fill="none" stroke={D.bear} strokeWidth="2" />
      <polyline points="230,60 260,62 290,68 320,78 350,90 380,100" fill="none" stroke={D.muted} strokeWidth="1.5" strokeDasharray="4" />
      <circle cx="310" cy="82" r="5" fill={D.bear} opacity="0.8" />
      <text x="315" y="130" fill={D.bear} fontSize="9" fontFamily={FONT} textAnchor="middle">Short MA crosses BELOW</text>
      <text x="315" y="142" fill={D.bear} fontSize="10" fontFamily={FONT} textAnchor="middle" fontWeight="bold">SELL SIGNAL</text>
      {/* legend */}
      <line x1="140" y1="158" x2="155" y2="158" stroke={D.cyan} strokeWidth="2" />
      <text x="160" y="161" fill={D.textSec} fontSize="8" fontFamily={FONT}>Short MA (8)</text>
      <line x1="230" y1="158" x2="245" y2="158" stroke={D.muted} strokeWidth="1.5" strokeDasharray="4" />
      <text x="250" y="161" fill={D.textSec} fontSize="8" fontFamily={FONT}>Long MA (50)</text>
    </svg>
  );
}

/* ── 4. RSI Zones ── */
function RSIZones() {
  const pts = "20,75 50,65 80,50 110,35 130,28 150,32 180,55 210,80 240,95 260,105 280,110 310,95 340,75 370,65";
  return (
    <svg viewBox="0 0 400 155" width="100%" role="img" aria-label="RSI indicator with overbought and oversold zones">
      <rect width="400" height="155" fill={D.bg} rx="6" />
      {/* zones */}
      <rect x="20" y="10" width="360" height="25" fill={D.bear} opacity="0.08" />
      <rect x="20" y="100" width="360" height="30" fill={D.bull} opacity="0.08" />
      {/* grid lines */}
      <line x1="20" y1="10" x2="380" y2="10" stroke={D.bear} strokeDasharray="3" opacity="0.4" />
      <line x1="20" y1="35" x2="380" y2="35" stroke={D.bear} strokeDasharray="3" opacity="0.4" />
      <line x1="20" y1="62" x2="380" y2="62" stroke={D.muted} strokeDasharray="2" opacity="0.3" />
      <line x1="20" y1="100" x2="380" y2="100" stroke={D.bull} strokeDasharray="3" opacity="0.4" />
      <line x1="20" y1="130" x2="380" y2="130" stroke={D.bull} strokeDasharray="3" opacity="0.3" />
      {/* labels */}
      <text x="5" y="14" fill={D.muted} fontSize="8" fontFamily={FONT}>100</text>
      <text x="10" y="38" fill={D.bear} fontSize="8" fontFamily={FONT}>70</text>
      <text x="10" y="66" fill={D.muted} fontSize="8" fontFamily={FONT}>50</text>
      <text x="10" y="103" fill={D.bull} fontSize="8" fontFamily={FONT}>30</text>
      <text x="13" y="133" fill={D.muted} fontSize="8" fontFamily={FONT}>0</text>
      {/* zone labels */}
      <text x="385" y="26" fill={D.bear} fontSize="8" fontFamily={FONT} opacity="0.7">OB</text>
      <text x="385" y="118" fill={D.bull} fontSize="8" fontFamily={FONT} opacity="0.7">OS</text>
      {/* RSI line */}
      <polyline points={pts} fill="none" stroke={D.purple} strokeWidth="2.5" strokeLinejoin="round" />
      {/* peak dot */}
      <circle cx="130" cy="28" r="4" fill={D.bear} />
      <text x="130" y="22" fill={D.bear} fontSize="8" fontFamily={FONT} textAnchor="middle">Sell signal</text>
      {/* trough dot */}
      <circle cx="280" cy="110" r="4" fill={D.bull} />
      <text x="280" y="125" fill={D.bull} fontSize="8" fontFamily={FONT} textAnchor="middle">Buy signal</text>
      <text x="200" y="150" fill={D.muted} fontSize="8" fontFamily={FONT} textAnchor="middle">RSI (14) — Overbought above 70, Oversold below 30</text>
    </svg>
  );
}

/* ── 5. MACD Example ── */
function MACDExample() {
  const bars = [-3,-5,-8,-6,-3,-1,2,5,8,10,8,5,3,1,-1,-3,-5,-4,-2,0];
  const maxBar = 10;
  const barW = 14, gap = 4, startX = 30;
  return (
    <svg viewBox="0 0 400 150" width="100%" role="img" aria-label="MACD indicator with histogram, signal line, and crossover">
      <rect width="400" height="150" fill={D.bg} rx="6" />
      {/* zero line */}
      <line x1="25" y1="72" x2="390" y2="72" stroke={D.muted} strokeDasharray="3" opacity="0.4" />
      <text x="10" y="76" fill={D.muted} fontSize="8" fontFamily={FONT}>0</text>
      {/* histogram */}
      {bars.map((v, i) => {
        const x = startX + i * (barW + gap);
        const h = Math.abs(v) / maxBar * 40;
        const y = v >= 0 ? 72 - h : 72;
        return <rect key={i} x={x} y={y} width={barW} height={h} fill={v >= 0 ? D.bull : D.bear} opacity="0.5" rx="1" />;
      })}
      {/* MACD line */}
      <polyline points="37,95 55,100 73,108 91,102 109,90 127,78 145,65 163,52 181,40 199,35 217,40 235,50 253,60 271,68 289,78 307,85 325,92 343,88 361,80 379,72" fill="none" stroke={D.cyan} strokeWidth="2" />
      {/* Signal line (lagging) */}
      <polyline points="37,90 55,95 73,102 91,105 109,98 127,85 145,72 163,60 181,48 199,42 217,42 235,48 253,56 271,65 289,75 307,82 325,88 343,90 361,85 379,78" fill="none" stroke={D.orange} strokeWidth="1.5" strokeDasharray="4" />
      {/* crossover */}
      <circle cx="127" cy="78" r="5" fill="none" stroke={D.bull} strokeWidth="2" />
      <text x="127" y="25" fill={D.bull} fontSize="9" fontFamily={FONT} textAnchor="middle" fontWeight="bold">BUY SIGNAL</text>
      <line x1="127" y1="28" x2="127" y2="72" stroke={D.bull} strokeDasharray="2" opacity="0.4" />
      {/* legend */}
      <line x1="80" y1="142" x2="95" y2="142" stroke={D.cyan} strokeWidth="2" />
      <text x="100" y="145" fill={D.textSec} fontSize="8" fontFamily={FONT}>MACD</text>
      <line x1="155" y1="142" x2="170" y2="142" stroke={D.orange} strokeWidth="1.5" strokeDasharray="4" />
      <text x="175" y="145" fill={D.textSec} fontSize="8" fontFamily={FONT}>Signal</text>
      <rect x="235" y="138" width="10" height="8" fill={D.bull} opacity="0.5" rx="1" />
      <text x="250" y="145" fill={D.textSec} fontSize="8" fontFamily={FONT}>Histogram</text>
    </svg>
  );
}

/* ── 6. Bollinger Bands ── */
function BollingerBandsDiagram() {
  const mid = "20,80 60,78 100,75 140,74 180,73 220,72 260,68 300,55 340,45 380,50";
  const upper = "20,55 60,55 100,58 140,62 180,64 220,60 260,42 300,20 340,12 380,18";
  const lower = "20,105 60,102 100,92 140,86 180,82 220,84 260,94 300,90 340,78 380,82";
  return (
    <svg viewBox="0 0 400 155" width="100%" role="img" aria-label="Bollinger Bands showing squeeze and expansion">
      <rect width="400" height="155" fill={D.bg} rx="6" />
      {/* band fill */}
      <polygon points={`${upper},380,82 ${lower.split(" ").reverse().join(" ")}`} fill={D.blue} opacity="0.06" />
      {/* bands */}
      <polyline points={upper} fill="none" stroke={D.muted} strokeWidth="1" strokeDasharray="4" />
      <polyline points={mid} fill="none" stroke={D.blue} strokeWidth="1.5" />
      <polyline points={lower} fill="none" stroke={D.muted} strokeWidth="1" strokeDasharray="4" />
      {/* price line */}
      <polyline points="20,82 60,76 100,70 140,72 180,74 220,65 260,55 300,30 340,38 380,52" fill="none" stroke={D.text} strokeWidth="2" />
      {/* squeeze annotation */}
      <rect x="130" y="60" width="60" height="26" fill={D.amber} opacity="0.1" rx="3" stroke={D.amber} strokeDasharray="3" strokeWidth="1" />
      <text x="160" y="105" fill={D.amber} fontSize="9" fontFamily={FONT} textAnchor="middle" fontWeight="bold">SQUEEZE</text>
      <text x="160" y="115" fill={D.textSec} fontSize="8" fontFamily={FONT} textAnchor="middle">Low volatility</text>
      {/* expansion annotation */}
      <text x="320" y="108" fill={D.cyan} fontSize="9" fontFamily={FONT} textAnchor="middle" fontWeight="bold">EXPANSION</text>
      <text x="320" y="118" fill={D.textSec} fontSize="8" fontFamily={FONT} textAnchor="middle">High volatility</text>
      {/* legend */}
      <line x1="80" y1="148" x2="95" y2="148" stroke={D.blue} strokeWidth="1.5" />
      <text x="100" y="151" fill={D.textSec} fontSize="8" fontFamily={FONT}>SMA (20)</text>
      <line x1="180" y1="148" x2="195" y2="148" stroke={D.muted} strokeWidth="1" strokeDasharray="4" />
      <text x="200" y="151" fill={D.textSec} fontSize="8" fontFamily={FONT}>Upper/Lower (2 SD)</text>
    </svg>
  );
}

/* ── 7. Volume Spike ── */
function VolumeSpike() {
  const vols = [25,30,22,28,35,20,25,90,30,22,18,28,25,20];
  const colors = [D.bull,D.bear,D.bear,D.bull,D.bull,D.bear,D.bull,D.bull,D.bear,D.bull,D.bear,D.bull,D.bear,D.bull];
  const avg = 26;
  return (
    <svg viewBox="0 0 400 125" width="100%" role="img" aria-label="Volume spike chart showing institutional activity">
      <rect width="400" height="125" fill={D.bg} rx="6" />
      {vols.map((v, i) => {
        const x = 30 + i * 25;
        const h = v;
        const isSpike = v > avg * 2.5;
        return (
          <g key={i}>
            <rect x={x} y={110 - h} width="18" height={h} fill={colors[i]} opacity={isSpike ? 0.9 : 0.35} rx="1" />
            {isSpike && <>
              <rect x={x - 2} y={110 - h - 2} width="22" height={h + 2} fill="none" stroke={D.cyan} strokeWidth="1.5" strokeDasharray="3" rx="2" />
              <text x={x + 9} y="12" fill={D.cyan} fontSize="9" fontFamily={FONT} textAnchor="middle" fontWeight="bold">VOLUME SPIKE</text>
              <text x={x + 9} y="23" fill={D.textSec} fontSize="8" fontFamily={FONT} textAnchor="middle">3.5x average</text>
              <line x1={x + 9} y1="25" x2={x + 9} y2={110 - h - 4} stroke={D.cyan} strokeDasharray="2" opacity="0.5" />
            </>}
          </g>
        );
      })}
      {/* average line */}
      <line x1="25" y1={110 - avg} x2="385" y2={110 - avg} stroke={D.amber} strokeDasharray="4" opacity="0.6" />
      <text x="388" y={113 - avg} fill={D.amber} fontSize="8" fontFamily={FONT}>AVG</text>
      <text x="200" y="122" fill={D.muted} fontSize="8" fontFamily={FONT} textAnchor="middle">2-3x average volume = institutional participation</text>
    </svg>
  );
}

/* ── 8. Volume Profile ── */
function VolumeProfileDiagram() {
  const levels = [
    { price: "2,680", w: 40 }, { price: "2,675", w: 55 }, { price: "2,670", w: 80 },
    { price: "2,665", w: 120 }, { price: "2,660", w: 170 }, { price: "2,655", w: 140 },
    { price: "2,650", w: 90 }, { price: "2,645", w: 60 }, { price: "2,640", w: 35 },
  ];
  const pocIdx = 4;
  const vahIdx = 2;
  const valIdx = 6;
  return (
    <svg viewBox="0 0 400 165" width="100%" role="img" aria-label="Volume Profile with POC, VAH, VAL levels">
      <rect width="400" height="165" fill={D.bg} rx="6" />
      {/* value area shading */}
      <rect x="60" y={22 + vahIdx * 16} width="250" height={(valIdx - vahIdx + 1) * 16} fill={D.blue} opacity="0.06" />
      {/* bars */}
      {levels.map((l, i) => {
        const y = 22 + i * 16;
        const isPOC = i === pocIdx;
        return (
          <g key={i}>
            <text x="5" y={y + 11} fill={D.textSec} fontSize="8" fontFamily={FONT}>{l.price}</text>
            <rect x="60" y={y + 2} width={l.w} height="12" fill={isPOC ? D.cyan : D.blue} opacity={isPOC ? 0.8 : 0.4} rx="1" />
          </g>
        );
      })}
      {/* POC line */}
      <line x1="60" y1={22 + pocIdx * 16 + 8} x2="380" y2={22 + pocIdx * 16 + 8} stroke={D.cyan} strokeDasharray="4" />
      <text x="250" y={22 + pocIdx * 16 + 6} fill={D.cyan} fontSize="9" fontFamily={FONT} fontWeight="bold">POC (Point of Control)</text>
      {/* VAH */}
      <line x1="60" y1={22 + vahIdx * 16} x2="380" y2={22 + vahIdx * 16} stroke={D.bull} strokeDasharray="3" opacity="0.6" />
      <text x="250" y={22 + vahIdx * 16 - 3} fill={D.bull} fontSize="8" fontFamily={FONT}>VAH (Value Area High)</text>
      {/* VAL */}
      <line x1="60" y1={22 + (valIdx + 1) * 16} x2="380" y2={22 + (valIdx + 1) * 16} stroke={D.bear} strokeDasharray="3" opacity="0.6" />
      <text x="250" y={22 + (valIdx + 1) * 16 + 12} fill={D.bear} fontSize="8" fontFamily={FONT}>VAL (Value Area Low)</text>
      {/* 70% label */}
      <text x="340" y={22 + (vahIdx + 2) * 16 + 8} fill={D.textSec} fontSize="8" fontFamily={FONT}>70% vol</text>
      <text x="200" y="160" fill={D.muted} fontSize="8" fontFamily={FONT} textAnchor="middle">Horizontal histogram — volume traded at each price level</text>
    </svg>
  );
}

/* ── 9. Order Block ── */
function OrderBlockDiagram() {
  /* simplified candlestick rendering */
  const candles: [number, number, number, number, boolean][] = [
    /* [x, top, bodyH, wickH, isBull] */
    [30, 95, 15, 25, false], [60, 90, 18, 22, false], [90, 100, 20, 28, false], // down trend
    [120, 70, 35, 45, true], [150, 50, 30, 40, true], [180, 35, 25, 35, true], // impulse up
    [220, 50, 20, 28, false], [250, 65, 18, 24, false], // pullback to OB
    [280, 55, 25, 35, true], [310, 40, 20, 30, true], // bounce
  ];
  return (
    <svg viewBox="0 0 380 170" width="100%" role="img" aria-label="Order Block diagram showing institutional zone and retest entry">
      <rect width="380" height="170" fill={D.bg} rx="6" />
      {/* OB zone */}
      <rect x="75" y="92" width="260" height="28" fill={D.amber} opacity="0.12" stroke={D.amber} strokeDasharray="3" strokeWidth="1" rx="2" />
      <text x="345" y="110" fill={D.amber} fontSize="8" fontFamily={FONT}>OB ZONE</text>
      {/* candles */}
      {candles.map(([x, top, bH, wH, bull], i) => (
        <g key={i}>
          <line x1={x + 10} y1={top - (wH - bH) / 2} x2={x + 10} y2={top + bH + (wH - bH) / 2} stroke={bull ? D.bull : D.bear} strokeWidth="1.5" />
          <rect x={x} y={top} width="20" height={bH} fill={bull ? D.bull : D.bear} rx="1" />
        </g>
      ))}
      {/* annotations */}
      <text x="90" y="140" fill={D.amber} fontSize="9" fontFamily={FONT} fontWeight="bold">ORDER BLOCK</text>
      <text x="90" y="150" fill={D.textSec} fontSize="8" fontFamily={FONT}>Last bearish before impulse</text>
      {/* retest arrow */}
      <text x="235" y="145" fill={D.cyan} fontSize="9" fontFamily={FONT} textAnchor="middle">RETEST</text>
      <line x1="235" y1="140" x2="235" y2="122" stroke={D.cyan} strokeDasharray="2" opacity="0.5" />
      {/* entry label */}
      <text x="295" y="32" fill={D.bull} fontSize="9" fontFamily={FONT} textAnchor="middle" fontWeight="bold">ENTRY</text>
      <text x="295" y="165" fill={D.muted} fontSize="8" fontFamily={FONT} textAnchor="middle">Price returns to OB zone → institutions defend → bounce</text>
    </svg>
  );
}

/* ── 10. Fair Value Gap ── */
function FVGDiagram() {
  return (
    <svg viewBox="0 0 400 170" width="100%" role="img" aria-label="Fair Value Gap — 3-candle imbalance pattern">
      <rect width="400" height="170" fill={D.bg} rx="6" />
      {/* Candle 1 */}
      <line x1="60" y1="80" x2="60" y2="130" stroke={D.bull} strokeWidth="1.5" />
      <rect x="50" y="90" width="20" height="30" fill={D.bull} rx="1" />
      <text x="60" y="145" fill={D.textSec} fontSize="8" fontFamily={FONT} textAnchor="middle">C1</text>
      {/* Candle 2 (large impulse) */}
      <line x1="110" y1="25" x2="110" y2="120" stroke={D.bull} strokeWidth="1.5" />
      <rect x="100" y="35" width="20" height="75" fill={D.bull} rx="1" />
      <text x="110" y="145" fill={D.textSec} fontSize="8" fontFamily={FONT} textAnchor="middle">C2</text>
      {/* Candle 3 */}
      <line x1="160" y1="20" x2="160" y2="75" stroke={D.bull} strokeWidth="1.5" />
      <rect x="150" y="30" width="20" height="35" fill={D.bull} rx="1" />
      <text x="160" y="145" fill={D.textSec} fontSize="8" fontFamily={FONT} textAnchor="middle">C3</text>
      {/* FVG zone: C1 high to C3 low */}
      <rect x="45" y="65" width="140" height="25" fill={D.cyan} opacity="0.15" stroke={D.cyan} strokeDasharray="3" strokeWidth="1" rx="2" />
      {/* labels for gap */}
      <line x1="185" y1="65" x2="220" y2="65" stroke={D.cyan} strokeDasharray="2" />
      <text x="225" y="63" fill={D.cyan} fontSize="8" fontFamily={FONT}>C3 Low</text>
      <line x1="185" y1="90" x2="220" y2="90" stroke={D.cyan} strokeDasharray="2" />
      <text x="225" y="88" fill={D.cyan} fontSize="8" fontFamily={FONT}>C1 High</text>
      <text x="225" y="78" fill={D.cyan} fontSize="9" fontFamily={FONT} fontWeight="bold">FVG</text>
      {/* divider */}
      <line x1="280" y1="15" x2="280" y2="155" stroke={D.border} strokeDasharray="4" />
      {/* fill scenario */}
      <text x="340" y="18" fill={D.textSec} fontSize="9" fontFamily={FONT} textAnchor="middle">PRICE FILLS GAP</text>
      {/* price line returning */}
      <polyline points="290,35 310,40 325,50 340,65 345,78 340,70 335,55 330,45" fill="none" stroke={D.text} strokeWidth="2" />
      <rect x="295" y="65" width="80" height="25" fill={D.cyan} opacity="0.1" stroke={D.cyan} strokeDasharray="3" strokeWidth="1" rx="2" />
      <circle cx="340" cy="78" r="4" fill={D.bull} />
      <text x="340" y="108" fill={D.bull} fontSize="9" fontFamily={FONT} textAnchor="middle" fontWeight="bold">REVERSAL</text>
      <text x="200" y="165" fill={D.muted} fontSize="8" fontFamily={FONT} textAnchor="middle">Gap between C1 high and C3 low — price returns to fill it</text>
    </svg>
  );
}

/* ── 11. BoS vs ChoCH ── */
function BoSChoCHDiagram() {
  return (
    <svg viewBox="0 0 420 170" width="100%" role="img" aria-label="Break of Structure (continuation) vs Change of Character (reversal)">
      <rect width="420" height="170" fill={D.bg} rx="6" />
      {/* BoS — left */}
      <text x="105" y="16" fill={D.bull} fontSize="10" fontFamily={FONT} textAnchor="middle" fontWeight="bold">BoS (Continuation)</text>
      {/* uptrend zigzag */}
      <polyline points="20,130 50,100 70,115 100,80 120,95 150,55 170,70" fill="none" stroke={D.text} strokeWidth="2" />
      {/* swing high level */}
      <line x1="85" y1="80" x2="175" y2="80" stroke={D.bull} strokeDasharray="3" />
      <text x="178" y="83" fill={D.bull} fontSize="8" fontFamily={FONT}>Swing High</text>
      {/* break circle */}
      <circle cx="150" cy="55" r="5" fill={D.bull} />
      <text x="150" y="45" fill={D.bull} fontSize="9" fontFamily={FONT} textAnchor="middle">BoS</text>
      {/* HH/HL labels */}
      <text x="100" y="74" fill={D.textSec} fontSize="8" fontFamily={FONT} textAnchor="middle">HH</text>
      <text x="70" y="128" fill={D.textSec} fontSize="8" fontFamily={FONT} textAnchor="middle">HL</text>
      <text x="150" y="48" fill={D.textSec} fontSize="8" fontFamily={FONT} textAnchor="middle" dy="-8">HH</text>
      <text x="105" y="150" fill={D.bull} fontSize="9" fontFamily={FONT} textAnchor="middle">Trend continues ↑</text>
      {/* divider */}
      <line x1="210" y1="10" x2="210" y2="160" stroke={D.border} strokeDasharray="4" />
      {/* ChoCH — right */}
      <text x="315" y="16" fill={D.bear} fontSize="10" fontFamily={FONT} textAnchor="middle" fontWeight="bold">ChoCH (Reversal)</text>
      {/* uptrend then fail */}
      <polyline points="225,120 255,85 275,100 305,65 325,80 340,95 370,115 395,135" fill="none" stroke={D.text} strokeWidth="2" />
      {/* swing low level */}
      <line x1="260" y1="100" x2="400" y2="100" stroke={D.bear} strokeDasharray="3" />
      <text x="258" y="108" fill={D.textSec} fontSize="8" fontFamily={FONT} textAnchor="end">Swing Low</text>
      {/* break point */}
      <circle cx="355" cy="100" r="5" fill={D.bear} />
      <text x="355" y="90" fill={D.bear} fontSize="9" fontFamily={FONT} textAnchor="middle">ChoCH</text>
      <text x="315" y="150" fill={D.bear} fontSize="9" fontFamily={FONT} textAnchor="middle">Trend reverses ↓</text>
    </svg>
  );
}

/* ── 12. Supply & Demand Zones ── */
function SupplyDemandZones() {
  return (
    <svg viewBox="0 0 400 170" width="100%" role="img" aria-label="Supply and Demand zones with price reaction">
      <rect width="400" height="170" fill={D.bg} rx="6" />
      {/* Supply zone (top) */}
      <rect x="20" y="15" width="360" height="25" fill={D.bear} opacity="0.1" rx="2" />
      <line x1="20" y1="15" x2="380" y2="15" stroke={D.bear} opacity="0.3" />
      <line x1="20" y1="40" x2="380" y2="40" stroke={D.bear} opacity="0.3" />
      <text x="385" y="32" fill={D.bear} fontSize="8" fontFamily={FONT}>SUPPLY</text>
      {/* Demand zone (bottom) */}
      <rect x="20" y="130" width="360" height="25" fill={D.bull} opacity="0.1" rx="2" />
      <line x1="20" y1="130" x2="380" y2="130" stroke={D.bull} opacity="0.3" />
      <line x1="20" y1="155" x2="380" y2="155" stroke={D.bull} opacity="0.3" />
      <text x="385" y="147" fill={D.bull} fontSize="8" fontFamily={FONT}>DEMAND</text>
      {/* price action */}
      <polyline points="30,85 60,70 90,55 110,35 125,42 140,60 170,80 200,100 230,120 255,135 270,128 290,110 320,85 350,70 370,55" fill="none" stroke={D.text} strokeWidth="2" />
      {/* rejection at supply */}
      <circle cx="110" cy="35" r="4" fill={D.bear} />
      <text x="110" y="55" fill={D.bear} fontSize="8" fontFamily={FONT} textAnchor="middle">Sell pressure</text>
      {/* bounce at demand */}
      <circle cx="255" cy="135" r="4" fill={D.bull} />
      <text x="255" y="122" fill={D.bull} fontSize="8" fontFamily={FONT} textAnchor="middle">Buy pressure</text>
      {/* arrows */}
      <text x="140" y="92" fill={D.bear} fontSize="14" fontFamily={FONT}>↓</text>
      <text x="290" y="100" fill={D.bull} fontSize="14" fontFamily={FONT}>↑</text>
      <text x="200" y="167" fill={D.muted} fontSize="8" fontFamily={FONT} textAnchor="middle">Price rejects at Supply, bounces at Demand</text>
    </svg>
  );
}

/* ── 13. Heatmap Example ── */
function HeatmapExample() {
  const rows = 8, cols = 14;
  const heat = [
    [0,0,1,1,0,0,0,1,0,0,0,0,0,0],
    [0,1,2,2,1,0,0,1,1,0,0,0,0,0],
    [1,2,3,4,2,1,0,1,2,1,0,0,0,0],
    [0,2,4,5,4,2,1,0,1,2,3,2,1,0],
    [0,1,3,4,3,1,0,0,0,1,4,5,3,1],
    [0,0,2,2,1,0,0,0,0,0,2,3,2,0],
    [0,0,0,1,0,0,0,0,0,0,1,2,1,0],
    [0,0,0,0,0,0,0,0,0,0,0,1,0,0],
  ];
  const colors = ["transparent", "#3b0764", "#7e22ce", "#dc2626", "#f59e0b", "#fbbf24"];
  return (
    <svg viewBox="0 0 400 145" width="100%" role="img" aria-label="Stop-loss heatmap showing stop cluster density">
      <rect width="400" height="145" fill={D.bg} rx="6" />
      {/* grid */}
      {heat.map((row, r) => row.map((v, c) => (
        <rect key={`${r}-${c}`} x={40 + c * 22} y={10 + r * 14} width="21" height="13" fill={colors[v]} opacity={v === 0 ? 0 : 0.7} rx="1" />
      )))}
      {/* price axis */}
      {["2,680","2,675","2,670","2,665","2,660","2,655","2,650","2,645"].map((p,i) => (
        <text key={i} x="5" y={20 + i * 14} fill={D.muted} fontSize="7" fontFamily={FONT}>{p}</text>
      ))}
      {/* hot spot annotation */}
      <circle cx={40 + 3 * 22 + 10} cy={10 + 3 * 14 + 7} r="10" fill="none" stroke={D.amber} strokeWidth="1.5" strokeDasharray="3" />
      <text x={40 + 3 * 22 + 10} y={10 + 3 * 14 - 6} fill={D.amber} fontSize="8" fontFamily={FONT} textAnchor="middle">Stop cluster</text>
      {/* legend */}
      <text x="360" y="22" fill={D.textSec} fontSize="8" fontFamily={FONT}>HIGH</text>
      {[5,4,3,2,1].map((v,i) => (
        <rect key={v} x="360" y={28 + i * 12} width="18" height="10" fill={colors[v]} opacity="0.7" rx="1" />
      ))}
      <text x="360" y="96" fill={D.textSec} fontSize="8" fontFamily={FONT}>LOW</text>
      <text x="200" y="140" fill={D.muted} fontSize="8" fontFamily={FONT} textAnchor="middle">Bright zones = stop-loss clusters — institutional hunt targets</text>
    </svg>
  );
}

/* ── 14. Risk:Reward Diagram ── */
function RiskRewardDiagram() {
  return (
    <svg viewBox="0 0 400 170" width="100%" role="img" aria-label="Risk:Reward ratio showing entry, stop loss, and take profit levels">
      <rect width="400" height="170" fill={D.bg} rx="6" />
      {/* reward zone */}
      <rect x="40" y="20" width="220" height="55" fill={D.bull} opacity="0.08" rx="2" />
      {/* risk zone */}
      <rect x="40" y="95" width="220" height="40" fill={D.bear} opacity="0.08" rx="2" />
      {/* TP line */}
      <line x1="40" y1="20" x2="260" y2="20" stroke={D.bull} strokeWidth="2" strokeDasharray="5" />
      <text x="270" y="24" fill={D.bull} fontSize="10" fontFamily={FONT} fontWeight="bold">TP — $2,660</text>
      {/* Entry line */}
      <line x1="40" y1="75" x2="260" y2="75" stroke={D.cyan} strokeWidth="2" />
      <text x="270" y="79" fill={D.cyan} fontSize="10" fontFamily={FONT} fontWeight="bold">ENTRY — $2,640</text>
      {/* SL line */}
      <line x1="40" y1="135" x2="260" y2="135" stroke={D.bear} strokeWidth="2" strokeDasharray="5" />
      <text x="270" y="139" fill={D.bear} fontSize="10" fontFamily={FONT} fontWeight="bold">SL — $2,630</text>
      {/* reward bracket */}
      <line x1="30" y1="22" x2="30" y2="73" stroke={D.bull} strokeWidth="1.5" />
      <line x1="25" y1="22" x2="35" y2="22" stroke={D.bull} strokeWidth="1.5" />
      <line x1="25" y1="73" x2="35" y2="73" stroke={D.bull} strokeWidth="1.5" />
      <text x="18" y="52" fill={D.bull} fontSize="9" fontFamily={FONT} textAnchor="middle" transform="rotate(-90, 18, 52)">+$20</text>
      {/* risk bracket */}
      <line x1="30" y1="77" x2="30" y2="133" stroke={D.bear} strokeWidth="1.5" />
      <line x1="25" y1="77" x2="35" y2="77" stroke={D.bear} strokeWidth="1.5" />
      <line x1="25" y1="133" x2="35" y2="133" stroke={D.bear} strokeWidth="1.5" />
      <text x="18" y="108" fill={D.bear} fontSize="9" fontFamily={FONT} textAnchor="middle" transform="rotate(-90, 18, 108)">-$10</text>
      {/* R:R label */}
      <rect x="130" y="148" width="140" height="20" fill={D.amber} opacity="0.15" rx="10" stroke={D.amber} strokeWidth="1" />
      <text x="200" y="162" fill={D.amber} fontSize="11" fontFamily={FONT} textAnchor="middle" fontWeight="bold">R:R = 1:2</text>
      <text x="80" y="162" fill={D.textSec} fontSize="8" fontFamily={FONT} textAnchor="middle">Win 40% → Profit</text>
    </svg>
  );
}

/* ── Example Diagram Renderer ── */
const EXAMPLE_COMPONENTS: Record<string, React.FC> = {
  "candlestick-anatomy": CandlestickDiagram,
  "session-bands": SessionBands,
  "ma-cross": MovingAverageCross,
  "rsi-zones": RSIZones,
  "macd-example": MACDExample,
  "bollinger-bands": BollingerBandsDiagram,
  "volume-spike": VolumeSpike,
  "volume-profile": VolumeProfileDiagram,
  "order-block": OrderBlockDiagram,
  "fvg": FVGDiagram,
  "bos-choch": BoSChoCHDiagram,
  "supply-demand": SupplyDemandZones,
  "heatmap-example": HeatmapExample,
  "risk-reward": RiskRewardDiagram,
};

function ExampleDiagram({ exampleKey }: { exampleKey: string }) {
  const Component = EXAMPLE_COMPONENTS[exampleKey];
  if (!Component) return null;
  return (
    <div className="mt-3 mb-2 rounded-md overflow-hidden border" style={{
      borderColor: "var(--color-border-primary)",
      backgroundColor: "color-mix(in srgb, var(--color-bg-card) 80%, transparent)",
    }}>
      <Component />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════ */

function ProTip({ text }: { text: string }) {
  return (
    <div
      className="mt-2 flex items-start gap-2 rounded-md px-3 py-2 border"
      style={{
        borderColor: "color-mix(in srgb, var(--color-neon-purple) 30%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--color-neon-purple) 6%, transparent)",
      }}
    >
      <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--color-neon-purple)" }} />
      <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
        <span className="font-bold text-[var(--color-neon-purple)] uppercase text-[11px]">Pro Tip: </span>
        {text}
      </p>
    </div>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <div
      className="mt-2 flex items-start gap-2 rounded-md px-3 py-2 border"
      style={{
        borderColor: "color-mix(in srgb, var(--color-neon-amber) 30%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--color-neon-amber) 6%, transparent)",
      }}
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--color-neon-amber)" }} />
      <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
        <span className="font-bold text-[var(--color-neon-amber)] uppercase text-[11px]">Warning: </span>
        {text}
      </p>
    </div>
  );
}

function SubSectionCard({ section }: { section: SubSection }) {
  return (
    <div className="mb-3 last:mb-0">
      <h4 className="text-[13px] font-bold text-[var(--color-text-primary)] mb-1.5 flex items-center gap-1.5">
        <ChevronRight className="w-3.5 h-3.5 text-[var(--color-neon-cyan)]" />
        {section.title}
      </h4>
      <p className="text-[12px] leading-[1.7] text-[var(--color-text-secondary)] pl-5">
        {section.content}
      </p>
      {section.example && <div className="pl-5"><ExampleDiagram exampleKey={section.example} /></div>}
      {section.tip && <div className="pl-5"><ProTip text={section.tip} /></div>}
      {section.warning && <div className="pl-5"><Warning text={section.warning} /></div>}
    </div>
  );
}

function ChapterCard({ chapter, isOpen, onToggle }: { chapter: Chapter; isOpen: boolean; onToggle: () => void }) {
  const Icon = chapter.icon;

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Chapter header — clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
      >
        {/* Number badge */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[13px] font-bold font-mono"
          style={{
            color: chapter.color,
            backgroundColor: `color-mix(in srgb, ${chapter.color} 15%, transparent)`,
            border: `1px solid color-mix(in srgb, ${chapter.color} 30%, transparent)`,
          }}
        >
          {chapter.number}
        </div>

        {/* Icon */}
        <Icon className="w-5 h-5 shrink-0" style={{ color: chapter.color }} />

        {/* Title + subtitle */}
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-[var(--color-text-primary)]">{chapter.title}</div>
          <div className="text-[11px] text-[var(--color-text-muted)]">{chapter.subtitle}</div>
        </div>

        {/* Section count */}
        <span className="text-[11px] font-mono text-[var(--color-text-muted)] shrink-0">
          {chapter.sections.length} topics
        </span>

        {/* Chevron */}
        <ChevronDown
          className={`w-4 h-4 text-[var(--color-text-muted)] shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Chapter content — collapsible */}
      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--color-border-primary)]">
          {chapter.sections.map((section, i) => (
            <SubSectionCard key={i} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   QUIZ DATA & COMPONENT (Duolingo-style)
   ═══════════════════════════════════════════════════════ */

interface QuizQuestion {
  id: number;
  chapter: string;
  question: string;
  options: string[];
  correct: number; // index of correct answer
  explanation: string;
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  // Chapter 1: Welcome
  {
    id: 1,
    chapter: "Welcome to VISION",
    question: "What does VISION combine to help traders make decisions?",
    options: [
      "Only candlestick patterns",
      "Real-time data, 14+ indicators, ML predictions, smart money tracking, and AI analysis",
      "Social media sentiment only",
      "Basic moving averages and RSI",
    ],
    correct: 1,
    explanation: "VISION is an institutional-grade platform that synthesizes multiple data sources including real-time prices, technical indicators, machine learning, smart money tracking, and AI-powered analysis.",
  },
  {
    id: 2,
    chapter: "Welcome to VISION",
    question: "What does a green dot next to an asset in the selector mean?",
    options: [
      "The asset is profitable today",
      "The asset has high volume",
      "The market is currently open",
      "The asset is trending bullish",
    ],
    correct: 2,
    explanation: "A green dot indicates the market for that asset is currently open and trading. Red means the market is closed.",
  },
  // Chapter 2: Chart
  {
    id: 3,
    chapter: "Reading the Chart",
    question: "What does a candle with a tiny body and long wicks (doji) signal?",
    options: [
      "Strong bullish momentum",
      "Strong bearish momentum",
      "Market indecision",
      "A guaranteed reversal",
    ],
    correct: 2,
    explanation: "A doji candle has a very small body with long wicks on both sides, indicating that neither buyers nor sellers won the period — a sign of indecision that often precedes a directional move.",
  },
  {
    id: 4,
    chapter: "Reading the Chart",
    question: "When is the highest-volume trading period for forex?",
    options: [
      "Tokyo session open (00:00 UTC)",
      "London-New York overlap (13:00-16:00 UTC)",
      "Sydney session (21:00 UTC)",
      "After all markets close",
    ],
    correct: 1,
    explanation: "The London-New York overlap (13:00-16:00 UTC) is when two of the three major sessions are open simultaneously, creating the highest liquidity and biggest price moves.",
  },
  // Chapter 3: Indicators
  {
    id: 5,
    chapter: "Technical Indicators",
    question: "RSI is at 75. What does this indicate?",
    options: [
      "The asset is oversold — likely to bounce",
      "The asset is overbought — may be due for a pullback",
      "The trend is neutral",
      "Volume is extremely high",
    ],
    correct: 1,
    explanation: "RSI above 70 indicates overbought conditions, suggesting the asset may be stretched and due for a pullback. However, in strong trends, RSI can remain overbought for extended periods.",
  },
  {
    id: 6,
    chapter: "Technical Indicators",
    question: "What happens when the MACD line crosses ABOVE the Signal line?",
    options: [
      "Sell signal — bearish momentum",
      "Buy signal — bullish momentum",
      "No signal — stay flat",
      "Market is about to close",
    ],
    correct: 1,
    explanation: "When the MACD line crosses above the Signal line, it generates a bullish signal indicating upward momentum is accelerating. The reverse (crossing below) is a bearish signal.",
  },
  {
    id: 7,
    chapter: "Technical Indicators",
    question: "What is a Bollinger Squeeze?",
    options: [
      "When price breaks above the upper band",
      "When the bands contract tightly, signaling low volatility before a big move",
      "When volume drops to zero",
      "When RSI and MACD disagree",
    ],
    correct: 1,
    explanation: "A Bollinger Squeeze occurs when the bands contract tightly around price, indicating very low volatility. This compression often precedes a significant breakout in either direction.",
  },
  // Chapter 4: Volume
  {
    id: 8,
    chapter: "Volume & Order Flow",
    question: "What does the POC (Point of Control) represent in a Volume Profile?",
    options: [
      "The highest price of the day",
      "The price level with the MOST volume traded",
      "The lowest price of the day",
      "The average price",
    ],
    correct: 1,
    explanation: "The POC is the price level where the most volume was traded. It acts as a magnet — price tends to return to the POC because it represents the 'fairest' price agreed upon by the most participants.",
  },
  {
    id: 9,
    chapter: "Volume & Order Flow",
    question: "OBV is rising while price is flat. What might this indicate?",
    options: [
      "The market is about to crash",
      "Volume is irrelevant to price",
      "Institutions may be quietly accumulating before a breakout",
      "The indicator is broken",
    ],
    correct: 2,
    explanation: "Rising OBV with flat price is a classic sign of stealth accumulation — large players are buying without pushing price up yet. This divergence often resolves with a strong upward breakout.",
  },
  // Chapter 5: Smart Money
  {
    id: 10,
    chapter: "Smart Money Concepts",
    question: "What is a Fair Value Gap (FVG)?",
    options: [
      "A three-candle pattern where the middle candle creates an imbalance that price tends to return to fill",
      "The gap between the bid and ask price",
      "A gap that only appears on daily charts",
      "The difference between retail and institutional pricing",
    ],
    correct: 0,
    explanation: "An FVG is a three-candle pattern where the middle candle is so large that candles 1 and 3 don't overlap, creating an area of unfair pricing. Price often returns to fill this gap before continuing.",
  },
  {
    id: 11,
    chapter: "Smart Money Concepts",
    question: "What does a Change of Character (ChoCH) signal?",
    options: [
      "Trend continuation",
      "A potential trend reversal — the first break of structure in the opposite direction",
      "High volatility but no direction",
      "A news event is coming",
    ],
    correct: 1,
    explanation: "A ChoCH is a Break of Structure in the OPPOSITE direction of the current trend. It's the first warning sign that the trend may be shifting — unlike a regular BoS which confirms the existing trend.",
  },
  // Chapter 6: Heatmaps
  {
    id: 12,
    chapter: "Heatmaps & Liquidity",
    question: "Why do institutions target stop-loss clusters?",
    options: [
      "To help retail traders exit positions",
      "To trigger cascading liquidations that create liquidity for filling their own large orders",
      "Because they don't know where stops are",
      "To reduce market volatility",
    ],
    correct: 1,
    explanation: "Institutions push price into stop clusters to trigger a cascade of forced executions. This creates the liquidity they need to fill large positions at favorable prices, after which price typically reverses.",
  },
  {
    id: 13,
    chapter: "Heatmaps & Liquidity",
    question: "What should you do with stop-loss placement according to the heatmap?",
    options: [
      "Place stops at exact round numbers",
      "Place stops inside the brightest heatmap zones",
      "Place stops BEYOND stop-loss clusters to avoid stop hunts",
      "Don't use stop losses",
    ],
    correct: 2,
    explanation: "Always place your stop loss beyond the bright zones on the heatmap, not inside them. Bright zones are stop-hunt targets — placing your stop there increases the chance of being stopped out by institutional manipulation.",
  },
  // Chapter 7: AI/ML
  {
    id: 14,
    chapter: "AI & Machine Learning",
    question: "What does a confidence score of 82% mean?",
    options: [
      "82% of all traders agree",
      "The trade will be profitable 82% of the time — guaranteed",
      "82% of VISION's data sources agree on the direction — high probability but not certain",
      "The market is 82% efficient",
    ],
    correct: 2,
    explanation: "Confidence reflects how many data sources align on a direction. 82% is strong consensus, but it still means 18% of the time it will be wrong. Always use a stop loss regardless of confidence level.",
  },
  {
    id: 15,
    chapter: "AI & Machine Learning",
    question: "Why does market regime matter for your trading strategy?",
    options: [
      "It doesn't — use the same strategy always",
      "Because strategies that work in trends fail in ranges and vice versa",
      "Regime only matters for crypto",
      "It determines the time of day to trade",
    ],
    correct: 1,
    explanation: "Market regime is critical because different conditions require different approaches. Breakout strategies work in trends but get chopped up in ranges. Mean-reversion works in ranges but gets destroyed in trends.",
  },
  // Chapter 8: Institutional
  {
    id: 16,
    chapter: "Institutional Tracking",
    question: "Retail traders are 82% long on EUR/USD while institutional data shows selling. What's the likely outcome?",
    options: [
      "EUR/USD will rally because retail has the edge",
      "Nothing — retail and institutional data are equally reliable",
      "Bearish divergence — institutions are often right, making the contrarian (short) trade more probable",
      "The data is unreliable and should be ignored",
    ],
    correct: 2,
    explanation: "When retail is heavily on one side and institutions on the other, follow institutions. The majority of retail traders lose money. This extreme divergence is a contrarian sell signal.",
  },
  // Chapter 9: Scalper
  {
    id: 17,
    chapter: "Scalper Mode",
    question: "What minimum confidence does VISION require to send signals to Telegram/Discord?",
    options: [
      "50%",
      "65%",
      "75%",
      "90%",
    ],
    correct: 2,
    explanation: "VISION only broadcasts signals with 75% or higher confidence. This threshold ensures only high-quality, multi-source-confirmed setups reach the channels, filtering out noise.",
  },
  {
    id: 18,
    chapter: "Scalper Mode",
    question: "A signal has a Risk:Reward ratio of 1:2.5. What does this mean?",
    options: [
      "You risk $2.50 to make $1",
      "You risk $1 to make $2.50",
      "The win rate is 25%",
      "The trade lasts 2.5 hours",
    ],
    correct: 1,
    explanation: "R:R 1:2.5 means for every dollar you risk (distance to SL), you stand to gain $2.50 (distance to TP). With this ratio, you only need to win 30% of trades to be profitable.",
  },
  {
    id: 19,
    chapter: "Scalper Mode",
    question: "What does the Loss Learning system do when it detects a recurring loss pattern?",
    options: [
      "Deletes all previous signals",
      "Stops the engine completely",
      "Activates a filter that reduces confidence for similar future setups",
      "Sends an email to the trader",
    ],
    correct: 2,
    explanation: "When a loss pattern occurs 3+ times, the engine activates an adaptive filter that reduces confidence by 50% for setups matching those conditions, effectively learning from past mistakes.",
  },
  // Chapter 10: Workflow
  {
    id: 20,
    chapter: "Putting It All Together",
    question: "What's the MOST important trading principle according to the Academy?",
    options: [
      "Having the highest win rate possible",
      "Trading as many signals as possible",
      "Risk management — it matters more than technical analysis",
      "Always following the daily trend",
    ],
    correct: 2,
    explanation: "Risk management is the foundation of profitable trading. You can have mediocre signals and still be profitable with good risk management. You cannot survive with bad risk management no matter how good your analysis is.",
  },
];

/* ── Quiz Streak XP System ── */
const XP_CORRECT = 10;
const XP_STREAK_BONUS = 5; // extra per question in streak
const GRADE_THRESHOLDS = [
  { min: 90, label: "MASTER", color: "var(--color-neon-cyan)", icon: Trophy },
  { min: 75, label: "EXPERT", color: "var(--color-neon-green)", icon: Award },
  { min: 60, label: "INTERMEDIATE", color: "var(--color-neon-amber)", icon: Star },
  { min: 0, label: "BEGINNER", color: "var(--color-bear)", icon: BookOpen },
];

function KnowledgeQuiz() {
  const [started, setStarted] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<(boolean | null)[]>(new Array(QUIZ_QUESTIONS.length).fill(null));

  const q = QUIZ_QUESTIONS[currentQ];
  const total = QUIZ_QUESTIONS.length;
  const progress = ((currentQ + (answered ? 1 : 0)) / total) * 100;

  const handleSelect = useCallback((idx: number) => {
    if (answered) return;
    setSelected(idx);
  }, [answered]);

  const handleCheck = useCallback(() => {
    if (selected === null) return;
    setAnswered(true);
    const isCorrect = selected === q.correct;
    const newAnswers = [...answers];
    newAnswers[currentQ] = isCorrect;
    setAnswers(newAnswers);

    if (isCorrect) {
      const newStreak = streak + 1;
      setScore((s) => s + 1);
      setStreak(newStreak);
      setMaxStreak((m) => Math.max(m, newStreak));
      setXp((x) => x + XP_CORRECT + (newStreak > 1 ? XP_STREAK_BONUS * (newStreak - 1) : 0));
    } else {
      setStreak(0);
    }
  }, [selected, q, currentQ, answers, streak]);

  const handleNext = useCallback(() => {
    if (currentQ + 1 >= total) {
      setFinished(true);
    } else {
      setCurrentQ((c) => c + 1);
      setSelected(null);
      setAnswered(false);
    }
  }, [currentQ, total]);

  const handleRestart = useCallback(() => {
    setStarted(true);
    setCurrentQ(0);
    setSelected(null);
    setAnswered(false);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setXp(0);
    setFinished(false);
    setAnswers(new Array(total).fill(null));
  }, [total]);

  const pct = Math.round((score / total) * 100);
  const grade = GRADE_THRESHOLDS.find((g) => pct >= g.min) || GRADE_THRESHOLDS[3];
  const GradeIcon = grade.icon;

  // ── Not started ──
  if (!started) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="p-6 text-center">
          <Trophy className="w-8 h-8 text-[var(--color-neon-amber)] mx-auto mb-3" />
          <h3
            className="text-xl font-bold mb-2"
            style={{
              background: "linear-gradient(135deg, var(--color-neon-amber), var(--color-neon-green))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            KNOWLEDGE TEST
          </h3>
          <p className="text-[13px] text-[var(--color-text-secondary)] mb-1">
            Test what you learned from the Academy chapters.
          </p>
          <p className="text-[12px] text-[var(--color-text-muted)] mb-5">
            {total} questions • Earn XP • Build streaks for bonus points
          </p>
          <button
            onClick={() => setStarted(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-bold font-mono uppercase transition-all hover:brightness-110"
            style={{
              color: "black",
              background: "linear-gradient(135deg, var(--color-neon-amber), var(--color-neon-green))",
            }}
          >
            <Zap className="w-4 h-4" />
            Start Quiz
          </button>
        </div>
      </div>
    );
  }

  // ── Finished ──
  if (finished) {
    return (
      <div className="card-glass rounded-lg overflow-hidden">
        <div className="p-6 text-center">
          {/* Grade badge */}
          <div
            className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
            style={{
              backgroundColor: `color-mix(in srgb, ${grade.color} 15%, transparent)`,
              border: `2px solid ${grade.color}`,
            }}
          >
            <GradeIcon className="w-8 h-8" style={{ color: grade.color }} />
          </div>
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest mb-1" style={{ color: grade.color }}>
            {grade.label}
          </div>
          <div className="text-3xl font-bold font-mono mb-1" style={{ color: grade.color }}>
            {pct}%
          </div>
          <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">
            {score} of {total} correct
          </p>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-5 max-w-xs mx-auto">
            <div className="rounded-md bg-[var(--color-bg-secondary)] p-2 border border-[var(--color-border-primary)]">
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase">XP Earned</div>
              <div className="text-[16px] font-bold font-mono text-[var(--color-neon-amber)]">{xp}</div>
            </div>
            <div className="rounded-md bg-[var(--color-bg-secondary)] p-2 border border-[var(--color-border-primary)]">
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Best Streak</div>
              <div className="text-[16px] font-bold font-mono text-[var(--color-neon-green)]">{maxStreak}</div>
            </div>
            <div className="rounded-md bg-[var(--color-bg-secondary)] p-2 border border-[var(--color-border-primary)]">
              <div className="text-[10px] text-[var(--color-text-muted)] uppercase">Accuracy</div>
              <div className="text-[16px] font-bold font-mono" style={{ color: grade.color }}>{pct}%</div>
            </div>
          </div>

          {/* Answer review dots */}
          <div className="flex justify-center gap-1 mb-5">
            {answers.map((a, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: a === true ? "var(--color-bull)" : a === false ? "var(--color-bear)" : "var(--color-bg-hover)",
                }}
                title={`Q${i + 1}: ${a ? "Correct" : "Wrong"}`}
              />
            ))}
          </div>

          {/* Message */}
          <p className="text-[12px] text-[var(--color-text-muted)] mb-4">
            {pct >= 90
              ? "Outstanding! You have mastered VISION's trading tools."
              : pct >= 75
                ? "Great job! You have a strong understanding of the platform."
                : pct >= 60
                  ? "Good progress! Review the chapters you missed and try again."
                  : "Keep learning! Re-read the chapters above and retake the quiz."}
          </p>

          <button
            onClick={handleRestart}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-bold font-mono uppercase transition-colors hover:bg-[var(--color-bg-hover)] border border-[var(--color-border-primary)]"
            style={{ color: "var(--color-text-primary)" }}
          >
            <RotateCcw className="w-4 h-4" />
            Retake Quiz
          </button>
        </div>
      </div>
    );
  }

  // ── Active question ──
  const isCorrect = selected === q.correct;

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 bg-[var(--color-bg-hover)]">
        <div
          className="h-full transition-all duration-500 rounded-r"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, var(--color-neon-cyan), var(--color-neon-green))",
          }}
        />
      </div>

      {/* Header: question count + streak + XP */}
      <div className="px-4 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-3">
        <span className="text-[12px] font-mono text-[var(--color-text-muted)]">
          {currentQ + 1}/{total}
        </span>
        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]">
          {q.chapter}
        </span>
        {streak > 0 && (
          <span
            className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ml-auto flex items-center gap-1"
            style={{
              color: "var(--color-neon-amber)",
              backgroundColor: "color-mix(in srgb, var(--color-neon-amber) 12%, transparent)",
            }}
          >
            <Flame className="w-3 h-3" />
            {streak} streak
          </span>
        )}
        <span className="text-[11px] font-mono font-bold text-[var(--color-neon-amber)] ml-auto">
          {xp} XP
        </span>
      </div>

      <div className="p-4">
        {/* Question */}
        <p className="text-[14px] font-semibold text-[var(--color-text-primary)] mb-4 leading-relaxed">
          {q.question}
        </p>

        {/* Options */}
        <div className="space-y-2 mb-4">
          {q.options.map((opt, i) => {
            let borderColor = "var(--color-border-primary)";
            let bgColor = "transparent";
            let textColor = "var(--color-text-secondary)";

            if (answered) {
              if (i === q.correct) {
                borderColor = "var(--color-bull)";
                bgColor = "color-mix(in srgb, var(--color-bull) 10%, transparent)";
                textColor = "var(--color-bull)";
              } else if (i === selected && !isCorrect) {
                borderColor = "var(--color-bear)";
                bgColor = "color-mix(in srgb, var(--color-bear) 10%, transparent)";
                textColor = "var(--color-bear)";
              }
            } else if (i === selected) {
              borderColor = "var(--color-neon-cyan)";
              bgColor = "color-mix(in srgb, var(--color-neon-cyan) 8%, transparent)";
              textColor = "var(--color-neon-cyan)";
            }

            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                disabled={answered}
                className="w-full text-left px-3 py-2.5 rounded-md border transition-all text-[13px] leading-relaxed flex items-start gap-2"
                style={{ borderColor, backgroundColor: bgColor, color: textColor }}
              >
                <span className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold font-mono"
                  style={{ borderColor }}
                >
                  {answered && i === q.correct ? (
                    <CheckCircle2 className="w-4 h-4" style={{ color: "var(--color-bull)" }} />
                  ) : answered && i === selected && !isCorrect ? (
                    <XCircle className="w-4 h-4" style={{ color: "var(--color-bear)" }} />
                  ) : (
                    String.fromCharCode(65 + i)
                  )}
                </span>
                {opt}
              </button>
            );
          })}
        </div>

        {/* Explanation (after answering) */}
        {answered && (
          <div
            className="mb-4 px-3 py-2 rounded-md border text-[12px] leading-relaxed"
            style={{
              borderColor: isCorrect
                ? "color-mix(in srgb, var(--color-bull) 30%, transparent)"
                : "color-mix(in srgb, var(--color-bear) 30%, transparent)",
              backgroundColor: isCorrect
                ? "color-mix(in srgb, var(--color-bull) 6%, transparent)"
                : "color-mix(in srgb, var(--color-bear) 6%, transparent)",
              color: "var(--color-text-secondary)",
            }}
          >
            <span className="font-bold" style={{ color: isCorrect ? "var(--color-bull)" : "var(--color-bear)" }}>
              {isCorrect ? "Correct! " : "Not quite. "}
            </span>
            {q.explanation}
            {isCorrect && streak > 1 && (
              <span className="ml-1 font-bold" style={{ color: "var(--color-neon-amber)" }}>
                +{XP_CORRECT + XP_STREAK_BONUS * (streak - 1)} XP (streak bonus!)
              </span>
            )}
          </div>
        )}

        {/* Action button */}
        {!answered ? (
          <button
            onClick={handleCheck}
            disabled={selected === null}
            className="w-full py-2.5 rounded-md text-[13px] font-bold font-mono uppercase transition-all"
            style={{
              color: selected !== null ? "black" : "var(--color-text-muted)",
              backgroundColor: selected !== null ? "var(--color-neon-cyan)" : "var(--color-bg-hover)",
              cursor: selected !== null ? "pointer" : "not-allowed",
            }}
          >
            Check Answer
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="w-full py-2.5 rounded-md text-[13px] font-bold font-mono uppercase transition-all hover:brightness-110"
            style={{
              color: "black",
              background: "linear-gradient(90deg, var(--color-neon-cyan), var(--color-neon-green))",
            }}
          >
            {currentQ + 1 >= total ? "See Results" : "Next Question"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */

export default function TradingAcademy() {
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());

  const toggleChapter = (id: string) => {
    setOpenChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setOpenChapters(new Set(CHAPTERS.map((c) => c.id)));
  };

  const collapseAll = () => {
    setOpenChapters(new Set());
  };

  const totalTopics = CHAPTERS.reduce((sum, ch) => sum + ch.sections.length, 0);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* ── Top bar ── */}
      <div className="border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[12px] font-mono text-[var(--color-text-muted)] hover:text-[var(--color-neon-cyan)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
          <div className="h-4 w-px bg-[var(--color-border-primary)]" />
          <div className="flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-[var(--color-neon-cyan)]" />
            <span className="text-[12px] font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
              VISION Academy
            </span>
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <GraduationCap className="w-8 h-8 text-[var(--color-neon-cyan)]" />
          </div>
          <h1
            className="text-3xl md:text-4xl font-bold tracking-tight mb-2"
            style={{
              background: "linear-gradient(135deg, var(--color-neon-cyan), var(--color-neon-purple))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            VISION ACADEMY
          </h1>
          <p className="text-[14px] text-[var(--color-text-secondary)] max-w-lg mx-auto mb-4">
            Master institutional-grade trading analytics. From candlestick basics to smart money concepts — everything you need to trade with confidence.
          </p>
          <div className="flex items-center justify-center gap-4 text-[12px] font-mono text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              {CHAPTERS.length} chapters
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5" />
              {totalTopics} topics
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              ~45 min read
            </span>
          </div>
        </div>

        {/* ── Quick-jump chips ── */}
        <div className="flex flex-wrap justify-center gap-1.5 mb-6">
          {CHAPTERS.map((ch) => (
            <button
              key={ch.id}
              onClick={() => {
                setOpenChapters((prev) => new Set(prev).add(ch.id));
                document.getElementById(`chapter-${ch.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="text-[11px] font-mono px-2.5 py-1 rounded-full border transition-colors hover:bg-[var(--color-bg-hover)]"
              style={{
                color: ch.color,
                borderColor: `color-mix(in srgb, ${ch.color} 30%, transparent)`,
              }}
            >
              {ch.number}. {ch.title}
            </button>
          ))}
        </div>

        {/* ── Expand/Collapse controls ── */}
        <div className="flex justify-center gap-2 mb-6">
          <button
            onClick={expandAll}
            className="text-[11px] font-mono px-3 py-1 rounded bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="text-[11px] font-mono px-3 py-1 rounded bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            Collapse All
          </button>
        </div>

        {/* ── Chapters ── */}
        <div className="space-y-3">
          {CHAPTERS.map((chapter) => (
            <div key={chapter.id} id={`chapter-${chapter.id}`}>
              <ChapterCard
                chapter={chapter}
                isOpen={openChapters.has(chapter.id)}
                onToggle={() => toggleChapter(chapter.id)}
              />
            </div>
          ))}
        </div>

        {/* ── Knowledge Quiz ── */}
        <div className="mt-8 mb-4">
          <div className="text-center mb-4">
            <h2
              className="text-lg font-bold"
              style={{
                background: "linear-gradient(135deg, var(--color-neon-amber), var(--color-neon-green))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Test Your Knowledge
            </h2>
            <p className="text-[12px] text-[var(--color-text-muted)]">
              Did you absorb everything? Take the quiz to find out.
            </p>
          </div>
          <KnowledgeQuiz />
        </div>

        {/* ── Footer CTA ── */}
        <div className="mt-10 mb-8 text-center">
          <div className="card-glass rounded-lg p-6 max-w-lg mx-auto">
            <Zap className="w-6 h-6 text-[var(--color-neon-green)] mx-auto mb-2" />
            <h3 className="text-[15px] font-bold text-[var(--color-text-primary)] mb-1">
              Ready to Start Trading?
            </h3>
            <p className="text-[12px] text-[var(--color-text-muted)] mb-4">
              Head back to the dashboard and put your knowledge into action. Start with the Market Narrator for an AI overview, then use Scalper Mode to find your first setup.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-bold font-mono uppercase transition-colors"
              style={{
                color: "black",
                backgroundColor: "var(--color-neon-cyan)",
              }}
            >
              <LineChart className="w-4 h-4" />
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
