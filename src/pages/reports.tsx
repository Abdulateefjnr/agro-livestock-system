import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxesStacked,
  faCalendarDays,
  faChartColumn,
  faCow,
  faDownload,
  faMoneyBillTrendUp,
  faPrint,
  faReceipt,
  faRotateRight,
  faSeedling,
} from "@fortawesome/free-solid-svg-icons";
import AppSidebar from "../components/AppSidebar";
import { formatCurrency, fromNaira, useCurrency } from "../lib/currency";
import {
  fetchFarms,
  fetchRecords,
  getApiErrorMessage,
  RECORDS_CHANGED_EVENT,
  RECORDS_STORAGE_KEY,
} from "../lib/records";
import type { Farm, FarmRecord, RecordType } from "../lib/records";

type Period = "this-month" | "last-month" | "this-year" | "all-time" | "custom";
type ReportRecord = FarmRecord & { reportType: RecordType };

const recordTypes: RecordType[] = ["livestock", "crops", "inventory", "sales", "expenses"];
const reportTypeLabels: Record<RecordType, string> = {
  livestock: "Livestock",
  crops: "Crops",
  inventory: "Inventory",
  sales: "Sales",
  expenses: "Expenses",
};

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialDateRange() {
  const today = new Date();
  return {
    start: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: toInputDate(today),
  };
}

function getPeriodRange(period: Period) {
  const today = new Date();
  const end = toInputDate(today);
  switch (period) {
    case "this-month":
      return { start: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)), end };
    case "last-month":
      return {
        start: toInputDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        end: toInputDate(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case "this-year":
      return { start: `${today.getFullYear()}-01-01`, end };
    case "all-time":
      return { start: "", end: "" };
    case "custom":
      return initialDateRange();
  }
}

function getRecordDate(record: ReportRecord) {
  return (record.date ?? record.createdAt).slice(0, 10);
}

function getCategory(record: ReportRecord) {
  if (record.reportType === "livestock") return record.species ?? "Unspecified";
  if (record.reportType === "crops") return record.name ?? "Unspecified";
  if (record.reportType === "inventory") return record.category ?? "Unspecified";
  return record.description ?? "Unspecified";
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function Reports() {
  const currency = useCurrency();
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [period, setPeriod] = useState<Period>("this-month");
  const [dateRange, setDateRange] = useState(initialDateRange);
  const [farmId, setFarmId] = useState("");
  const [recordType, setRecordType] = useState<RecordType | "all">("all");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadingRef = useRef(false);

  const loadReports = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [nextFarms, ...recordGroups] = await Promise.all([
        fetchFarms(),
        ...recordTypes.map((type) => fetchRecords(type)),
      ]);
      setFarms(nextFarms);
      setRecords(
        recordGroups.flatMap((group, index) =>
          group.map((record) => ({ ...record, reportType: recordTypes[index] })),
        ),
      );
      setError("");
    } catch (loadError: unknown) {
      setError(getApiErrorMessage(loadError, "Unable to load reports."));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === RECORDS_STORAGE_KEY) void loadReports();
    };
    const initialLoad = window.setTimeout(() => void loadReports(), 0);
    const refreshInterval = window.setInterval(() => void loadReports(), 10_000);
    window.addEventListener(RECORDS_CHANGED_EVENT, loadReports);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(refreshInterval);
      window.removeEventListener(RECORDS_CHANGED_EVENT, loadReports);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [loadReports]);

  const categories = useMemo(() => {
    const options = new Set(
      records
        .filter((record) => recordType === "all" || record.reportType === recordType)
        .map(getCategory),
    );
    return [...options].sort((a, b) => a.localeCompare(b));
  }, [records, recordType]);

  const selectedCategory = categories.includes(category) ? category : "";

  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const date = getRecordDate(record);
        if (dateRange.start && date < dateRange.start) return false;
        if (dateRange.end && date > dateRange.end) return false;
        if (farmId && record.farmId !== farmId) return false;
        if (recordType !== "all" && record.reportType !== recordType) return false;
        if (selectedCategory && getCategory(record) !== selectedCategory) return false;
        return true;
      }),
    [records, dateRange, farmId, recordType, selectedCategory],
  );

  const totals = useMemo(() => {
    const livestock = filteredRecords.filter((record) => record.reportType === "livestock");
    const crops = filteredRecords.filter((record) => record.reportType === "crops");
    const inventory = filteredRecords.filter((record) => record.reportType === "inventory");
    const sales = filteredRecords.filter((record) => record.reportType === "sales");
    const expenses = filteredRecords.filter((record) => record.reportType === "expenses");
    return {
      livestockCount: livestock.length,
      breedCount: new Set(livestock.map((record) => record.species).filter(Boolean)).size,
      activeFields: crops.filter((record) => record.status === "active").length,
      plantedHectares: crops
        .filter((record) => record.status === "active")
        .reduce((sum, record) => sum + (record.plantedHectares ?? 0), 0),
      inventoryCount: inventory.length,
      lowStockCount: inventory.filter(
        (record) => (record.quantity ?? 0) <= (record.reorderLevel ?? 0),
      ).length,
      revenue: sales.reduce((sum, record) => sum + (record.amount ?? 0), 0),
      expenses: expenses.reduce((sum, record) => sum + (record.amount ?? 0), 0),
    };
  }, [filteredRecords]);

  const profit = totals.revenue - totals.expenses;

  const chartData = useMemo(() => {
    const buckets = new Map<string, { sales: number; expenses: number }>();
    filteredRecords
      .filter((record) => record.reportType === "sales" || record.reportType === "expenses")
      .forEach((record) => {
        const key = getRecordDate(record).slice(0, 7);
        const bucket = buckets.get(key) ?? { sales: 0, expenses: 0 };
        if (record.reportType === "sales") bucket.sales += record.amount ?? 0;
        else bucket.expenses += record.amount ?? 0;
        buckets.set(key, bucket);
      });
    return [...buckets.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, values]) => ({
        key,
        label: new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format(
          new Date(`${key}-01T00:00:00`),
        ),
        ...values,
      }));
  }, [filteredRecords]);

  const chartMaximum = Math.max(1, ...chartData.flatMap(({ sales, expenses }) => [sales, expenses]));
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  const reportRows = useMemo(
    () =>
      [...filteredRecords].sort((first, second) =>
        getRecordDate(second).localeCompare(getRecordDate(first)),
      ),
    [filteredRecords],
  );

  const exportCsv = () => {
    const header = ["Date", "Report type", "Record", "Category", "Farm", "Details", `Amount (${currency})`];
    const lines = reportRows.map((record) => {
      const details =
        record.reportType === "livestock"
          ? `Tag: ${record.tagId || "Not recorded"}`
          : record.reportType === "crops"
            ? `${record.status ?? "Status not recorded"}; ${formatNumber(record.plantedHectares ?? 0)} ha`
            : record.reportType === "inventory"
              ? `${formatNumber(record.quantity ?? 0)} ${record.unit ?? ""}; reorder at ${formatNumber(record.reorderLevel ?? 0)}`
              : record.description ?? "";
      const farmName = farms.find((farm) => farm._id === record.farmId)?.name ?? "No farm assigned";
      return [
        getRecordDate(record),
        reportTypeLabels[record.reportType],
        record.name ?? record.description ?? "—",
        getCategory(record),
        farmName,
        details,
        record.amount === undefined ? "" : fromNaira(record.amount, currency),
      ].map(csvCell).join(",");
    });
    const blob = new Blob(["\uFEFF", header.map(csvCell).join(","), "\r\n", lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agroliv-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const setSelectedPeriod = (nextPeriod: Period) => {
    setPeriod(nextPeriod);
    if (nextPeriod !== "custom") setDateRange(getPeriodRange(nextPeriod));
  };

  return (
    <main className="dashboard">
      <AppSidebar />
      <section className="page">
        <div className="reports-page">
          <header className="reports-header">
            <div className="reports-header-icon"><FontAwesomeIcon icon={faChartColumn} aria-hidden="true" /></div>
            <div>
              <h1>Your reports</h1>
              <p>Insights from records saved to your account.</p>
            </div>
            <div className="reports-header-actions">
              <button type="button" className="reports-button reports-refresh" onClick={() => void loadReports()} disabled={loading}>
                <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" /> Refresh
              </button>
              <button type="button" className="reports-button" onClick={exportCsv} disabled={loading || reportRows.length === 0}>
                <FontAwesomeIcon icon={faDownload} aria-hidden="true" /> Export CSV
              </button>
              <button type="button" className="reports-button reports-button-primary" onClick={() => window.print()}>
                <FontAwesomeIcon icon={faPrint} aria-hidden="true" /> Print / PDF
              </button>
            </div>
          </header>

          {error && (
            <div className="reports-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => void loadReports()}>Try again</button>
            </div>
          )}

          <section className="reports-filters" aria-label="Report filters">
            <label htmlFor="reports-period">
              <span><FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" /> Period</span>
              <select id="reports-period" name="period" value={period} onChange={(event) => setSelectedPeriod(event.target.value as Period)}>
                <option value="this-month">This month</option>
                <option value="last-month">Last month</option>
                <option value="this-year">This year</option>
                <option value="all-time">All time</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            <label htmlFor="reports-start-date">
              <span>From</span>
              <input id="reports-start-date" name="startDate" type="date" value={dateRange.start} disabled={period !== "custom"} onChange={(event) => setDateRange((range) => ({ ...range, start: event.target.value }))} />
            </label>
            <label htmlFor="reports-end-date">
              <span>To</span>
              <input id="reports-end-date" name="endDate" type="date" value={dateRange.end} disabled={period !== "custom"} onChange={(event) => setDateRange((range) => ({ ...range, end: event.target.value }))} />
            </label>
            <label htmlFor="reports-farm">
              <span>Farm</span>
              <select id="reports-farm" name="farmId" value={farmId} onChange={(event) => setFarmId(event.target.value)}>
                <option value="">All farms</option>
                {farms.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}
              </select>
            </label>
            <label htmlFor="reports-type">
              <span>Report</span>
              <select id="reports-type" name="reportType" value={recordType} onChange={(event) => { setRecordType(event.target.value as RecordType | "all"); setCategory(""); }}>
                <option value="all">All reports</option>
                {recordTypes.map((type) => <option key={type} value={type}>{reportTypeLabels[type]}</option>)}
              </select>
            </label>
            <label htmlFor="reports-category">
              <span>Category</span>
              <select id="reports-category" name="category" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All categories</option>
                {categories.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </section>

          <p className="reports-refresh-note">
            {loading ? "Loading your saved records…" : `${reportRows.length} records included`}
            {!loading && " · Automatically refreshed every 10 seconds"}
          </p>

          <section className="reports-summary-grid" aria-label="Report summary">
            <article className="reports-summary-card">
              <span className="reports-summary-icon reports-icon-green"><FontAwesomeIcon icon={faCow} aria-hidden="true" /></span>
              <div><span>Total animals</span><strong>{formatNumber(totals.livestockCount)}</strong><small>{totals.breedCount} {totals.breedCount === 1 ? "breed" : "breeds"} recorded</small></div>
            </article>
            <article className="reports-summary-card">
              <span className="reports-summary-icon reports-icon-green"><FontAwesomeIcon icon={faSeedling} aria-hidden="true" /></span>
              <div><span>Active crop fields</span><strong>{formatNumber(totals.activeFields)}</strong><small>{formatNumber(totals.plantedHectares)} ha planted</small></div>
            </article>
            <article className="reports-summary-card">
              <span className="reports-summary-icon reports-icon-gold"><FontAwesomeIcon icon={faBoxesStacked} aria-hidden="true" /></span>
              <div><span>Inventory items</span><strong>{formatNumber(totals.inventoryCount)}</strong><small>{formatNumber(totals.lowStockCount)} running low</small></div>
            </article>
            <article className="reports-summary-card">
              <span className="reports-summary-icon reports-icon-blue"><FontAwesomeIcon icon={faMoneyBillTrendUp} aria-hidden="true" /></span>
              <div><span>Sales revenue</span><strong>{formatCurrency(totals.revenue, currency)}</strong><small>For the selected period</small></div>
            </article>
            <article className="reports-summary-card">
              <span className="reports-summary-icon reports-icon-red"><FontAwesomeIcon icon={faReceipt} aria-hidden="true" /></span>
              <div><span>Total expenses</span><strong>{formatCurrency(totals.expenses, currency)}</strong><small>For the selected period</small></div>
            </article>
            <article className={`reports-summary-card${profit < 0 ? " reports-summary-loss" : ""}`}>
              <span className="reports-summary-icon reports-icon-green"><FontAwesomeIcon icon={faMoneyBillTrendUp} aria-hidden="true" /></span>
              <div><span>Profit before adjustments</span><strong>{formatCurrency(profit, currency)}</strong><small>Revenue − expenses</small></div>
            </article>
          </section>

          <section className="reports-panel reports-financial-panel">
            <div className="reports-section-heading">
              <div><h2>Financial performance</h2><p>Sales and expenses grouped by month in the selected range.</p></div>
              <div className="reports-chart-legend"><span><i className="reports-legend-sales" /> Sales</span><span><i className="reports-legend-expenses" /> Expenses</span></div>
            </div>
            {chartData.length === 0 ? (
              <p className="reports-empty">No sales or expense records match these filters.</p>
            ) : (
              <div className="reports-chart" role="img" aria-label="Monthly sales and expenses comparison">
                {chartData.map((bucket) => (
                  <div className="reports-chart-group" key={bucket.key}>
                    <div className="reports-chart-bars">
                      <div className="reports-chart-bar reports-chart-sales" style={{ height: `${Math.max(3, bucket.sales / chartMaximum * 100)}%` }} title={`Sales: ${formatCurrency(bucket.sales, currency)}`} />
                      <div className="reports-chart-bar reports-chart-expenses" style={{ height: `${Math.max(3, bucket.expenses / chartMaximum * 100)}%` }} title={`Expenses: ${formatCurrency(bucket.expenses, currency)}`} />
                    </div>
                    <span>{bucket.label}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="reports-panel">
            <div className="reports-section-heading">
              <div><h2>Detailed report</h2><p>Saved records for the selected filters.</p></div>
              <span className="reports-record-count">{reportRows.length} {reportRows.length === 1 ? "record" : "records"}</span>
            </div>
            {loading && reportRows.length === 0 ? (
              <p className="reports-empty" role="status">Loading your reports…</p>
            ) : reportRows.length === 0 ? (
              <p className="reports-empty">No records match these filters.</p>
            ) : (
              <div className="reports-table-wrap">
                <table className="reports-table">
                  <thead><tr><th>Date</th><th>Report</th><th>Record</th><th>Details</th><th>Farm</th><th className="reports-number-cell">Amount</th></tr></thead>
                  <tbody>
                    {reportRows.map((record) => {
                      const details =
                        record.reportType === "livestock"
                          ? record.species ?? "Breed not recorded"
                          : record.reportType === "crops"
                            ? `${record.status ?? "Status not recorded"} · ${formatNumber(record.plantedHectares ?? 0)} ha`
                            : record.reportType === "inventory"
                              ? `${formatNumber(record.quantity ?? 0)} ${record.unit ?? ""} · reorder at ${formatNumber(record.reorderLevel ?? 0)}`
                              : record.description ?? "—";
                      return (
                        <tr key={`${record.reportType}-${record._id}`}>
                          <td>{new Date(`${getRecordDate(record)}T00:00:00`).toLocaleDateString()}</td>
                          <td><span className={`reports-type reports-type-${record.reportType}`}>{reportTypeLabels[record.reportType]}</span></td>
                          <td>{record.name ?? record.description ?? "—"}</td>
                          <td>{details}</td>
                          <td>{farms.find((farm) => farm._id === record.farmId)?.name ?? "No farm assigned"}</td>
                          <td className="reports-number-cell">{                          record.amount === undefined ? "—" : formatCurrency(record.amount, currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="reports-data-note">
            <strong>About these figures:</strong> Reports use records currently saved in your account. This version does not yet track animal births, deaths or health events; harvested quantities; inventory purchase costs/value; or product quantities sold. These are not included in totals. Profit shown is revenue minus recorded expenses only and does not include other adjustments.
          </aside>
        </div>
      </section>
    </main>
  );
}

export default Reports;