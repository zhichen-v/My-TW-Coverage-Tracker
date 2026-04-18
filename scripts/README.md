# Scripts

本目錄收錄專案的資料維護與建置腳本。它們大致分成四類：

- 報告維護：新增公司、更新財務、套用 enrichment、批次稽核
- 結構化輸出：匯出 JSON、重建站點 SQLite
- 主題與圖譜：重建 themes、graph DB、graph JSON
- 探索工具：discover、wikilink index、共現網路

除非另有說明，請在 repo 根目錄以虛擬環境執行：

```powershell
.\.venv\Scripts\python.exe scripts\<script>.py ...
```

## 常用順序

### 報告內容變更後

```powershell
.\.venv\Scripts\python.exe scripts\export_reports_json.py
.\.venv\Scripts\python.exe scripts\build_site_db.py
```

### `themes/` 或主題對應關係變更後

```powershell
.\.venv\Scripts\python.exe scripts\build_graph_db.py
```

### wikilink 明顯變更後

```powershell
.\.venv\Scripts\python.exe scripts\build_wikilink_index.py
```

## 腳本說明

### `add_ticker.py`

新增一份新的公司報告 Markdown，建立基礎 metadata、placeholder 段落與財務表。

用途：
- 在 `Pilot_Reports/<sector>/` 建立新檔
- 若未指定 `--sector`，會先透過 `yfinance` 嘗試推斷產業
- 會一併抓取基本財務資料與估值快照

用法：

```powershell
.\.venv\Scripts\python.exe scripts\add_ticker.py 2330 台積電
.\.venv\Scripts\python.exe scripts\add_ticker.py 2330 台積電 --sector Semiconductors
```

輸出：
- 新的 `Pilot_Reports/<sector>/<ticker>_<name>.md`

常見後續：
- 再用 `update_enrichment.py` 套入正式 business / supply chain / customer-supplier 內容

### `update_financials.py`

重新抓取財務報表，只替換報告中的財務區段與市值/EV metadata，不動 enrichment 內容。

用途：
- 更新年度 3 年、季度 4 季的財務表
- 更新估值表
- 更新 `market cap` 與 `enterprise value`

支援 scope：
- 不帶參數：全部 ticker
- 直接給 ticker：指定公司
- `--batch <batch>`
- `--sector <sector>`
- `--dry-run`

用法：

```powershell
.\.venv\Scripts\python.exe scripts\update_financials.py
.\.venv\Scripts\python.exe scripts\update_financials.py 2330 2317
.\.venv\Scripts\python.exe scripts\update_financials.py --batch 101
.\.venv\Scripts\python.exe scripts\update_financials.py --sector Semiconductors
.\.venv\Scripts\python.exe scripts\update_financials.py --dry-run 2330
```

注意：
- 主要依賴 `yfinance`
- 財務單位為百萬新台幣
- 若報表原文已改動財務區標題格式，替換可能失敗，需先確認源檔結構

### `update_valuation.py`

只更新估值表與市值/EV metadata，速度比 `update_financials.py` 快。

用途：
- 更新 `P/E (TTM)`、`Forward P/E`、`P/S`、`P/B`、`EV/EBITDA`
- 不重抓完整財報
- 保留既有財務表與 enrichment

用法：

```powershell
.\.venv\Scripts\python.exe scripts\update_valuation.py
.\.venv\Scripts\python.exe scripts\update_valuation.py 2330
.\.venv\Scripts\python.exe scripts\update_valuation.py --batch 101
.\.venv\Scripts\python.exe scripts\update_valuation.py --sector Semiconductors
.\.venv\Scripts\python.exe scripts\update_valuation.py --dry-run 2330
```

適合：
- 想快速刷新估值倍數，但不需要重跑整份財報區塊時

### `update_enrichment.py`

將外部整理好的 enrichment JSON 套用回報告，更新公司介紹、供應鏈、客戶/供應商段落。

用途：
- 套用研究後整理出的繁中內容
- 保留 metadata 與財務區
- 套用後會做 wikilink normalization

必要參數：
- `--data <json>`

支援 scope：
- 不帶 scope：套用 JSON 中全部 ticker
- 單一或多個 ticker
- `--batch <batch>`
- `--sector <sector>`

用法：

```powershell
.\.venv\Scripts\python.exe scripts\update_enrichment.py --data enrichment.json
.\.venv\Scripts\python.exe scripts\update_enrichment.py --data enrichment.json 2330
.\.venv\Scripts\python.exe scripts\update_enrichment.py --data enrichment.json --batch 101
```

JSON 格式：

```json
{
  "2330": {
    "desc": "繁體中文公司介紹，內含 [[wikilinks]]。",
    "supply_chain": "**上游：**\n- ...\n**中游：**\n- ...\n**下游：**\n- ...",
    "cust": "### 客戶\n- ...\n\n### 供應商\n- ..."
  }
}
```

注意：
- enrichment 內容應以繁體中文撰寫
- 請避免 placeholder、泛稱 wikilink、過薄段落

### `audit_batch.py`

針對 `task.md` 中的 batch 設定做品質稽核。

檢查項目：
- wikilink 數量是否足夠
- 是否殘留 placeholder
- 是否混入英文描述
- metadata 是否完整
- 供應鏈與客戶/供應商段落是否過薄

用法：

```powershell
.\.venv\Scripts\python.exe scripts\audit_batch.py 101 -v
.\.venv\Scripts\python.exe scripts\audit_batch.py --all -v
```

適合：
- enrichment 或批次修改完成後做收尾檢查

### `export_reports_json.py`

將 `Pilot_Reports/` 匯出成鏡像式的 `Pilot_Reports_JSON/` 結構化 JSON。

用途：
- 供 API / frontend 使用 structured content
- 將段落、清單、表格、inline segments 拆成 JSON

用法：

```powershell
.\.venv\Scripts\python.exe scripts\export_reports_json.py
.\.venv\Scripts\python.exe scripts\export_reports_json.py --output-root tmp\\reports_json
```

輸出：
- 預設寫入 `Pilot_Reports_JSON/`

何時要跑：
- 報告內文有變動且前端/API 需要最新 structured detail 時

### `build_site_db.py`

從 `Pilot_Reports/` 重建站點查詢用的 `data/site.db`。

用途：
- 產出公司清單、搜尋、wikilink 統計所需 SQLite
- 保持 API / 前端不必每次重解析全部 Markdown

用法：

```powershell
.\.venv\Scripts\python.exe scripts\build_site_db.py
.\.venv\Scripts\python.exe scripts\build_site_db.py --db-path data\\site.db
```

輸出：
- 預設寫入 `data/site.db`

注意：
- `data/site.db` 是衍生物，不是 source of truth
- 若出現 ingest warnings，應修報告源檔，不要手改 DB

### `build_themes.py`

依 `themes/theme_definitions.json` 與報告中的 wikilink 重建 `themes/*.md`。

用途：
- 建立主題投資頁
- 依 wikilink 命中公司並分成 upstream / midstream / downstream / related
- 自動更新 `themes/README.md`

用法：

```powershell
.\.venv\Scripts\python.exe scripts\build_themes.py
.\.venv\Scripts\python.exe scripts\build_themes.py --list
.\.venv\Scripts\python.exe scripts\build_themes.py CPO
```

適合：
- 更新主題定義後
- `discover.py --apply --rebuild` 後重新整理主題頁面

### `build_graph_db.py`

建立主題圖譜用的資料庫，並可同步刷新圖譜 JSON 輸出。

用途：
- 產出 `data/graph.db`
- 預設同步輸出 `graph/theme_graph.json` 與 `graph/theme_company_map.json`
- 作為 `/api/graph` 與 `web/graph` 的資料來源

用法：

```powershell
.\.venv\Scripts\python.exe scripts\build_graph_db.py
.\.venv\Scripts\python.exe scripts\build_graph_db.py --skip-json
.\.venv\Scripts\python.exe scripts\build_graph_db.py --db-path data\\graph.db
```

參數：
- `--db-path <path>`: 改 graph DB 輸出位置
- `--graph-output <path>`: 改 graph JSON 輸出位置
- `--company-output <path>`: 改 company map JSON 輸出位置
- `--skip-json`: 只寫 DB，不寫 JSON

### `build_theme_graph.py`

只輸出圖譜 JSON，不建立 SQLite graph DB。

用途：
- 需要快速重建 `graph/theme_graph.json` / `graph/theme_company_map.json`
- 適合靜態檢視或除錯 JSON 輸出

用法：

```powershell
.\.venv\Scripts\python.exe scripts\build_theme_graph.py
.\.venv\Scripts\python.exe scripts\build_theme_graph.py --output graph\\theme_graph.json
.\.venv\Scripts\python.exe scripts\build_theme_graph.py --company-output graph\\theme_company_map.json
```

### `build_wikilink_index.py`

重建根目錄的 `WIKILINKS.md`。

用途：
- 掃描所有報告中的 wikilink
- 依技術、材料、應用、國際公司、台灣公司分類

用法：

```powershell
.\.venv\Scripts\python.exe scripts\build_wikilink_index.py
```

何時要跑：
- enrichment 或 wikilink 覆蓋有明顯變動時

### `discover.py`

以 buzzword 反查相關公司，並可選擇把裸字串補成 wikilink。

用途：
- 搜尋全站報告中與某個主題、材料、技術有關的公司
- 可把未加 `[[...]]` 的字詞補上 wikilink
- 可選擇自動重建 themes / network / wikilink index

用法：

```powershell
.\.venv\Scripts\python.exe scripts\discover.py "CPO"
.\.venv\Scripts\python.exe scripts\discover.py "CPO" --smart
.\.venv\Scripts\python.exe scripts\discover.py "CPO" --sector Semiconductors
.\.venv\Scripts\python.exe scripts\discover.py "CPO" --sectors "Semiconductors,Electronic Components"
.\.venv\Scripts\python.exe scripts\discover.py "CPO" --apply
.\.venv\Scripts\python.exe scripts\discover.py "CPO" --apply --rebuild
```

注意：
- `--smart` 會縮小搜尋 sector，速度較快，但可能漏掉跨產業結果
- `--apply` 只會改財務區之前的文字，避免碰 financial tables

### `build_network.py`

建立舊版 wikilink 共現網路的 JSON 與 HTML 視覺化。

用途：
- 掃描報告內 wikilink 共現
- 寫出 `network/graph_data.json`
- 寫出 `network/index.html`

用法：

```powershell
.\.venv\Scripts\python.exe scripts\build_network.py
.\.venv\Scripts\python.exe scripts\build_network.py --min-weight 10
.\.venv\Scripts\python.exe scripts\build_network.py --top 100
```

備註：
- 這是獨立於目前 `graph.db` API 流程之外的舊型探索工具

## 內部模組

以下腳本主要作為其他腳本的共用模組，一般不直接當 CLI 使用：

### `report_parser.py`

共用 Markdown 解析器，負責：
- 拆分 metadata 與各 section
- 將 paragraph / list / table 轉成結構化 blocks
- 將 inline `strong` / `wikilink` / `text` token 化
- 提供 `export_reports_json.py` 與 `build_site_db.py` 共用的解析邏輯

### `graph_builder.py`

主題圖譜建置核心，供：
- `build_graph_db.py`
- `build_theme_graph.py`

### `utils.py`

共用工具函式，包含：
- ticker 檔案搜尋
- batch / scope 解析
- wikilink normalization
- wikilink 類別判定
- 估值表組裝
- metadata 更新

## 建議搭配命令

### 只更新報告內容，不動網站

```powershell
.\.venv\Scripts\python.exe scripts\update_enrichment.py --data enrichment.json 2330
```

### 更新報告後同步刷新網站資料

```powershell
.\.venv\Scripts\python.exe scripts\update_enrichment.py --data enrichment.json 2330
.\.venv\Scripts\python.exe scripts\export_reports_json.py
.\.venv\Scripts\python.exe scripts\build_site_db.py
```

### 主題資料更新後同步刷新 graph API 輸出

```powershell
.\.venv\Scripts\python.exe scripts\build_themes.py
.\.venv\Scripts\python.exe scripts\build_graph_db.py
```
