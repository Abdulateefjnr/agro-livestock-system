import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  Leaf,
  Package,
  Tractor,
} from "lucide-react";
import { formatCurrency, fromNaira, useCurrency } from "../lib/currency";
import {
  fetchFinancialMonitoring,
  getApiErrorMessage,
  RECORDS_CHANGED_EVENT,
  RECORDS_STORAGE_KEY,
  MONITORING_CHANGED_EVENT,
} from "../lib/records";
import type { FinancialMonitoringData } from "../lib/records";
import "./FinancialMonitoring.css";

function FinancialMonitoring() {
  const currency = useCurrency();
  const [data, setData] = useState<FinancialMonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const response = await fetchFinancialMonitoring();
      setData(response);
      setError("");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Unable to load monitoring data."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetchFinancialMonitoring();
        if (active) {
          setData(response);
          setError("");
        }
      } catch (requestError: unknown) {
        if (active) {
          setError(getApiErrorMessage(requestError, "Unable to load monitoring data."));
        }
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === RECORDS_STORAGE_KEY) void refresh();
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener(RECORDS_CHANGED_EVENT, refresh);
    window.addEventListener(MONITORING_CHANGED_EVENT, refresh);
    window.addEventListener("storage", handleStorage);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(RECORDS_CHANGED_EVENT, refresh);
      window.removeEventListener(MONITORING_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const chartData = useMemo(
    () => (data?.monthly ?? []).map((item) => ({
      ...item,
      label: new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" })
        .format(new Date(`${item.month}-01T00:00:00Z`)),
    })),
    [data],
  );
  const alerts = [...(data?.alerts ?? [])].sort((first, second) => {
    const firstUrgency = first.status === "Overdue" || first.status === "Out of stock" ? 0 : 1;
    const secondUrgency = second.status === "Overdue" || second.status === "Out of stock" ? 0 : 1;
    return firstUrgency - secondUrgency || first.title.localeCompare(second.title);
  });

  const getAlertIcon = (type: string) => {
    if (type === "inventory") return Package;
    if (type === "farm") return Tractor;
    if (type === "health" || type === "livestock") return HeartPulse;
    if (type === "crop") return Leaf;
    return CalendarClock;
  };

  const formatCompactCurrency = (value: number) =>
    new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(fromNaira(value, currency));

  return (
    <div className="fm-dashboard" aria-labelledby="fm-page-heading">
      <section className="fm-card fm-financial-card" aria-labelledby="fm-page-heading">
        <header className="fm-card-heading">
          <div className="fm-heading-copy">
            <span className="fm-heading-icon"><ClipboardList size={22} aria-hidden="true" /></span>
            <div>
              <span className="fm-eyebrow">FARM PERFORMANCE</span>
              <h2 id="fm-page-heading">Financial monitoring</h2>
              <p>Monthly recorded sales and expenses · last six months</p>
            </div>
          </div>
          <div className="fm-legend" aria-label="Chart legend">
            {data?.canViewSales && <span><i className="fm-legend-dot fm-sales-dot" />Sales</span>}
            {data?.canViewExpenses && <span><i className="fm-legend-dot fm-expenses-dot" />Expenses</span>}
          </div>
        </header>

        {error && (
          <div className="fm-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadData()}>Try again</button>
          </div>
        )}

        <div className="fm-chart" role="img" aria-label="Bar chart comparing recorded sales and expenses over the last six months">
          {loading && !data ? (
            <p className="fm-state">Loading financial records…</p>
          ) : !data ? (
            <p className="fm-state">Financial records are unavailable.</p>
          ) : !data.canViewSales && !data.canViewExpenses ? (
            <p className="fm-state">Your role does not have access to financial records.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 4 }} barGap={5}>
                <CartesianGrid stroke="var(--fm-grid)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  dy={8}
                />
                <YAxis
                  tickFormatter={formatCompactCurrency}
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={74}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(Number(value), currency),
                    name === "sales" ? "Sales" : "Expenses",
                  ]}
                  labelFormatter={(label) => `Month: ${label}`}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--surface)",
                    color: "var(--text)",
                  }}
                  cursor={{ fill: "var(--surface-muted)", opacity: 0.55 }}
                />
                {data.canViewSales && (
                  <Bar dataKey="sales" name="sales" fill="var(--fm-sales)" radius={[5, 5, 0, 0]} maxBarSize={34} />
                )}
                {data.canViewExpenses && (
                  <Bar dataKey="expenses" name="expenses" fill="var(--fm-expenses)" radius={[5, 5, 0, 0]} maxBarSize={34} />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="fm-footnote">Amounts are actual recorded values, displayed in {currency}. No unrecorded or forecast figures are included.</p>
      </section>

      <section className="fm-card fm-alerts-card" aria-labelledby="fm-alerts-heading">
        <header className="fm-card-heading fm-alerts-heading">
          <div className="fm-heading-copy">
            <span className="fm-heading-icon fm-alert-heading-icon"><AlertTriangle size={21} aria-hidden="true" /></span>
            <div>
              <span className="fm-eyebrow">LIVE RECORDS & PLANNER</span>
              <h2 id="fm-alerts-heading">Needs attention</h2>
              <p>Stock thresholds, farm status, and upcoming routines</p>
            </div>
          </div>
          <span className="fm-alert-count" aria-label={`${alerts.length} alerts`}>{alerts.length}</span>
        </header>

        <div className="fm-alert-list">
          {alerts.map((alert) => {
            const Icon = getAlertIcon(alert.type);
            return (
              <Link className={`fm-alert-item fm-alert-${alert.type}`} to={alert.href} key={alert.id}>
                <span className="fm-alert-icon"><Icon size={19} aria-hidden="true" /></span>
                <span className="fm-alert-copy">
                  <strong>{alert.title}</strong>
                  <small>{alert.source}</small>
                </span>
                <span className={`fm-alert-status fm-status-${alert.status.toLowerCase().replace(/\s+/g, "-")}`}>{alert.status}</span>
                <span className="fm-alert-detail">{alert.detail}</span>
                <ChevronRight className="fm-alert-chevron" size={18} aria-hidden="true" />
              </Link>
            );
          })}
          {!loading && alerts.length === 0 && !error && (
            <p className="fm-empty-state">No current alerts. Alerts appear here when stock reaches its reorder level, a farm or crop is inactive, livestock needs an ID tag, or a farm routine is due.</p>
          )}
        </div>
        <p className="fm-footnote">Vaccination, planting, and harvest alerts come from saved farm routines. Detailed animal health histories and crop harvest-date fields are not currently recorded.</p>
      </section>
    </div>
  );
}

export default FinancialMonitoring;
