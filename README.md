# My-TW-Coverage Tracker

以 `Pilot_Reports/` Markdown 報告為核心的台股研究資料庫，涵蓋台灣上市櫃公司基本面、供應鏈、客戶與供應商關係、財務表與 wikilink 關聯資料。專案目前同時提供：

- 報告原始資料：`Pilot_Reports/`
- 由 Markdown 建出的結構化 SQLite：`data/site.db`
- 唯讀 FastAPI：`api/`
- Next.js 前端：`web/`

目前資料量依 repo 現況為 `1,734` 份公司報告、`98` 個 sector 資料夾。

## 資料流

目前網站資料流如下：

```text
Pilot_Reports/ -> scripts/build_site_db.py -> data/site.db -> api/ -> web/
```

原始資料來源永遠是 `Pilot_Reports/`，不要直接把 `data/site.db` 視為 source of truth。

## 專案重點

- 報告內容以繁體中文撰寫。
- 財務表屬於保留區塊，應透過腳本更新，不建議手改。
- wikilink 用於連結公司、技術、材料、製程等特定 proper nouns。
- 若調整報告內容並影響公開站資料，應重建 `data/site.db`。

## 環境需求

本專案預設使用 repo 內的虛擬環境：

```powershell
uv pip install -r requirements.txt
```

Windows 下請優先使用：

```powershell
.\.venv\Scripts\python.exe
```

`requirements.txt` 目前包含：

- `yfinance`
- `pandas`
- `tabulate`
- `fastapi`
- `uvicorn`

## 快速開始

### 1. 安裝 Python 依賴

```powershell
uv pip install -r requirements.txt
```

### 2. 重建站點資料庫

當 `Pilot_Reports/` 有變動，先重建 SQLite：

```powershell
.\.venv\Scripts\python.exe scripts\build_site_db.py
```

### 3. 啟動 API

```powershell
.\.venv\Scripts\python.exe -m uvicorn api.app:app --reload
```

Smoke test：

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

### 4. 啟動前端

```powershell
cd web
npm install
npm run dev
```

若 API 不在預設位址，設定：

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
```

前端有實質修改時，結束前請執行：

```powershell
npm run build
```

## 常用腳本

### 新增公司報告

```powershell
.\.venv\Scripts\python.exe scripts\add_ticker.py <ticker> <name> [--sector <sector>]
```

### 更新財務資料

```powershell
.\.venv\Scripts\python.exe scripts\update_financials.py [scope]
```

### 只更新估值資料

```powershell
.\.venv\Scripts\python.exe scripts\update_valuation.py [scope]
```

### 套用 enrichment JSON

```powershell
.\.venv\Scripts\python.exe scripts\update_enrichment.py --data <json> [scope]
```

### 稽核報告品質

```powershell
.\.venv\Scripts\python.exe scripts\audit_batch.py <batch> -v
.\.venv\Scripts\python.exe scripts\audit_batch.py --all -v
```

### 重建 wikilink 索引

```powershell
.\.venv\Scripts\python.exe scripts\build_wikilink_index.py
```

### 主題 / 網路 / 搜尋輔助

```powershell
.\.venv\Scripts\python.exe scripts\discover.py "<buzzword>" [--smart] [--apply] [--rebuild]
.\.venv\Scripts\python.exe scripts\build_themes.py
.\.venv\Scripts\python.exe scripts\build_network.py
```

## API 概覽

目前 FastAPI 為唯讀介面，主要端點包含：

- `GET /health`
- `GET /api/sectors`
- `GET /api/companies`
- `GET /api/companies/{ticker}`
- `GET /api/reports/{report_id}`
- `GET /api/wikilinks`
- `GET /api/wikilinks/{name}`
- `GET /api/search?q=...`

補充說明：

- `ticker` 長期不保證絕對唯一，對外識別應優先考慮 `report_id`。
- API 相容性應盡量維持，避免未同步前端就破壞回傳格式。

## 目錄結構

```text
.
|-- Pilot_Reports/          # 原始公司報告，source of truth
|-- data/site.db            # 由 Markdown 建出的網站資料庫
|-- api/                    # FastAPI 唯讀 API
|-- web/                    # Next.js 前端
|-- scripts/                # 資料維護與建置腳本
|-- docs/                   # API 與站點架構文件
|-- themes/                 # 主題輸出
|-- network/                # wikilink network 輸出
|-- task.md                 # 批次與進度記錄
|-- WIKILINKS.md            # wikilink 索引
|-- AGENTS.md               # repo 操作規範
`-- project-skills/         # 專案本地技能
```

## 編輯與維護原則

- 先確認檔名中的 ticker 與公司身份一致，再研究或修改內容。
- enrichment 內容使用繁體中文。
- wikilink 僅用於特定 proper nouns，例如公司、技術、材料、製程。
- enriched report 至少保留 8 個 proper-noun wikilinks。
- 不要在最終內容留下 placeholder 或泛稱方括號詞。
- 供應鏈與客戶/供應商段落應分角色、類別或業務線整理，不要單行傾倒。
- 若 wikilink 覆蓋面有明顯變動，需重建 `WIKILINKS.md`。
- 有實質 repo 更新時，請同步追加 `CHANGELOG.md`。

## 相關文件

- [AGENTS.md](AGENTS.md)
- [docs/site-architecture.md](docs/site-architecture.md)
- [docs/api.md](docs/api.md)
- [web/README.md](web/README.md)

## License

MIT License。詳見 [LICENSE](LICENSE)。

## ## 致謝


本專案基於 [Timeverse/My-TW-Coverage](https://github.com/Timeverse/My-TW-Coverage) 框架開發。


