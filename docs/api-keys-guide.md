# API Keys Setup Guide

Priority order: get these first (all have free tiers sufficient for development).

---

## 1. Alpha Vantage (Forex + Historical Data) - GET THIS FIRST

**Free tier**: 25 requests/day (sufficient for dev/testing)
**Covers**: Forex pairs, gold (XAUUSD), crypto, historical OHLCV

### Steps:
1. Go to https://www.alphavantage.co/support/#api-key
2. Fill in: name, email, select "Free"
3. Click "GET FREE API KEY"
4. Copy the key immediately (it's shown on screen)
5. Add to your `.env` file:
   ```
   ALPHA_VANTAGE_API_KEY=your_key_here
   ```

### What you can do with it:
- `FX_DAILY` — daily forex candles (EURUSD, GBPUSD, etc.)
- `FX_INTRADAY` — 1min to 60min forex candles
- `DIGITAL_CURRENCY_DAILY` — crypto daily data
- `TIME_SERIES_DAILY` — stocks/ETFs (GLD for gold ETF)

---

## 2. Binance (Crypto Real-time + Historical) - GET THIS SECOND

**Free tier**: Generous limits (1200 requests/min for REST, unlimited WebSocket)
**Covers**: All crypto pairs, real-time WebSocket streaming, order book

### Steps:
1. Go to https://www.binance.com and create an account
   - Use https://www.binance.us if you're in the United States
2. Complete email verification
3. Go to Profile > API Management (or directly to https://www.binance.com/en/my/settings/api-management)
4. Click "Create API" > choose "System generated"
5. Label it "VISION" (or any name)
6. Complete 2FA verification
7. Copy both API Key and Secret Key
8. **Important**: Under API restrictions, enable only "Enable Reading"
   - Do NOT enable trading or withdrawals for safety
9. Add to your `.env` file:
   ```
   BINANCE_API_KEY=your_api_key
   BINANCE_SECRET_KEY=your_secret_key
   ```

### What you can do with it:
- REST: Historical candles, ticker prices, order book snapshots
- WebSocket: Real-time price streams, order book updates (no key needed)
- Note: Public endpoints (candles, prices) work WITHOUT a key too

---

## 3. Etherscan (On-chain Whale Tracking) - GET THIS THIRD

**Free tier**: 5 requests/second, 100,000/day
**Covers**: Ethereum whale transfers, large transactions, token movements

### Steps:
1. Go to https://etherscan.io/register
2. Create account (email + password)
3. Verify email
4. Go to https://etherscan.io/myapikey
5. Click "Add" to create a new key
6. Name it "VISION"
7. Copy the API key
8. Add to your `.env` file:
   ```
   ETHERSCAN_API_KEY=your_key_here
   ```

---

## 4. OANDA (Forex Real-time) - OPTIONAL FOR PHASE 1

**Free tier**: Practice/demo account with real-time streaming
**Covers**: Professional forex data, real-time streaming, all major/minor/exotic pairs

### Steps:
1. Go to https://www.oanda.com/register/#/sign-up/demo
2. Select "Practice Account" (fxTrade Practice)
3. Fill in details and create account
4. Once logged in, go to "Manage API Access" under account settings
5. Generate a personal access token
6. Note your account ID (shown in account details)
7. Add to your `.env` file:
   ```
   OANDA_API_KEY=your_access_token
   OANDA_ACCOUNT_ID=your_account_id
   ```

---

## 5. Later (Phase 5+)

These are only needed for alerts and advanced features:

| Service | Purpose | How to Get |
|---------|---------|-----------|
| **SendGrid** | Email alerts | https://signup.sendgrid.com/ — 100 emails/day free |
| **Twilio** | SMS alerts | https://www.twilio.com/try-twilio — trial credits included |
| **Glassnode** | Advanced on-chain | https://studio.glassnode.com/ — limited free tier |

---

## Quick Verification

After adding keys, verify they work:

```bash
# Test Alpha Vantage
curl "https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=EUR&to_symbol=USD&apikey=YOUR_KEY" | head -5

# Test Binance (no key needed for public endpoints)
curl "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"

# Test Etherscan
curl "https://api.etherscan.io/api?module=account&action=txlist&address=0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe&startblock=0&endblock=99999999&page=1&offset=1&sort=asc&apikey=YOUR_KEY"
```

## Security Notes

- NEVER commit your `.env` file (it's in `.gitignore`)
- Use read-only API permissions where possible
- Rotate keys periodically
- For production, use a secrets manager (HashiCorp Vault, AWS Secrets Manager)
