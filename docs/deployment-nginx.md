# Nginx Deployment

## Goal

Serve the public site through `Nginx` as the front reverse proxy, while keeping:

- `FastAPI` on `127.0.0.1:8000`
- `Next.js` on `127.0.0.1:3000`

This means `Nginx` replaces `Apache` only at the edge layer. It does not replace the `uvicorn` process or the `Next.js` server process.

## Request Flow

`Browser` -> `Nginx` -> `Next.js (3000)`

`Browser` -> `Nginx` -> `FastAPI (8000)` for `/api/*`, `/docs`, `/openapi.json`, and `/health`

## Prerequisites

- A Linux host with `nginx` installed
- The repo checked out on the server
- Python dependencies installed in the repo `.venv`
- Frontend dependencies installed in `web/`
- A process manager for long-running app processes, typically `systemd`, `pm2`, or `supervisor`

## App Processes

### API

Run the API behind localhost only:

```bash
cd /path/to/My-TW-Coverage
./.venv/bin/python -m uvicorn api.app:app --host 127.0.0.1 --port 8000
```

If you are deploying on Windows instead of Linux, use the Windows interpreter path:

```powershell
cd C:\path\to\My-TW-Coverage
.\.venv\Scripts\python.exe -m uvicorn api.app:app --host 127.0.0.1 --port 8000
```

### Frontend

Build and run the frontend behind localhost only:

```bash
cd /path/to/My-TW-Coverage/web
npm install
npm run build
NEXT_PUBLIC_API_BASE_URL=https://example.com npm run start -- --hostname 127.0.0.1 --port 3000
```

If the public API is served on the same domain under `/api`, set:

```bash
NEXT_PUBLIC_API_BASE_URL=https://example.com
```

## Nginx Config

Use [my-tw-coverage.conf](../deploy/nginx/my-tw-coverage.conf) as the starting point.

Typical Linux path:

```bash
sudo cp deploy/nginx/my-tw-coverage.conf /etc/nginx/sites-available/my-tw-coverage.conf
sudo ln -s /etc/nginx/sites-available/my-tw-coverage.conf /etc/nginx/sites-enabled/my-tw-coverage.conf
```

Then replace:

- `example.com`
- `www.example.com`
- Any port, timeout, or cache values you need to tune

Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## TLS

For HTTPS, add certificates after the HTTP config is working. A common path is `certbot`:

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

After TLS is added, keep the same upstream routing:

- `/` -> `127.0.0.1:3000`
- `/api/` -> `127.0.0.1:8000`
- `/health` -> `127.0.0.1:8000`

## Apache to Nginx Switch Notes

If the server is currently using Apache:

1. Stop or disable the Apache site that is binding to ports `80` or `443`.
2. Move the domain binding to `nginx`.
3. Keep the app processes unchanged unless you also want to change process management.

The application code does not need to change for this switch.

## Smoke Tests

After deployment, verify:

```bash
curl -I http://example.com
curl http://example.com/health
curl http://example.com/docs
```

Also confirm:

- company pages render from the frontend
- `/api/companies`
- `/api/companies/{ticker}`
- static assets under `/_next/static/` load without 404s

## Notes

- Keep `Pilot_Reports/` as the source of truth; do not deploy from direct markdown reads in the frontend.
- Rebuild `data/site.db` after report changes that affect public site data.
- `Nginx` is the recommended public reverse proxy for this repo, but the app contract remains `markdown -> SQLite -> API -> Next.js`.
