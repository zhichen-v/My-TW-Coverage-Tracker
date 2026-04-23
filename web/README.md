# Web

## Current Routes

- `/` is the public homepage.
- `/app` reuses the existing coverage app homepage client.
- `/companies/[ticker]` and `/graph` remain available for the current deployment.
- `/app/companies/[ticker]` and `/app/graph` are route aliases for the planned app-prefixed host or route split.

`web/` 是本專案的 Next.js App Router 前端，主要讀取根目錄 API 提供的公司列表、公司詳情與主題圖譜資料。

## 前置條件

先在 repo 根目錄準備 Python 端資料與 API，再啟動前端。

### 1. 安裝前端依賴

```powershell
cd web
npm install
```

### 2. 從 repo 根目錄啟動 API

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.app:app --reload
```

建議先確認：

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

### 3. 啟動前端

```powershell
cd web
npm run dev
```

若 API 不在預設的 `http://127.0.0.1:8000`，先設定：

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
```

## 資料來源

前端本身不直接解析 `Pilot_Reports/`，而是依賴下列衍生資料：

- 公司列表與詳情：`Pilot_Reports/` -> `scripts/build_site_db.py` -> `data/site.db` -> `api/`
- 結構化詳情內容：`Pilot_Reports/` -> `scripts/export_reports_json.py` -> `Pilot_Reports_JSON/` -> `api/`
- 主題圖譜：`themes/` + `Pilot_Reports/` -> `scripts/build_graph_db.py` -> `data/graph.db` -> `api/graph`

若畫面顯示資料與報告原文不一致，通常應該先回 repo 根目錄重建對應資料：

```powershell
.\.venv\Scripts\python.exe scripts\export_reports_json.py
.\.venv\Scripts\python.exe scripts\build_site_db.py
.\.venv\Scripts\python.exe scripts\build_graph_db.py
```

## Build 檢查

完成有意義的前端修改後，請在 `web/` 下執行：

```powershell
npm run build
```

## 相關文件

- [../README.md](../README.md): 專案總覽
- [../scripts/README.md](../scripts/README.md): 資料建置與維護腳本說明
- [../docs/site-architecture.md](../docs/site-architecture.md): 站點資料流與架構
- [../docs/deployment-nginx.md](../docs/deployment-nginx.md): `Nginx` 部署方式
