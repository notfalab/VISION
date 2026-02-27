#!/bin/bash
###############################################################################
# VISION — DigitalOcean Droplet Deployment Script
#
# Prerequisites:
#   - Ubuntu 22.04+ droplet (4GB RAM recommended)
#   - SSH access configured
#
# Usage:
#   1. SSH into your droplet: ssh root@YOUR_DROPLET_IP
#   2. Clone the repo: git clone YOUR_REPO_URL /opt/vision
#   3. Run this script: cd /opt/vision && bash deploy.sh
###############################################################################

set -e

echo "🚀 VISION — Deploying to DigitalOcean..."

# ── 1. Install Docker (if not installed) ──
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    apt-get update
    apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    systemctl enable docker
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# ── 2. Create .env.prod from .env.template ──
if [ ! -f .env.prod ]; then
    if [ -f .env ]; then
        cp .env .env.prod
    elif [ -f .env.template ]; then
        cp .env.template .env.prod
    else
        echo "❌ No .env or .env.template found. Create one first."
        exit 1
    fi
    # Update production settings
    sed -i 's/APP_ENV=development/APP_ENV=production/' .env.prod
    sed -i 's/DEBUG=true/DEBUG=false/' .env.prod
    sed -i 's/POSTGRES_HOST=localhost/POSTGRES_HOST=postgres/' .env.prod
    sed -i 's/REDIS_HOST=localhost/REDIS_HOST=redis/' .env.prod
    sed -i 's/REDIS_PORT=6380/REDIS_PORT=6379/' .env.prod
    echo "✅ Created .env.prod"
    echo "⚠️  IMPORTANT: Edit .env.prod to set your API keys and passwords!"
    echo "    nano .env.prod"
fi

# ── 3. Create required directories ──
mkdir -p certbot/www certbot/conf

# ── 4. Build and start services ──
echo "🔨 Building Docker images (this may take a few minutes)..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "🚀 Starting services..."
docker compose -f docker-compose.prod.yml up -d

# ── 5. Wait for services ──
echo "⏳ Waiting for services to start..."
sleep 15

# ── 6. Run database migrations ──
echo "🗄️ Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T api python -c "
from backend.app.database import engine
from backend.app.models import Base
import asyncio
async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('Tables created')
asyncio.run(init())
" 2>/dev/null || echo "⚠️  DB migrations skipped (will auto-create on first request)"

# ── 7. Health check ──
echo "🏥 Running health check..."
sleep 5
if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ API is healthy!"
else
    echo "⚠️  API not responding yet. Check logs: docker compose -f docker-compose.prod.yml logs api"
fi

# ── 8. Enable auto-restart on reboot ──
systemctl enable docker

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ VISION deployed successfully!"
echo ""
DROPLET_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_IP")
echo "📊 Dashboard:  http://$DROPLET_IP"
echo "📡 API Docs:   http://$DROPLET_IP/docs"
echo "🤖 Telegram:   Signals sent every 5 minutes"
echo ""
echo "📋 Useful commands:"
echo "  docker compose -f docker-compose.prod.yml logs -f      # View all logs"
echo "  docker compose -f docker-compose.prod.yml logs -f api   # API logs only"
echo "  docker compose -f docker-compose.prod.yml ps            # Service status"
echo "  docker compose -f docker-compose.prod.yml restart        # Restart all"
echo "  docker compose -f docker-compose.prod.yml down           # Stop all"
echo ""
echo "🔒 To set up SSL (requires domain):"
echo "  bash setup-ssl.sh YOUR_DOMAIN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
