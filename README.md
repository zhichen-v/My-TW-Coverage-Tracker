# TW-Stocks-Tracker

以 `Pilot_Reports/` 下的台股公司研究 Markdown 為資料來源，產出可供查詢、瀏覽與視覺化使用的多種衍生資料與站點元件。

目前專案的主要資料流如下：

```text
Pilot_Reports/ -> scripts/export_reports_json.py -> Pilot_Reports_JSON/
Pilot_Reports/ -> scripts/build_site_db.py -> data/site.db -> api/ -> web/
themes/ + Pilot_Reports/ -> scripts/build_graph_db.py -> data/graph.db -> api/ -> web/graph
```

## 目錄重點

- `Pilot_Reports/`: 公司報告 Markdown，專案 source of truth
- `Pilot_Reports_JSON/`: 由腳本匯出的結構化 JSON 鏡像
- `scripts/`: 報告維護、資料建置、主題/圖譜輸出的腳本
- `api/`: 讀取 `data/site.db` 與 `data/graph.db` 的 FastAPI
- `web/`: Next.js 前端
- `themes/`: 主題投資頁面與主題定義
- `graph/`: 主題圖譜 JSON 與檢視資產
- `docs/`: API、站點架構、部署文件

## 環境

先在 repo 根目錄使用虛擬環境：

```powershell
uv pip install -r requirements.txt
```

Windows 建議使用：

```powershell
.\.venv\Scripts\python.exe
```

`web/` 前端依賴則在該目錄下安裝：

```powershell
cd web
npm install
```

## 常用工作流程

### 1. 維護報告內容

- 新增新公司報告：

```powershell
.\.venv\Scripts\python.exe scripts\add_ticker.py <ticker> <name> [--sector <sector>]
```

- 更新財務表：

```powershell
.\.venv\Scripts\python.exe scripts\update_financials.py [scope]
```

- 只更新估值表：

```powershell
.\.venv\Scripts\python.exe scripts\update_valuation.py [scope]
```

- 套用 enrichment JSON：

```powershell
.\.venv\Scripts\python.exe scripts\update_enrichment.py --data <json> [scope]
```

- 稽核批次品質：

```powershell
.\.venv\Scripts\python.exe scripts\audit_batch.py <batch> -v
.\.venv\Scripts\python.exe scripts\audit_batch.py --all -v
```

### 2. 重建衍生資料

- 匯出結構化 JSON：

```powershell
.\.venv\Scripts\python.exe scripts\export_reports_json.py
```

- 重建站點資料庫：

```powershell
.\.venv\Scripts\python.exe scripts\build_site_db.py
```

- 重建主題圖譜資料庫與 JSON：

```powershell
.\.venv\Scripts\python.exe scripts\build_graph_db.py
```

- 重建 wikilink 索引：

```powershell
.\.venv\Scripts\python.exe scripts\build_wikilink_index.py
```

### 3. 主題與網路探索

- 找出某個 buzzword 相關公司並可選擇回填 wikilink：

```powershell
.\.venv\Scripts\python.exe scripts\discover.py "<buzzword>" [--smart] [--apply] [--rebuild]
```

- 依 `themes/theme_definitions.json` 重建 `themes/*.md`：

```powershell
.\.venv\Scripts\python.exe scripts\build_themes.py
```

- 產出舊版 wikilink 共現網路：

```powershell
.\.venv\Scripts\python.exe scripts\build_network.py
```

## 啟動服務

### API

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.app:app --reload
```

Smoke test：

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

### Frontend

```powershell
cd web
npm run dev
```

若 API 不在預設位置，先設定：

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
```

完成較大的前端修改後請執行：

```powershell
cd web
npm run build
```

## README 導覽

- [scripts/README.md](scripts/README.md): `scripts/` 目錄完整使用說明
- [web/README.md](web/README.md): 前端執行與資料串接說明
- [docs/api.md](docs/api.md): API 端點與回應格式
- [docs/site-architecture.md](docs/site-architecture.md): 站點資料管線與架構
- [docs/deployment-nginx.md](docs/deployment-nginx.md): 反向代理部署方式
- [AGENTS.md](AGENTS.md): 專案維護規則與工作慣例

## 維護原則

- `Pilot_Reports/` 才是資料來源，不要直接手改 `data/site.db`、`data/graph.db` 或 `Pilot_Reports_JSON/`
- 報告內容異動後，依影響範圍重跑 `export_reports_json.py`、`build_site_db.py`、`build_graph_db.py`
- enrichment 內容以繁體中文撰寫
- 財務表請用腳本重建，不要手改
- wikilink 有明顯變動時，請一併更新 `WIKILINKS.md`

## License

MIT，見 [LICENSE](LICENSE)。

## Acknowledge

本專案參考自 [Timeverse/My-TW-Coverage](https://github.com/Timeverse/My-TW-Coverage)。
