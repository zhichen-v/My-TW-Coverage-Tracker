# Web

Next.js frontend for the public TW coverage site.

## Run

Install dependencies:

```powershell
npm install
```

Start the API from the repo root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.app:app --reload
```

Start the frontend:

```powershell
cd web
npm run dev
```

If the API is not running on `http://127.0.0.1:8000`, set:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
```

## Production

For public deployment behind `Nginx`, use the repo deployment guide:

- [../docs/deployment-nginx.md](../docs/deployment-nginx.md)
