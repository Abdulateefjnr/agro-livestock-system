import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ClipboardList, Leaf, Wheat } from "lucide-react";
import { formatCurrency, useCurrency } from "../lib/currency";
import {
  canReadRecordType,
  fetchFarms,
  fetchRecords,
  getApiErrorMessage,
  RECORDS_CHANGED_EVENT,
  RECORDS_STORAGE_KEY,
} from "../lib/records";
import type { Farm, FarmRecord, UserRole } from "../lib/records";
import "./SalesCropOverview.css";

const formatRecordDate = (value: string | undefined) => {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not recorded"
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
};

function SalesCropOverview() {
  const currency = useCurrency();
  const role = (sessionStorage.getItem("userRole") ?? "staff") as UserRole;
  const canReadSales = canReadRecordType(role, "sales");
  const canReadCrops = canReadRecordType(role, "crops");
  const [sales, setSales] = useState<FarmRecord[]>([]);
  const [crops, setCrops] = useState<FarmRecord[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOverviewData = useCallback(async (): Promise<[FarmRecord[], FarmRecord[], Farm[]]> => {
    const [nextSales, nextCrops, nextFarms] = await Promise.all([
      canReadSales ? fetchRecords("sales") : Promise.resolve<FarmRecord[]>([]),
      canReadCrops ? fetchRecords("crops") : Promise.resolve<FarmRecord[]>([]),
      fetchFarms(),
    ]);
    return [nextSales, nextCrops, nextFarms];
  }, [canReadCrops, canReadSales]);

  const updateOverview = useCallback(
    ([nextSales, nextCrops, nextFarms]: [FarmRecord[], FarmRecord[], Farm[]]) => {
      setSales([...nextSales].sort((first, second) =>
        new Date(second.date ?? second.createdAt).getTime() -
        new Date(first.date ?? first.createdAt).getTime(),
      ).slice(0, 5));
      setCrops([...nextCrops].sort((first, second) =>
        Number(second.status === "active") - Number(first.status === "active") ||
        (second.plantedHectares ?? 0) - (first.plantedHectares ?? 0),
      ));
      setFarms(nextFarms);
      setError("");
    },
    [],
  );

  const loadOverview = useCallback(async () => {
    try {
      updateOverview(await fetchOverviewData());
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Unable to load recent sales and crop records."));
    } finally {
      setLoading(false);
    }
  }, [fetchOverviewData, updateOverview]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const nextData = await fetchOverviewData();
        if (!active) return;
        updateOverview(nextData);
      } catch (requestError: unknown) {
        if (active) setError(getApiErrorMessage(requestError, "Unable to load recent sales and crop records."));
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === RECORDS_STORAGE_KEY) void refresh();
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener(RECORDS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(RECORDS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [fetchOverviewData, updateOverview]);

  const farmsById = useMemo(
    () => new Map(farms.map((farm) => [farm._id, farm.name])),
    [farms],
  );
  const totalActiveHectares = crops.reduce(
    (total, crop) => total + (crop.status === "active" ? crop.plantedHectares ?? 0 : 0),
    0,
  );

  const retry = () => {
    setLoading(true);
    void loadOverview();
  };

  if (!canReadSales && !canReadCrops) return null;

  return (
    <section
      className={`sales-crop-overview${canReadSales && canReadCrops ? "" : " is-single-column"}`}
      aria-label="Recent sales and crop overview"
    >
      {canReadSales && (
        <article className="overview-card sales-ledger-card">
          <header className="overview-card-heading">
            <span className="overview-heading-icon ledger-heading-icon"><ClipboardList size={21} aria-hidden="true" /></span>
            <div className="overview-heading-copy">
              <span className="overview-eyebrow">FINANCIAL ACTIVITY</span>
              <h2>Recent sales</h2>
              <p>Latest transactions recorded across your farms</p>
            </div>
            <Link className="overview-heading-link" to="/records/sales" aria-label="View all sales">
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </header>

          {error && <div className="overview-error" role="alert"><span>{error}</span><button type="button" onClick={retry}>Retry</button></div>}
          {loading ? (
            <p className="overview-state" role="status">Loading sales…</p>
          ) : sales.length === 0 ? (
            <p className="overview-state">No sales have been recorded yet.</p>
          ) : (
            <div className="sales-ledger-list">
              {sales.map((sale) => (
                <div className="sales-ledger-row" key={sale._id}>
                  <span className="sales-ledger-mark"><Wheat size={18} aria-hidden="true" /></span>
                  <span className="sales-ledger-description">
                    <strong>{sale.description || "Sale"}</strong>
                    <small>{formatRecordDate(sale.date)}{sale.farmId ? ` · ${farmsById.get(sale.farmId) ?? "Assigned farm"}` : ""}</small>
                  </span>
                  <strong className="sales-ledger-amount">{formatCurrency(sale.amount ?? 0, currency)}</strong>
                </div>
              ))}
            </div>
          )}
          <Link className="overview-footer-link" to="/records/sales">Open sales records <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </article>
      )}

      {canReadCrops && (
        <article className="overview-card crop-tracker-card">
          <header className="overview-card-heading">
            <span className="overview-heading-icon crop-heading-icon"><Leaf size={21} aria-hidden="true" /></span>
            <div className="overview-heading-copy">
              <span className="overview-eyebrow">FIELD SNAPSHOT</span>
              <h2>Crop footprint</h2>
              <p>{totalActiveHectares.toLocaleString(undefined, { maximumFractionDigits: 2 })} active hectares recorded</p>
            </div>
            <Link className="overview-heading-link" to="/records/crops" aria-label="View all crop records">
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </header>

          {error && !canReadSales && <div className="overview-error" role="alert"><span>{error}</span><button type="button" onClick={retry}>Retry</button></div>}
          {loading ? (
            <p className="overview-state" role="status">Loading crop fields…</p>
          ) : crops.length === 0 ? (
            <p className="overview-state">No crop fields have been recorded yet.</p>
          ) : (
            <div className="crop-progress-list">
              {crops.slice(0, 5).map((crop) => {
                const cropArea = crop.status === "active" ? crop.plantedHectares ?? 0 : 0;
                const areaShare = totalActiveHectares > 0
                  ? Math.round((cropArea / totalActiveHectares) * 100)
                  : 0;
                return (
                  <div className="crop-progress-item" key={crop._id}>
                    <span className={`crop-item-icon ${crop.status === "active" ? "crop-icon-active" : "crop-icon-inactive"}`}>
                      <Leaf size={17} aria-hidden="true" />
                    </span>
                    <div className="crop-progress-details">
                      <div className="crop-progress-label">
                        <strong className="crop-name">{crop.name ?? "Crop field"}</strong>
                        <span className={`crop-status-badge crop-status-${crop.status ?? "active"}`}>{crop.status ?? "active"}</span>
                      </div>
                      <div
                        className="crop-progress-track"
                        role="progressbar"
                        aria-label={`${crop.name ?? "Crop field"} share of active crop hectares`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={areaShare}
                      >
                        <div className={`crop-progress-fill ${crop.status !== "active" ? "crop-progress-muted" : ""}`} style={{ width: `${areaShare}%` }} />
                      </div>
                      <small className="crop-progress-meta">
                        {(crop.plantedHectares ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ha
                        {crop.farmId ? ` · ${farmsById.get(crop.farmId) ?? "Assigned farm"}` : ""}
                      </small>
                    </div>
                    <strong className="crop-progress-percentage">{crop.status === "active" ? `${areaShare}%` : "—"}</strong>
                  </div>
                );
              })}
            </div>
          )}
          <p className="crop-progress-note">Bars show each active field’s share of recorded crop hectares—not crop growth.</p>
          <Link className="overview-footer-link" to="/records/crops">Open crop records <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </article>
      )}
    </section>
  );
}

export default SalesCropOverview;
