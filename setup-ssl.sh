#!/bin/bash
###############################################################################
# VISION — SSL Setup with Let's Encrypt
#
# Usage: bash setup-ssl.sh yourdomain.com
###############################################################################

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
    echo "Usage: bash setup-ssl.sh yourdomain.com"
    exit 1
fi

echo "🔒 Setting up SSL for $DOMAIN..."

# Update nginx config with domain
sed -i "s/YOUR_DOMAIN/$DOMAIN/g" nginx/conf.d/default.conf

# Start nginx for ACME challenge
docker compose -f docker-compose.prod.yml up -d nginx

# Get certificate
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
    --webroot --webroot-path=/var/www/certbot \
    --email admin@$DOMAIN --agree-tos --no-eff-email \
    -d $DOMAIN

# Enable SSL in nginx config
sed -i 's/# listen 443 ssl;/listen 443 ssl;/' nginx/conf.d/default.conf
sed -i 's/# ssl_certificate/ssl_certificate/' nginx/conf.d/default.conf

# Uncomment HTTPS redirect block
sed -i '/# server {/,/# }/s/# //' nginx/conf.d/default.conf

# Restart nginx
docker compose -f docker-compose.prod.yml restart nginx

echo "✅ SSL configured for $DOMAIN"
echo "🌐 https://$DOMAIN"
