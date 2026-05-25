# Research Explorer

Search academic papers and books on any topic, sorted by citation count, with an interactive D3.js concept map.

**Data sources:** Semantic Scholar + OpenAlex (both free, no API key needed)

## Run locally

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Deploy to Vercel (easiest)

```bash
npm i -g vercel
vercel
```

## Deploy to Railway

1. Push this folder to a GitHub repo
2. Go to railway.app → New Project → Deploy from GitHub
3. Railway auto-detects Next.js and deploys

## Deploy to any VPS (Ubuntu/Debian)

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Build
npm ci
npm run build

# Run with PM2
npm install -g pm2
pm2 start npm --name "research-explorer" -- start
pm2 save && pm2 startup

# Nginx reverse proxy (optional)
# proxy_pass http://localhost:3000;
```

## Deploy with Docker

```bash
docker build -t research-explorer .
docker run -p 3000:3000 research-explorer
```
