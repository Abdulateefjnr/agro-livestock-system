import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxesStacked,
  faChartLine,
  faCow,
  faMapLocationDot,
  faPen,
  faPlus,
  faRulerCombined,
  faSeedling,
  faTrashCan,
  faTractor,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import AppSidebar from "../components/AppSidebar";
import ConfirmDialog from "../components/ConfirmDialog";
import { formatCurrency, useCurrency } from "../lib/currency";
import {
  createFarm,
  deleteFarm,
  fetchFarms,
  getApiErrorMessage,
  notifyRecordsChanged,
  updateFarm,
} from "../lib/records";
import type { Farm, RecordPayload } from "../lib/records";

type FarmValues = Record<
  | "name"
  | "location"
  | "sizeHectares"
  | "farmType"
  | "owner"
  | "cropAreaHectares"
  | "livestockAreaHectares"
  | "otherAreaHectares"
  | "status",
  string
>;

const emptyValues = (): FarmValues => ({
  name: "",
  location: "",
  sizeHectares: "",
  farmType: "",
  owner: sessionStorage.getItem("userName") ?? "",
  cropAreaHectares: "0",
  livestockAreaHectares: "0",
  otherAreaHectares: "0",
  status: "active",
});

const performanceDefaults = {
  livestockCount: 0,
  activeCropFieldCount: 0,
  plantedHectares: 0,
  salesTotal: 0,
  expensesTotal: 0,
  inventoryItemCount: 0,
};

function FarmPage() {
  const currency = useCurrency();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [values, setValues] = useState<FarmValues>(emptyValues);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [farmToDelete, setFarmToDelete] = useState<Farm | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canManageFarms = ["admin", "manager"].includes(
    sessionStorage.getItem("userRole") ?? "",
  );
  const canCreateFarms = sessionStorage.getItem("userRole") === "admin";

  const loadFarms = useCallback(async () => {
    try {
      setFarms(await fetchFarms());
      setError("");
    } catch (loadError: unknown) {
      setError(getApiErrorMessage(loadError, "Unable to load your farms."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchFarms()
      .then((nextFarms) => {
        if (!active) return;
        setFarms(nextFarms);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getApiErrorMessage(loadError, "Unable to load your farms."));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setValues(emptyValues());
  };

  const handleEdit = (farm: Farm) => {
    setEditingId(farm._id);
    setValues({
      name: farm.name,
      location: farm.location,
      sizeHectares: String(farm.sizeHectares),
      farmType: farm.farmType,
      owner: farm.owner,
      cropAreaHectares: String(farm.cropAreaHectares),
      livestockAreaHectares: String(farm.livestockAreaHectares),
      otherAreaHectares: String(farm.otherAreaHectares),
      status: farm.status,
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    const payload: RecordPayload = {
      name: values.name.trim(),
      location: values.location.trim(),
      sizeHectares: Number(values.sizeHectares),
      farmType: values.farmType.trim(),
      owner: values.owner.trim(),
      cropAreaHectares: Number(values.cropAreaHectares),
      livestockAreaHectares: Number(values.livestockAreaHectares),
      otherAreaHectares: Number(values.otherAreaHectares),
      status: values.status,
    };
    const areaTotal =
      Number(values.cropAreaHectares) +
      Number(values.livestockAreaHectares) +
      Number(values.otherAreaHectares);

    if (areaTotal > Number(values.sizeHectares)) {
      setError("Allocated areas cannot exceed the farm's total size.");
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        await updateFarm(editingId, payload);
      } else {
        await createFarm(payload);
      }
      notifyRecordsChanged();
      resetForm();
      await loadFarms();
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, "Unable to save this farm."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!farmToDelete) return;
    setDeleting(true);
    setError("");

    try {
      await deleteFarm(farmToDelete._id);
      if (editingId === farmToDelete._id) resetForm();
      setFarmToDelete(null);
      notifyRecordsChanged();
      await loadFarms();
    } catch (deleteError: unknown) {
      setError(getApiErrorMessage(deleteError, "Unable to delete this farm."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="dashboard">
      <AppSidebar />

      <section className="page">
        <div className="records-page">
          <header className="records-header">
            <div className="records-header-icon">
              <FontAwesomeIcon icon={faTractor} aria-hidden="true" />
            </div>
            <div>
              <h1>Farm management</h1>
              <p>Register farms, manage land allocations, and review farm-specific performance.</p>
            </div>
            <Link className="records-dashboard-link" to="/dashboard">
              <FontAwesomeIcon icon={faChartLine} aria-hidden="true" />
              Dashboard
            </Link>
          </header>

          {error && <div className="records-feedback records-feedback-error" role="alert">{error}</div>}

          {(canCreateFarms || (canManageFarms && editingId !== null)) && <section className="records-panel" aria-labelledby="farm-form-title">
            <h2 id="farm-form-title">{editingId ? "Edit farm details" : "Register a farm"}</h2>
            <form className="records-form" onSubmit={handleSubmit}>
              <label className="records-field">
                <span>Farm name</span>
                <input
                  value={values.name}
                  onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                  maxLength={120}
                  required
                />
              </label>
              <label className="records-field">
                <span>Location</span>
                <input
                  value={values.location}
                  onChange={(event) => setValues((current) => ({ ...current, location: event.target.value }))}
                  maxLength={160}
                  required
                />
              </label>
              <label className="records-field">
                <span>Total land area (ha)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={values.sizeHectares}
                  onChange={(event) => setValues((current) => ({ ...current, sizeHectares: event.target.value }))}
                  required
                />
              </label>
              <label className="records-field">
                <span>Farm type</span>
                <input
                  value={values.farmType}
                  onChange={(event) => setValues((current) => ({ ...current, farmType: event.target.value }))}
                  placeholder="e.g. Mixed, Livestock, Crop"
                  maxLength={80}
                  required
                />
              </label>
              <label className="records-field">
                <span>Owner</span>
                <input
                  value={values.owner}
                  onChange={(event) => setValues((current) => ({ ...current, owner: event.target.value }))}
                  maxLength={120}
                  required
                />
              </label>
              <label className="records-field">
                <span>Status</span>
                <select
                  value={values.status}
                  onChange={(event) => setValues((current) => ({ ...current, status: event.target.value }))}
                  required
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="maintenance">Under maintenance</option>
                </select>
              </label>
              <label className="records-field">
                <span>Area for crops (ha)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.cropAreaHectares}
                  onChange={(event) => setValues((current) => ({ ...current, cropAreaHectares: event.target.value }))}
                  required
                />
              </label>
              <label className="records-field">
                <span>Area for livestock (ha)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.livestockAreaHectares}
                  onChange={(event) => setValues((current) => ({ ...current, livestockAreaHectares: event.target.value }))}
                  required
                />
              </label>
              <label className="records-field">
                <span>Other activities (ha)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.otherAreaHectares}
                  onChange={(event) => setValues((current) => ({ ...current, otherAreaHectares: event.target.value }))}
                  required
                />
              </label>
              <div className="records-form-actions">
                <button className="records-submit" type="submit" disabled={saving}>
                  <FontAwesomeIcon icon={editingId ? faPen : faPlus} aria-hidden="true" />
                  {" "}{saving ? "Saving..." : editingId ? "Save changes" : "Add farm"}
                </button>
                {editingId && (
                  <button className="records-cancel" type="button" onClick={resetForm} disabled={saving}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>}

          <section className="records-panel" aria-labelledby="farms-list-title">
            <div className="records-list-heading">
              <h2 id="farms-list-title">Your farms</h2>
              <span>{farms.length} {farms.length === 1 ? "farm" : "farms"}</span>
            </div>
            {loading ? (
              <p className="records-empty" role="status">Loading farms...</p>
            ) : farms.length === 0 ? (
              <p className="records-empty">No farms registered yet. Add your first farm above.</p>
            ) : (
              <div className="records-list">
                {farms.map((farm) => {
                  const performance = farm.performance ?? performanceDefaults;
                  return (
                    <article className="record-row farm-record-row" key={farm._id}>
                      <div className="record-row-content">
                        <div className="farm-record-title">
                          <h3>{farm.name}</h3>
                          <span className={`record-status record-status-${farm.status}`}>
                            {farm.status === "maintenance" ? "Under maintenance" : farm.status}
                          </span>
                        </div>
                        <div className="record-row-details">
                          <span><FontAwesomeIcon icon={faMapLocationDot} aria-hidden="true" /> {farm.location}</span>
                          <span><FontAwesomeIcon icon={faRulerCombined} aria-hidden="true" /> {farm.sizeHectares.toLocaleString()} ha total</span>
                          <span>{farm.farmType}</span>
                          <span>Owner: {farm.owner}</span>
                          <span>Areas: crops {farm.cropAreaHectares} ha · livestock {farm.livestockAreaHectares} ha · other {farm.otherAreaHectares} ha</span>
                        </div>
                        <div className="farm-performance">
                          <span><FontAwesomeIcon icon={faCow} aria-hidden="true" /> {performance.livestockCount.toLocaleString()} livestock</span>
                          <span><FontAwesomeIcon icon={faSeedling} aria-hidden="true" /> {performance.activeCropFieldCount.toLocaleString()} active fields · {performance.plantedHectares.toLocaleString(undefined, { maximumFractionDigits: 2 })} ha planted</span>
                          <span><FontAwesomeIcon icon={faChartLine} aria-hidden="true" /> Sales {formatCurrency(performance.salesTotal, currency)}</span>
                          <span><FontAwesomeIcon icon={faWallet} aria-hidden="true" /> Expenses {formatCurrency(performance.expensesTotal, currency)}</span>
                          <span><FontAwesomeIcon icon={faBoxesStacked} aria-hidden="true" /> {performance.inventoryItemCount.toLocaleString()} inventory items</span>
                        </div>
                      </div>
                      {canManageFarms && <div className="record-row-actions">
                        <button type="button" onClick={() => handleEdit(farm)}>Edit</button>
                        {canCreateFarms && <button type="button" onClick={() => setFarmToDelete(farm)}>
                            <FontAwesomeIcon icon={faTrashCan} aria-hidden="true" />
                            {" "}Delete
                          </button>}
                      </div>}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>
      {farmToDelete && (
        <ConfirmDialog
          title="Delete this farm?"
          message={`Are you sure you want to delete "${farmToDelete.name}"? Farms with linked records cannot be deleted. This action cannot be undone.`}
          busy={deleting}
          onCancel={() => setFarmToDelete(null)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </main>
  );
}

export default FarmPage;
