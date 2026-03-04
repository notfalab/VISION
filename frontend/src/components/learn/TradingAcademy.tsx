"use client";

import { useState } from "react";
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
        warning: "Most fake breakouts happen at the start of a new session. Wait 15-30 minutes after a session opens before trading the breakout direction.",
      },
      {
        title: "Moving Averages on Chart",
        content:
          "Moving averages smooth out price noise to show the underlying trend. VISION plots SMA (Simple Moving Average) and EMA (Exponential Moving Average) with key periods: 8 (short-term momentum), 21 (intermediate trend), 50 (medium-term trend), and 200 (long-term trend). When shorter MAs cross above longer ones, it's bullish. When they cross below, it's bearish. These crossovers are called Golden Cross (bullish) and Death Cross (bearish).",
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
        tip: "In strong trends, RSI can stay overbought/oversold for extended periods. Don't blindly sell at RSI 70 in an uptrend. Instead, use RSI divergence as your signal.",
      },
      {
        title: "MACD (Moving Average Convergence Divergence)",
        content:
          "MACD shows the relationship between two moving averages (12 and 26-period EMA). The MACD line is the difference between them. The Signal line is a 9-period EMA of MACD. The Histogram shows the gap between MACD and Signal — positive bars mean bullish momentum, negative mean bearish. Buy signals occur when MACD crosses above the Signal line. Sell signals when it crosses below.",
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
        tip: "The strongest order blocks are those that caused a Break of Structure (BoS). When price returns to one of these after a BoS, it's a high-probability entry.",
      },
      {
        title: "Fair Value Gaps (FVG)",
        content:
          "A Fair Value Gap is a three-candle pattern where the middle candle is so large that it creates an imbalance — the first and third candles don't overlap. This gap represents an area where price moved too fast for the market to fairly price, and price often returns to fill it. VISION marks FVGs on the chart. When price fills an FVG and then reverses, it's a high-quality entry signal.",
      },
      {
        title: "Break of Structure (BoS) vs Change of Character (ChoCH)",
        content:
          "BoS (Break of Structure) occurs when price breaks a previous swing high (bullish BoS) or swing low (bearish BoS), confirming the existing trend. ChoCH (Change of Character) is a BoS in the OPPOSITE direction of the current trend — it signals a potential trend reversal. ChoCH is the first warning sign that the trend may be shifting. VISION's Zones Overlay widget tracks both.",
        warning: "A single ChoCH doesn't guarantee a reversal. Wait for a retest of the broken structure level with confirmation (e.g., bullish candle at a bullish ChoCH level).",
      },
      {
        title: "Supply & Demand Zones",
        content:
          "Supply zones are price areas where selling pressure overwhelmed buyers, causing price to drop. Demand zones are where buying pressure overwhelmed sellers, causing price to rise. They differ from support/resistance because they represent areas of UNFILLED orders — when price returns, those orders may still be waiting. The Zones Overlay widget shows supply zones (red), demand zones (green), their strength, and how many times they've been tested.",
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
