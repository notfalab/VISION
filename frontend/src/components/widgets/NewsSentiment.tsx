"use client";

import { useEffect, useState, useMemo } from "react";
import { TrendingUp, ExternalLink, Newspaper } from "lucide-react";
import { useMarketStore, getMarketType } from "@/stores/market";
import { api } from "@/lib/api";

interface Article {
  title: string;
  source: string;
  url: string;
  sentiment_score: number;
  sentiment_label: string;
  published: string;
}

interface SentimentData {
  symbol: string;
  aggregate_score: number;
  aggregate_label: string;
  crypto_fear_greed: {
    value: number;
    classification: string;
    history: { value: number; date: string }[];
  } | null;
  market_fear_greed: {
    value: number;
    classification: string;
  } | null;
  news_sentiment: {
    score: number;
    label: string;
    articles: Article[];
    article_count: number;
  } | null;
}

/** SVG Gauge — semicircle arc with animated needle */
function SentimentGauge({ score, label }: { score: number; label: string }) {
  // Arc parameters
  const cx = 120, cy = 100, r = 80;
  const startAngle = Math.PI; // left (180°)
  const endAngle = 0; // right (0°)
  const sweepAngle = startAngle - endAngle;

  // Score → angle (0=left, 100=right)
  const needleAngle = startAngle - (score / 100) * sweepAngle;
  const needleX = cx + r * 0.85 * Math.cos(needleAngle);
  const needleY = cy - r * 0.85 * Math.sin(needleAngle);

  // Colors for the gradient stops
  const scoreColor = score >= 60
    ? "var(--color-bull)"
    : score <= 40
      ? "var(--color-bear)"
      : "var(--color-neon-amber)";

  return (
    <div className="flex flex-col items-center -mt-1 -mb-2">
      <svg viewBox="0 0 240 130" className="w-full max-w-[220px]">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--color-bear)" />
            <stop offset="35%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="var(--color-neon-amber)" />
            <stop offset="65%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="var(--color-bull)" />
          </linearGradient>
        </defs>

        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="var(--color-bg-hover)"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Colored arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((tick) => {
          const a = startAngle - (tick / 100) * sweepAngle;
          const x1 = cx + (r + 8) * Math.cos(a);
          const y1 = cy - (r + 8) * Math.sin(a);
          const x2 = cx + (r + 14) * Math.cos(a);
          const y2 = cy - (r + 14) * Math.sin(a);
          return (
            <line
              key={tick}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="var(--color-text-muted)"
              strokeWidth="1.5"
              opacity="0.4"
            />
          );
        })}

        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke={scoreColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
        <circle cx={cx} cy={cy} r="4" fill={scoreColor} />

        {/* Score text */}
        <text
          x={cx}
          y={cy - 18}
          textAnchor="middle"
          className="fill-[var(--color-text-primary)]"
          fontSize="26"
          fontWeight="bold"
          fontFamily="JetBrains Mono, monospace"
        >
          {score}
        </text>

        {/* Label */}
        <text
          x={cx}
          y={cy + 2}
          textAnchor="middle"
          className="fill-[var(--color-text-secondary)]"
          fontSize="10"
          fontWeight="500"
          style={{ textTransform: "uppercase" }}
        >
          {label}
        </text>

        {/* End labels */}
        <text x={cx - r - 5} y={cy + 22} textAnchor="middle" fontSize="9" className="fill-[var(--color-bear)]" opacity="0.7">Fear</text>
        <text x={cx + r + 5} y={cy + 22} textAnchor="middle" fontSize="9" className="fill-[var(--color-bull)]" opacity="0.7">Greed</text>
      </svg>
    </div>
  );
}

/** Mini sparkline for F&G history */
function MiniSparkline({ data }: { data: { value: number }[] }) {
  if (!data || data.length < 2) return null;
  const values = data.slice(0, 14).reverse().map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80, h = 24;

  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-[80px] h-[24px]">
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-neon-blue)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}

/** Time ago formatter */
function timeAgo(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export default function NewsSentiment() {
  const activeSymbol = useMarketStore((s) => s.activeSymbol);
  const marketType = getMarketType(activeSymbol);
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const result = await api.newsSentiment(activeSymbol);
      setData(result);
      setLoading(false);
    };
    load();
    // Refresh every 60s
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [activeSymbol]);

  const scoreBadgeColor = useMemo(() => {
    if (!data) return "var(--color-text-muted)";
    if (data.aggregate_score >= 60) return "var(--color-bull)";
    if (data.aggregate_score <= 40) return "var(--color-bear)";
    return "var(--color-neon-amber)";
  }, [data]);

  if (loading) {
    return (
      <div className="card-glass rounded-lg p-3 animate-pulse">
        <div className="h-3 bg-[var(--color-bg-hover)] rounded w-36 mb-2" />
        <div className="h-20 bg-[var(--color-bg-hover)] rounded mb-2" />
        <div className="space-y-1">
          <div className="h-4 bg-[var(--color-bg-hover)] rounded" />
          <div className="h-4 bg-[var(--color-bg-hover)] rounded" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { aggregate_score, aggregate_label, crypto_fear_greed, market_fear_greed, news_sentiment } = data;
  const articles = news_sentiment?.articles || [];
  const isCrypto = marketType === "crypto";

  return (
    <div className="card-glass rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border-primary)] flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-[var(--color-neon-amber)]" />
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Market Sentiment
        </h3>
        <span
          className="ml-auto text-[12px] font-mono font-bold px-1.5 py-0.5 rounded"
          style={{
            color: scoreBadgeColor,
            backgroundColor: `color-mix(in srgb, ${scoreBadgeColor} 12%, transparent)`,
          }}
        >
          {aggregate_score}/100
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* Gauge */}
        <SentimentGauge score={aggregate_score} label={aggregate_label} />

        {/* Indicators Grid */}
        <div className="grid grid-cols-3 gap-2">
          {/* Crypto F&G */}
          <div className="rounded-md bg-[var(--color-bg-secondary)] px-2 py-2 border border-[var(--color-border-primary)] text-center">
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1">
              {isCrypto ? "Crypto F&G" : "Crypto"}
            </div>
            {crypto_fear_greed ? (
              <>
                <div
                  className="text-[16px] font-mono font-bold"
                  style={{
                    color: crypto_fear_greed.value >= 60
                      ? "var(--color-bull)"
                      : crypto_fear_greed.value <= 40
                        ? "var(--color-bear)"
                        : "var(--color-neon-amber)",
                  }}
                >
                  {crypto_fear_greed.value}
                </div>
                <div className="text-[9px] text-[var(--color-text-muted)] truncate">
                  {crypto_fear_greed.classification}
                </div>
                <div className="mt-1 flex justify-center">
                  <MiniSparkline data={crypto_fear_greed.history} />
                </div>
              </>
            ) : (
              <div className="text-[14px] font-mono text-[var(--color-text-muted)]">—</div>
            )}
          </div>

          {/* Market F&G */}
          <div className="rounded-md bg-[var(--color-bg-secondary)] px-2 py-2 border border-[var(--color-border-primary)] text-center">
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1">
              Market F&G
            </div>
            {market_fear_greed ? (
              <>
                <div
                  className="text-[16px] font-mono font-bold"
                  style={{
                    color: market_fear_greed.value >= 60
                      ? "var(--color-bull)"
                      : market_fear_greed.value <= 40
                        ? "var(--color-bear)"
                        : "var(--color-neon-amber)",
                  }}
                >
                  {market_fear_greed.value}
                </div>
                <div className="text-[9px] text-[var(--color-text-muted)] truncate">
                  {market_fear_greed.classification}
                </div>
              </>
            ) : (
              <div className="text-[14px] font-mono text-[var(--color-text-muted)]">—</div>
            )}
          </div>

          {/* News Score */}
          <div className="rounded-md bg-[var(--color-bg-secondary)] px-2 py-2 border border-[var(--color-border-primary)] text-center">
            <div className="text-[10px] text-[var(--color-text-muted)] uppercase mb-1">
              News
            </div>
            {news_sentiment ? (
              <>
                <div
                  className="text-[16px] font-mono font-bold"
                  style={{
                    color: news_sentiment.score >= 60
                      ? "var(--color-bull)"
                      : news_sentiment.score <= 40
                        ? "var(--color-bear)"
                        : "var(--color-neon-amber)",
                  }}
                >
                  {news_sentiment.score}
                </div>
                <div className="text-[9px] text-[var(--color-text-muted)] truncate">
                  {news_sentiment.label}
                </div>
                <div className="text-[9px] text-[var(--color-text-muted)] mt-0.5">
                  {news_sentiment.article_count} articles
                </div>
              </>
            ) : (
              <div className="text-[14px] font-mono text-[var(--color-text-muted)]">—</div>
            )}
          </div>
        </div>

        {/* Trending Headlines */}
        {articles.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 mb-1">
              <Newspaper className="w-3 h-3 text-[var(--color-text-muted)]" />
              <span className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase">
                Trending Headlines
              </span>
            </div>
            {articles.slice(0, 5).map((article, i) => (
              <a
                key={i}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-[var(--color-bg-hover)] transition-colors group"
              >
                {/* Sentiment dot */}
                <span
                  className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      article.sentiment_label === "Bullish"
                        ? "var(--color-bull)"
                        : article.sentiment_label === "Bearish"
                          ? "var(--color-bear)"
                          : "var(--color-text-muted)",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-[var(--color-text-primary)] line-clamp-2 group-hover:text-[var(--color-neon-blue)] transition-colors">
                    {article.title}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    <span>{article.source}</span>
                    <span>·</span>
                    <span>{timeAgo(article.published)}</span>
                  </div>
                </div>
                <ExternalLink className="w-3 h-3 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
