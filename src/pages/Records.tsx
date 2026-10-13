import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCartShopping,
  faBoxesStacked,
  faCow,
  faReceipt,
  faSeedling,
  faTractor,
} from "@fortawesome/free-solid-svg-icons";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppSidebar from "../components/AppSidebar";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  formatCurrency,
  formatCurrencyInput,
  toNaira,
  useCurrency,
} from "../lib/currency";
import {
  createRecord,
  canWriteRecordType,
  deleteRecord,
  fetchFarms,
  fetchRecords,
  getApiErrorMessage,
  notifyRecordsChanged,
  updateRecord,
} from "../lib/records";
import type { Farm, FarmRecord, RecordPayload, RecordType, UserRole } from "../lib/records";

interface RecordField {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  min?: string;
  step?: string;
}

const recordPages: Record<
  RecordType,
  {
    title: string;
    singular: string;
    addLabel: string;
    icon: typeof faCow;
    fields: RecordField[];
  }
> = {
  livestock: {
    title: "Livestock",
    singular: "animal",
    addLabel: "Add livestock",
    icon: faCow,
    fields: [
      { name: "name", label: "Animal name", type: "text", required: true },
      { name: "species", label: "Species or breed", type: "text", required: true },
      { name: "tagId", label: "Tag ID", type: "text", placeholder: "Optional" },
    ],
  },
  crops: {
    title: "Crop Fields",
    singular: "crop field",
    addLabel: "Add crop field",
    icon: faSeedling,
    fields: [
      { name: "name", label: "Crop or field name", type: "text", required: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
      {
        name: "plantedHectares",
        label: "Planted hectares",
        type: "number",
        required: true,
        min: "0",
        step: "0.01",
      },
    ],
  },
  sales: {
    title: "Sales",
    singular: "sale",
    addLabel: "Record transactions",
    icon: faCartShopping,
    fields: [
      { name: "description", label: "Description", type: "text", required: true },
      {
        name: "amount",
        label: "Amount",
        type: "number",
        required: true,
        min: "0",
        step: "0.01",
      },
      { name: "date", label: "Date", type: "date", required: true },
    ],
  },
  expenses: {
    title: "Expenses",
    singular: "expense",
    addLabel: "Record costs",
    icon: faReceipt,
    fields: [
      { name: "description", label: "Description", type: "text", required: true },
      {
        name: "amount",
        label: "Amount",
        type: "number",
        required: true,
        min: "0",
        step: "0.01",
      },
      { name: "date", label: "Date", type: "date", required: true },
    ],
  },
  inventory: {
    title: "Inventory",
    singular: "inventory item",
    addLabel: "Add inventory item",
    icon: faBoxesStacked,
    fields: [
      { name: "name", label: "Item name", type: "text", required: true },
      { name: "category", label: "Category", type: "text", required: true },
      {
        name: "quantity",
        label: "Quantity",
        type: "number",
        required: true,
        min: "0",
        step: "0.01",
      },
      { name: "unit", label: "Unit", type: "text", required: true, placeholder: "e.g. bags, litres" },
      {
        name: "reorderLevel",
        label: "Reorder level",
        type: "number",
        required: true,
        min: "0",
        step: "0.01",
      },
    ],
  },
};

function getToday() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function getDefaultValue(field: RecordField) {
  if (field.type === "date") return getToday();
  if (field.type === "select") return field.options?.[0]?.value ?? "";
  return "";
}

function getRecordDate(value: string | undefined) {
  if (!value) return getToday();
  return value.slice(0, 10);
}

interface RecordsProps {
  recordType?: RecordType;
}

function Records({ recordType: recordTypeProp }: RecordsProps) {
  const currency = useCurrency();
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const [records, setRecords] = useState<FarmRecord[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<FarmRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const userRole = (sessionStorage.getItem("userRole") ?? "staff") as UserRole;
  const requestedType = recordTypeProp ?? type;
  const page =
    requestedType && Object.prototype.hasOwnProperty.call(recordPages, requestedType)
      ? recordPages[requestedType as RecordType]
      : null;
  const recordType = requestedType as RecordType;
  const canManageRecords = page ? canWriteRecordType(userRole, recordType) : false;

  const loadRecords = useCallback(async () => {
    if (!page) return;

    try {
      const nextRecords = await fetchRecords(recordType);
      setError("");
      setRecords(nextRecords);
    } catch (loadError: unknown) {
      setError(getApiErrorMessage(loadError, "Unable to load these records."));
    } finally {
      setLoading(false);
    }
  }, [page, recordType]);

  useEffect(() => {
    if (!page) {
      navigate("/dashboard", { replace: true });
      return;
    }

    let active = true;
    Promise.all([fetchRecords(recordType), fetchFarms()])
      .then(([nextRecords, nextFarms]) => {
        if (!active) return;
        setError("");
        setRecords(nextRecords);
        setFarms(nextFarms);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getApiErrorMessage(loadError, "Unable to load these records."));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [navigate, page, recordType]);

  if (!page) return null;

  const resetForm = () => {
    setEditingId(null);
    setValues({});
  };

  const handleEdit = (record: FarmRecord) => {
    const nextValues: Record<string, string> = {};
    page.fields.forEach((field) => {
      const value = record[field.name as keyof FarmRecord];
      nextValues[field.name] =
        field.type === "date"
          ? getRecordDate(typeof value === "string" ? value : undefined)
          : field.name === "amount" && typeof value === "number"
            ? formatCurrencyInput(value, currency)
          : value === undefined || value === null
            ? ""
            : String(value);
    });
    nextValues.farmId = record.farmId ?? "";
    setEditingId(record._id);
    setValues(nextValues);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    const payload: RecordPayload = {};
    page.fields.forEach((field) => {
      const value = values[field.name] ?? getDefaultValue(field);
      const numericValue = field.type === "number" ? Number(value) : undefined;
      payload[field.name] =
        field.name === "amount" && numericValue !== undefined
          ? toNaira(numericValue, currency)
          : numericValue ?? value;
    });
    payload.farmId = values.farmId ?? "";

    try {
      if (editingId) {
        await updateRecord(recordType, editingId, payload);
      } else {
        await createRecord(recordType, payload);
      }

      notifyRecordsChanged();
      resetForm();
      await loadRecords();
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, "Unable to save this record."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!recordToDelete) return;
    setDeleting(true);
    setError("");
    try {
      await deleteRecord(recordType, recordToDelete._id);
      notifyRecordsChanged();
      if (editingId === recordToDelete._id) resetForm();
      setRecordToDelete(null);
      await loadRecords();
    } catch (deleteError: unknown) {
      setError(getApiErrorMessage(deleteError, "Unable to delete this record."));
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
              <FontAwesomeIcon icon={page.icon} aria-hidden="true" />
            </div>
            <div>
              <h1>{page.title} records</h1>
              <p>Manage your farm records. Changes are saved to your account.</p>
            </div>
            <Link className="records-dashboard-link" to="/dashboard">
              <FontAwesomeIcon icon={faTractor} aria-hidden="true" />
              Dashboard
            </Link>
          </header>

          {error && <div className="records-feedback records-feedback-error" role="alert">{error}</div>}

          {canManageRecords && <section className="records-panel" aria-labelledby="record-form-title">
            <h2 id="record-form-title">
              {editingId
                ? `Edit ${page.singular}`
                : page.addLabel}
            </h2>
            <form className="records-form" onSubmit={handleSubmit}>
              {page.fields.map((field) => (
                <label className="records-field" key={field.name}>
                  <span>
                    {field.name === "amount"
                      ? `Amount (${currency === "NGN" ? "₦" : "$"})`
                      : field.label}
                  </span>
                  {field.type === "select" ? (
                    <select
                      value={values[field.name] ?? "active"}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.name]: event.target.value }))
                      }
                      required={field.required}
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={values[field.name] ?? getDefaultValue(field)}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.name]: event.target.value }))
                      }
                      required={field.required}
                      placeholder={field.placeholder}
                      min={field.min}
                      step={field.step}
                    />
                  )}
                </label>
              ))}
              <label className="records-field" htmlFor="record-farm">
                <span>Farm</span>
                <select
                  id="record-farm"
                  value={values.farmId ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, farmId: event.target.value }))
                  }
                >
                  <option value="">No farm assigned</option>
                  {farms.map((farm) => (
                    <option key={farm._id} value={farm._id}>
                      {farm.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="records-form-actions">
                <button className="records-submit" type="submit" disabled={saving}>
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save changes"
                      : page.addLabel}
                </button>
                {editingId && (
                  <button className="records-cancel" type="button" onClick={resetForm} disabled={saving}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>}

          <section className="records-panel" aria-labelledby="records-list-title">
            <div className="records-list-heading">
              <h2 id="records-list-title">Your {page.title.toLowerCase()}</h2>
              <span>{records.length} {records.length === 1 ? "record" : "records"}</span>
            </div>
            {loading ? (
              <p className="records-empty" role="status">Loading records...</p>
            ) : records.length === 0 ? (
              <p className="records-empty">No {page.title.toLowerCase()} records yet. Add one above to get started.</p>
            ) : (
              <div className="records-list">
                {records.map((record) => (
                  <article className="record-row" key={record._id}>
                    <div className="record-row-content">
                      <h3>{record.name ?? record.description}</h3>
                      <div className="record-row-details">
                        {record.species && <span>{record.species}</span>}
                        {record.tagId && <span>Tag: {record.tagId}</span>}
                        {record.farmId && (
                          <span>
                            Farm: {farms.find((farm) => farm._id === record.farmId)?.name ?? "Linked farm"}
                          </span>
                        )}
                        {record.status && (
                          <span className={`record-status record-status-${record.status}`}>
                            {record.status}
                          </span>
                        )}
                        {record.plantedHectares !== undefined && (
                          <span>{record.plantedHectares} ha</span>
                        )}
                        {record.amount !== undefined && (
                          <span>{formatCurrency(record.amount, currency)}</span>
                        )}
                        {record.quantity !== undefined && (
                          <span>{record.quantity.toLocaleString()} {record.unit}</span>
                        )}
                        {record.category && <span>{record.category}</span>}
                        {record.reorderLevel !== undefined && (
                          <span>Reorder at {record.reorderLevel.toLocaleString()}</span>
                        )}
                        {record.date && <span>{new Date(record.date).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    {canManageRecords && <div className="record-row-actions">
                      <button type="button" onClick={() => handleEdit(record)}>Edit</button>
                      <button type="button" onClick={() => setRecordToDelete(record)}>Delete</button>
                    </div>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
      {recordToDelete && (
        <ConfirmDialog
          title="Delete this record?"
          message={`Are you sure you want to delete "${recordToDelete.name ?? recordToDelete.description ?? "this record"}"? This action cannot be undone.`}
          busy={deleting}
          onCancel={() => setRecordToDelete(null)}
          onConfirm={() => void handleDelete()}
        />
      )}
    </main>
  );
}

export default Records;
