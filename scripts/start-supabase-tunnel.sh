#!/usr/bin/env bash
# Script to launch a public HTTPS tunnel to local Supabase
set -e

SERVICE="${1:-api}"

if [ "$SERVICE" = "studio" ]; then
  PORT=54323
  echo "🌐 Starting Cloudflare Tunnel for Supabase Studio (Port $PORT)..."
else
  PORT=54321
  echo "🌐 Starting Cloudflare Tunnel for Supabase API (Port $PORT)..."
fi

cloudflared tunnel --url "http://127.0.0.1:$PORT"
