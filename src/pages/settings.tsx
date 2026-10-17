import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faBuilding,
  faCalendarDays,
  faClipboardList,
  faDatabase,
  faFloppyDisk,
  faGear,
  faMoon,
  faPlus,
  faShieldHalved,
  faSun,
  faTrashCan,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import AppSidebar from "../components/AppSidebar";
import ProfilePhotoControl from "../components/ProfilePhotoControl";
import { setSelectedAppearance, type AppearanceMode } from "../lib/appearance";
import { setSelectedCurrency, type Currency } from "../lib/currency";
import {
  createFarmRoutine,
  deleteFarmRoutine as removeFarmRoutine,
  fetchFarmRoutines,
  fetchFarms,
  getApiErrorMessage,
  notifyMonitoringChanged,
  updateFarmRoutine,
} from "../lib/records";
import type { Farm, FarmRoutine, UserAccount } from "../lib/records";

type SettingsPreferences = {
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  farmLocation: string;
  timeZone: string;
  currency: Currency;
  units: "Metric" | "Imperial";
  defaultFarm: string;
  notifications: {
    lowInventory: boolean;
    livestockHealth: boolean;
    plantingHarvest: boolean;
    salesAlerts: boolean;
    expenseAlerts: boolean;
  };
  appearance: AppearanceMode;
  backups: boolean;
};

type SettingsActivity = {
  id: string;
  message: string;
  date: string;
};

const SETTINGS_KEY = "agroliv-settings";
const LEGACY_ROUTINES_KEY = "agroliv-routines";
const ACTIVITY_KEY = "agroliv-settings-activity";

const defaultPreferences: SettingsPreferences = {
  fullName: "",
  email: "",
  phone: "",
  organization: "",
  farmLocation: "",
  timeZone: "Africa/Lagos",
  currency: "NGN",
  units: "Metric",
  defaultFarm: "",
  notifications: {
    lowInventory: true,
    livestockHealth: true,
    plantingHarvest: true,
    salesAlerts: true,
    expenseAlerts: false,
  },
  appearance: "light",
  backups: true,
};

function readPreferences(): SettingsPreferences {
  const userName = sessionStorage.getItem("userName") ?? "";
  let user: { fullName?: string; email?: string } = {};
  const currentUser = sessionStorage.getItem("user");
  if (currentUser) {
    try {
      user = JSON.parse(currentUser) as { fullName?: string; email?: string };
    } catch {
      user = {};
    }
  }

  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) {
    return {
      ...defaultPreferences,
      fullName: user.fullName ?? userName,
      email: user.email ?? "",
    };
  }

  try {
    const parsed = JSON.parse(stored) as Partial<SettingsPreferences>;
    return {
      ...defaultPreferences,
      ...parsed,
      fullName: parsed.fullName ?? user.fullName ?? userName,
      email: parsed.email ?? user.email ?? "",
      currency: parsed.currency === "USD" ? "USD" : "NGN",
      appearance: parsed.appearance === "dark" ? "dark" : "light",
      notifications: {
        ...defaultPreferences.notifications,
        ...(parsed.notifications ?? {}),
      },
    };
  } catch {
    return {
      ...defaultPreferences,
      fullName: user.fullName ?? userName,
      email: user.email ?? "",
    };
  }
}

function readStoredList<T>(key: string): T[] {
  const stored = localStorage.getItem(key);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function getNextDueDate(date: string, repeat: string) {
  const nextDate = new Date(`${date}T00:00:00`);
  if (repeat === "Daily") nextDate.setDate(nextDate.getDate() + 1);
  if (repeat === "Weekly") nextDate.setDate(nextDate.getDate() + 7);
  if (repeat === "Monthly") {
    const originalDay = nextDate.getDate();
    nextDate.setDate(1);
    nextDate.setMonth(nextDate.getMonth() + 1);
    const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    nextDate.setDate(Math.min(originalDay, lastDay));
  }
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(nextDate.getDate()).padStart(2, "0")}`;
}

function SettingsPage() {
  const canManageRoutines = ["admin", "manager", "livestock_officer", "crop_officer"].includes(sessionStorage.getItem("userRole") ?? "staff");
  const [form, setForm] = useState<SettingsPreferences>(readPreferences);
  const [profilePicture, setProfilePicture] = useState(() => {
    try {
      return (JSON.parse(sessionStorage.getItem("user") ?? "{}") as { profilePicture?: string }).profilePicture ?? "";
    } catch {
      return "";
    }
  });
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmLoadError, setFarmLoadError] = useState("");
  const [tasks, setTasks] = useState<FarmRoutine[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(true);
  const [routineError, setRoutineError] = useState("");
  const [routineSaving, setRoutineSaving] = useState(false);
  const [activity, setActivity] = useState<SettingsActivity[]>(() =>
    readStoredList<SettingsActivity>(ACTIVITY_KEY),
  );
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState<FarmRoutine["type"]>("Feeding");
  const [taskFarmId, setTaskFarmId] = useState("");
  const [taskDueDate, setTaskDueDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [taskRepeat, setTaskRepeat] = useState<FarmRoutine["repeat"]>("Does not repeat");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchFarms()
      .then((nextFarms) => {
        if (!active) return;
        setFarms(nextFarms);
        setForm((current) => {
          const selected = nextFarms.find(
            (farm) => farm._id === current.defaultFarm || farm.name === current.defaultFarm,
          );
          return selected && selected._id !== current.defaultFarm
            ? { ...current, defaultFarm: selected._id }
            : current;
        });
      })
      .catch((error: unknown) => {
        if (active) setFarmLoadError(getApiErrorMessage(error, "Farm list is unavailable. Your other settings are still editable."));
      });
    fetchFarmRoutines()
      .then(async (nextRoutines) => {
        if (!canManageRoutines) {
          if (active) setTasks(nextRoutines);
          return;
        }
        const legacyTasks = readStoredList<Record<string, unknown>>(LEGACY_ROUTINES_KEY);
        const existingClientIds = new Set(nextRoutines.map((task) => task.clientId).filter(Boolean));
        const migratedTasks: FarmRoutine[] = [];
        let migrationError = "";
        const activityTypes: FarmRoutine["type"][] = [
          "Feeding", "Vaccination", "Irrigation", "Fertilizing", "Planting", "Harvesting", "Other",
        ];
        const repeatOptions: FarmRoutine["repeat"][] = [
          "Does not repeat", "Daily", "Weekly", "Monthly",
        ];

        for (const task of legacyTasks) {
          const clientId = typeof task.clientId === "string"
            ? task.clientId
            : typeof task.id === "string"
              ? task.id
              : "";
          if (clientId && existingClientIds.has(clientId)) continue;
          if (
            !clientId ||
            typeof task.title !== "string" ||
            typeof task.type !== "string" ||
            !activityTypes.includes(task.type as FarmRoutine["type"]) ||
            typeof task.dueDate !== "string" ||
            typeof task.repeat !== "string" ||
            !repeatOptions.includes(task.repeat as FarmRoutine["repeat"]) ||
            typeof task.completed !== "boolean"
          ) {
            migrationError = "Some older reminders could not be moved to shared farm routines.";
            continue;
          }
          try {
            const migrated = await createFarmRoutine({
              clientId,
              title: task.title,
              type: task.type as FarmRoutine["type"],
              dueDate: task.dueDate,
              repeat: task.repeat as FarmRoutine["repeat"],
              farmId: "",
              completed: task.completed,
            });
            migratedTasks.push(migrated);
            existingClientIds.add(clientId);
          } catch (error: unknown) {
            migrationError = getApiErrorMessage(error, "Unable to migrate older farm reminders.");
            break;
          }
        }

        if (!migrationError) localStorage.removeItem(LEGACY_ROUTINES_KEY);
        if (active) {
          setTasks([...nextRoutines, ...migratedTasks].sort((first, second) =>
            first.dueDate.localeCompare(second.dueDate),
          ));
          if (migrationError) setRoutineError(migrationError);
          if (migratedTasks.length > 0) notifyMonitoringChanged();
        }
      })
      .catch((error: unknown) => {
        if (active) setRoutineError(getApiErrorMessage(error, "Unable to load shared farm routines."));
      })
      .finally(() => {
        if (active) setRoutinesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canManageRoutines]);

  const updateField = <K extends keyof SettingsPreferences>(
    field: K,
    value: SettingsPreferences[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateNotification = (
    key: keyof SettingsPreferences["notifications"],
    value: boolean,
  ) => {
    setForm((current) => ({
      ...current,
      notifications: { ...current.notifications, [key]: value },
    }));
  };

  const addActivity = (message: string) => {
    const entry = { id: crypto.randomUUID(), message, date: new Date().toISOString() };
    setActivity((current) => {
      const next = [entry, ...current].slice(0, 12);
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleSave = () => {
    setSaving(true);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(form));
    const timestamp = new Date();
    setSavedAt(timestamp.toLocaleString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }));
    addActivity("Saved farm control center preferences");
    window.setTimeout(() => setSaving(false), 400);
  };

  const addRoutine = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageRoutines) return;
    setRoutineSaving(true);
    setRoutineError("");
    try {
      const task = await createFarmRoutine({
      title: taskTitle.trim(),
      type: taskType,
      dueDate: taskDueDate,
      repeat: taskRepeat,
      farmId: taskFarmId,
      completed: false,
      });
      setTasks((current) => [...current, task].sort((first, second) =>
        first.dueDate.localeCompare(second.dueDate),
      ));
      addActivity(`Added routine: ${task.title}`);
      setTaskTitle("");
      notifyMonitoringChanged();
    } catch (error: unknown) {
      setRoutineError(getApiErrorMessage(error, "Unable to save this farm routine."));
    } finally {
      setRoutineSaving(false);
    }
  };

  const toggleRoutine = async (task: FarmRoutine) => {
    if (!canManageRoutines) return;
    const completingRepeatingTask = !task.completed && task.repeat !== "Does not repeat";
    const nextDueDate = completingRepeatingTask
      ? getNextDueDate(task.dueDate, task.repeat)
      : task.dueDate;
    setRoutineSaving(true);
    setRoutineError("");
    try {
      const updated = await updateFarmRoutine(task.id, completingRepeatingTask
        ? { dueDate: nextDueDate }
        : { completed: !task.completed });
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
      addActivity(
        completingRepeatingTask
          ? `Completed routine: ${task.title}; next due ${formatDate(nextDueDate)}`
          : `${task.completed ? "Reopened" : "Completed"} routine: ${task.title}`,
      );
      notifyMonitoringChanged();
    } catch (error: unknown) {
      setRoutineError(getApiErrorMessage(error, "Unable to update this farm routine."));
    } finally {
      setRoutineSaving(false);
    }
  };

  const deleteRoutine = async (task: FarmRoutine) => {
    if (!canManageRoutines) return;
    setRoutineSaving(true);
    setRoutineError("");
    try {
      await removeFarmRoutine(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      addActivity(`Removed routine: ${task.title}`);
      notifyMonitoringChanged();
    } catch (error: unknown) {
      setRoutineError(getApiErrorMessage(error, "Unable to remove this farm routine."));
    } finally {
      setRoutineSaving(false);
    }
  };

  return (
    <main className="dashboard">
      <AppSidebar />
      <section className="page">
        <div className="settings-page">
          <header className="settings-header">
            <div className="settings-header-icon">
              <FontAwesomeIcon icon={faGear} aria-hidden="true" />
            </div>
            <div>
              <span className="settings-eyebrow">FARM CONTROL CENTER</span>
              <h1>Settings</h1>
              <p>Manage your account, farm operations, and application preferences.</p>
            </div>
          </header>

          <div className="settings-layout">
            <nav className="settings-nav" aria-label="Settings sections">
              <span className="settings-nav-title">YOUR WORKSPACE</span>
              <a href="#profile-settings"><FontAwesomeIcon icon={faUser} aria-hidden="true" /> Profile</a>
              <a href="#farm-settings"><FontAwesomeIcon icon={faBuilding} aria-hidden="true" /> Farm preferences</a>
              <a href="#notifications-settings"><FontAwesomeIcon icon={faBell} aria-hidden="true" /> Smart alerts</a>
              <a href="#routine-settings"><FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" /> Routine planner</a>
              <a href="#security-settings"><FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" /> Security</a>
              <a href="#appearance-settings"><FontAwesomeIcon icon={faSun} aria-hidden="true" /> Appearance</a>
              <a href="#activity-settings"><FontAwesomeIcon icon={faClipboardList} aria-hidden="true" /> Activity</a>
            </nav>

            <div className="settings-content">
              <div className="settings-grid">
                <section id="profile-settings" className="settings-panel" aria-labelledby="profile-settings-heading">
                  <div className="settings-panel-header">
                    <div className="settings-panel-icon settings-panel-icon-primary"><FontAwesomeIcon icon={faUser} aria-hidden="true" /></div>
                    <div><h2 id="profile-settings-heading">Profile & workspace</h2><p>Workspace details saved in this browser.</p></div>
                  </div>
                  <div className="settings-profile-summary">
                    <span className="settings-avatar">{form.fullName.trim().charAt(0).toUpperCase() || "F"}</span>
                    <div><strong>{form.fullName || "Farm user"}</strong><span>{form.email || "Add an email address"}</span></div>
                  </div>
                  <ProfilePhotoControl
                    userId="me"
                    fullName={form.fullName || "Farm user"}
                    profilePicture={profilePicture}
                    onUpdated={(user: UserAccount) => setProfilePicture(user.profilePicture)}
                  />
                  <div className="settings-form-grid">
                    <label htmlFor="settings-full-name"><span>Full name</span><input id="settings-full-name" autoComplete="name" value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} placeholder="Enter your full name" /></label>
                    <label htmlFor="settings-email"><span>Email address</span><input id="settings-email" type="email" autoComplete="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="Enter your email" /></label>
                    <label htmlFor="settings-phone"><span>Phone number</span><input id="settings-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="+234 800 000 0000" /></label>
                    <label htmlFor="settings-organization"><span>Farm organization</span><input id="settings-organization" value={form.organization} onChange={(event) => updateField("organization", event.target.value)} placeholder="Organization name" /></label>
                    <label htmlFor="settings-location"><span>Default location</span><input id="settings-location" value={form.farmLocation} onChange={(event) => updateField("farmLocation", event.target.value)} placeholder="Town, state or region" /></label>
                    <label htmlFor="settings-timezone"><span>Time zone</span>
                      <select id="settings-timezone" value={form.timeZone} onChange={(event) => updateField("timeZone", event.target.value)}>
                        <option value="Africa/Lagos">West Africa (Lagos, UTC+1)</option>
                        <option value="Africa/Accra">Greenwich Mean Time (Accra, UTC+0)</option>
                        <option value="Africa/Nairobi">East Africa (Nairobi, UTC+3)</option>
                        <option value="Europe/London">United Kingdom (London)</option>
                        <option value="America/New_York">Eastern Time (New York)</option>
                      </select>
                    </label>
                  </div>
                  <p className="settings-inline-note">Profile and workspace edits are stored locally; they do not change your server account profile.</p>
                </section>

                <section id="farm-settings" className="settings-panel" aria-labelledby="farm-settings-heading">
                  <div className="settings-panel-header">
                    <div className="settings-panel-icon settings-panel-icon-success"><FontAwesomeIcon icon={faBuilding} aria-hidden="true" /></div>
                    <div><h2 id="farm-settings-heading">Farm preferences</h2><p>Choose the defaults used across your workspace.</p></div>
                  </div>
                  <div className="settings-form-grid">
                    <label htmlFor="settings-currency"><span>Display currency</span>
                      <select id="settings-currency" value={form.currency} onChange={(event) => {
                        const currency = event.target.value as Currency;
                        updateField("currency", currency);
                        setSelectedCurrency(currency);
                      }}>
                        <option value="NGN">₦ Nigerian naira (NGN)</option>
                        <option value="USD">$ US dollar (USD)</option>
                      </select>
                    </label>
                    <label htmlFor="settings-units"><span>Measurement units</span>
                      <select id="settings-units" value={form.units} onChange={(event) => updateField("units", event.target.value as SettingsPreferences["units"])}>
                        <option value="Metric">Metric (hectares, kg)</option>
                        <option value="Imperial">Imperial (acres, lb)</option>
                      </select>
                    </label>
                    <label htmlFor="settings-default-farm"><span>Default farm</span>
                      <select id="settings-default-farm" value={form.defaultFarm} onChange={(event) => updateField("defaultFarm", event.target.value)}>
                        <option value="">No default farm</option>
                        {farms.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}
                      </select>
                    </label>
                  </div>
                  {farmLoadError && <p className="settings-inline-note" role="status">{farmLoadError}</p>}
                  <p className="settings-inline-note">Currency changes update financial displays. Units are a saved preference; farm measurements are not converted. A default farm is remembered here but record forms do not yet auto-select it.</p>
                </section>

                <section id="notifications-settings" className="settings-panel" aria-labelledby="notifications-settings-heading">
                  <div className="settings-panel-header">
                    <div className="settings-panel-icon settings-panel-icon-warning"><FontAwesomeIcon icon={faBell} aria-hidden="true" /></div>
                    <div><h2 id="notifications-settings-heading">Smart alert preferences</h2><p>Choose the farm events you want to track.</p></div>
                  </div>
                  <div className="settings-toggle-list">
                    <label><span><strong>Low feed and inventory</strong><small>Keep an eye on feed, fertilizer and stock levels.</small></span><input aria-label="Low feed and inventory alerts" type="checkbox" checked={form.notifications.lowInventory} onChange={(event) => updateNotification("lowInventory", event.target.checked)} /></label>
                    <label><span><strong>Livestock health</strong><small>Health checks and vaccination reminders.</small></span><input aria-label="Livestock health alerts" type="checkbox" checked={form.notifications.livestockHealth} onChange={(event) => updateNotification("livestockHealth", event.target.checked)} /></label>
                    <label><span><strong>Planting and harvest</strong><small>Upcoming crop schedule reminders.</small></span><input aria-label="Planting and harvest reminders" type="checkbox" checked={form.notifications.plantingHarvest} onChange={(event) => updateNotification("plantingHarvest", event.target.checked)} /></label>
                    <label><span><strong>Sales updates</strong><small>Changes to recorded farm sales.</small></span><input aria-label="Sales alerts" type="checkbox" checked={form.notifications.salesAlerts} onChange={(event) => updateNotification("salesAlerts", event.target.checked)} /></label>
                    <label><span><strong>Expense updates</strong><small>Changes to recorded farm expenses.</small></span><input aria-label="Expense alerts" type="checkbox" checked={form.notifications.expenseAlerts} onChange={(event) => updateNotification("expenseAlerts", event.target.checked)} /></label>
                  </div>
                  <p className="settings-inline-note">These choices are saved as preferences on this device. Push and email notifications are not enabled in this version.</p>
                </section>

                <section id="routine-settings" className="settings-panel settings-panel-wide" aria-labelledby="routine-settings-heading">
                  <div className="settings-panel-header">
                    <div className="settings-panel-icon settings-panel-icon-accent"><FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" /></div>
                    <div><h2 id="routine-settings-heading">Farm routine planner</h2><p>Create recurring reminders for everyday farm work.</p></div>
                  </div>
                  {canManageRoutines ? <form className="settings-routine-form" onSubmit={addRoutine}>
                    <label htmlFor="routine-title"><span>Task</span><input id="routine-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="e.g. Check water troughs" required /></label>
                    <label htmlFor="routine-type"><span>Activity</span><select id="routine-type" value={taskType} onChange={(event) => setTaskType(event.target.value as FarmRoutine["type"])}><option>Feeding</option><option>Vaccination</option><option>Irrigation</option><option>Fertilizing</option><option>Planting</option><option>Harvesting</option><option>Other</option></select></label>
                    <label htmlFor="routine-farm"><span>Farm</span><select id="routine-farm" value={taskFarmId} onChange={(event) => setTaskFarmId(event.target.value)}><option value="">No specific farm</option>{farms.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}</select></label>
                    <label htmlFor="routine-date"><span>Next due</span><input id="routine-date" type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} required /></label>
                    <label htmlFor="routine-repeat"><span>Repeat</span><select id="routine-repeat" value={taskRepeat} onChange={(event) => setTaskRepeat(event.target.value as FarmRoutine["repeat"])}><option>Does not repeat</option><option>Daily</option><option>Weekly</option><option>Monthly</option></select></label>
                    <button className="settings-button settings-button-primary" type="submit" disabled={routineSaving}><FontAwesomeIcon icon={faPlus} aria-hidden="true" /> {routineSaving ? "Saving..." : "Add reminder"}</button>
                  </form> : <p className="settings-inline-note">Your role can view farm routines. Contact a manager to add or change reminders.</p>}
                  {routineError && <p className="settings-inline-note" role="alert">{routineError}</p>}
                  {!routinesLoading && !routineError && tasks.length === 0 ? <p className="settings-empty-state">No routines have been added yet.</p> : null}
                  {tasks.length > 0 && (
                    <ul className="settings-routine-list">
                      {tasks.map((task) => <li key={task.id} className={task.completed ? "is-complete" : ""}>
                        <label className="settings-routine-check"><input type="checkbox" checked={task.completed} disabled={routineSaving || !canManageRoutines} onChange={() => void toggleRoutine(task)} /><span><strong>{task.title}</strong><small>{task.type} · {task.farmName || "Personal reminder"} · {formatDate(task.dueDate)} · {task.repeat}</small></span></label>
                        {canManageRoutines && <button type="button" className="settings-icon-button" aria-label={`Remove ${task.title}`} disabled={routineSaving} onClick={() => void deleteRoutine(task)}><FontAwesomeIcon icon={faTrashCan} aria-hidden="true" /></button>}
                      </li>)}
                    </ul>
                  )}
                  <p className="settings-inline-note">Farm routines are shared and saved to your account. Due or overdue tasks appear on the dashboard; push and email notifications are not enabled.</p>
                </section>

                <section id="security-settings" className="settings-panel" aria-labelledby="security-settings-heading">
                  <div className="settings-panel-header">
                    <div className="settings-panel-icon settings-panel-icon-accent"><FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" /></div>
                    <div><h2 id="security-settings-heading">Security center</h2><p>Manage access to your farm account.</p></div>
                  </div>
                  <div className="settings-security-note"><FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" /><div><strong>Account security is managed by your administrator.</strong><p>Password changes and active-session management are not available in Settings yet. Use the secure password-reset link sent to your email if you need to change your password.</p></div></div>
                </section>

                <section id="appearance-settings" className="settings-panel" aria-labelledby="appearance-settings-heading">
                  <div className="settings-panel-header">
                    <div className="settings-panel-icon settings-panel-icon-neutral">{form.appearance === "light" ? <FontAwesomeIcon icon={faSun} aria-hidden="true" /> : <FontAwesomeIcon icon={faMoon} aria-hidden="true" />}</div>
                    <div><h2 id="appearance-settings-heading">Appearance</h2><p>Choose a comfortable display theme.</p></div>
                  </div>
                  <div className="settings-theme-picker">
                    <button type="button" className={form.appearance === "light" ? "is-active" : ""} aria-pressed={form.appearance === "light"} onClick={() => { updateField("appearance", "light"); setSelectedAppearance("light"); }}><FontAwesomeIcon icon={faSun} aria-hidden="true" /> Light</button>
                    <button type="button" className={form.appearance === "dark" ? "is-active" : ""} aria-pressed={form.appearance === "dark"} onClick={() => { updateField("appearance", "dark"); setSelectedAppearance("dark"); }}><FontAwesomeIcon icon={faMoon} aria-hidden="true" /> Dark</button>
                  </div>
                  <p className="settings-inline-note">Your theme is applied immediately and remembered after refresh.</p>
                </section>

                <section className="settings-panel" aria-labelledby="system-settings-heading">
                  <div className="settings-panel-header">
                    <div className="settings-panel-icon settings-panel-icon-primary"><FontAwesomeIcon icon={faDatabase} aria-hidden="true" /></div>
                    <div><h2 id="system-settings-heading">Data & system</h2><p>Backup preference for this workspace.</p></div>
                  </div>
                  <div className="settings-toggle-list">
                    <label><span><strong>Automatic backup preference</strong><small>Remember that automatic backups are preferred.</small></span><input aria-label="Automatic backup preference" type="checkbox" checked={form.backups} onChange={(event) => updateField("backups", event.target.checked)} /></label>
                  </div>
                  <p className="settings-inline-note">This preference does not create a backup. Backup status and report export are not provided by the server yet.</p>
                </section>

                <section id="activity-settings" className="settings-panel settings-panel-wide" aria-labelledby="activity-settings-heading">
                  <div className="settings-panel-header">
                    <div className="settings-panel-icon settings-panel-icon-neutral"><FontAwesomeIcon icon={faClipboardList} aria-hidden="true" /></div>
                    <div><h2 id="activity-settings-heading">Settings activity</h2><p>Recent preference and routine changes on this device.</p></div>
                  </div>
                  {activity.length === 0 ? <p className="settings-empty-state">Your settings and routine activity will appear here.</p> : (
                    <ul className="settings-activity-list">{activity.map((entry) => <li key={entry.id}><span className="settings-activity-dot" /><div><strong>{entry.message}</strong><time dateTime={entry.date}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.date))}</time></div></li>)}</ul>
                  )}
                  <p className="settings-inline-note">This is a local convenience history, not a server audit log. It is only visible in this browser and cannot verify changes made by other users.</p>
                </section>
              </div>

              <footer className="settings-footer">
                <p>{savedAt ? `Settings saved ${savedAt}` : "Unsaved preference changes are saved when you choose Save changes."}</p>
                <button type="button" className="settings-button settings-button-primary" onClick={handleSave} disabled={saving || !form.fullName.trim() || !form.email.trim()}>
                  <FontAwesomeIcon icon={faFloppyDisk} aria-hidden="true" /> {saving ? "Saving…" : "Save changes"}
                </button>
              </footer>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default SettingsPage;
