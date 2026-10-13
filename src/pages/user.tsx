import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDownWideShort,
  faPen,
  faRotateRight,
  faShieldHalved,
  faUserPlus,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import AppSidebar from "../components/AppSidebar";
import ProfilePhotoControl from "../components/ProfilePhotoControl";
import {
  createUserAccount,
  fetchFarms,
  fetchUserActivity,
  fetchUsers,
  getApiErrorMessage,
  getProfilePictureUrl,
  resendUserInvitation,
  revokeUserSessions,
  updateCurrentSessionUser,
  updateUserAccount,
} from "../lib/records";
import type { Farm, UserAccount, UserActivity, UserRole, UserStatus } from "../lib/records";

interface UserForm {
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  assignedFarmIds: string[];
  status: UserStatus;
}

const blankForm = (): UserForm => ({
  fullName: "",
  email: "",
  phone: "",
  role: "staff",
  assignedFarmIds: [],
  status: "active",
});

const roleLabels: Record<UserRole, string> = {
  admin: "Administrator",
  manager: "Farm manager",
  livestock_officer: "Livestock officer",
  crop_officer: "Crop officer",
  accountant: "Accountant",
  staff: "Farm worker",
};

const statusLabels: Record<UserStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
  suspended: "Suspended",
};

function getCurrentUserId() {
  try {
    const currentUser = JSON.parse(sessionStorage.getItem("user") ?? "{}") as { id?: unknown };
    return typeof currentUser.id === "string" ? currentUser.id : "";
  } catch {
    return "";
  }
}

function UsersPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [activity, setActivity] = useState<UserActivity[]>([]);
  const [form, setForm] = useState<UserForm>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentUserId] = useState(getCurrentUserId);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "activity">("newest");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [nextUsers, nextFarms] = await Promise.all([fetchUsers(), fetchFarms()]);
      setUsers(nextUsers);
      setFarms(nextFarms);
      setError("");
    } catch (loadError: unknown) {
      setError(getApiErrorMessage(loadError, "Unable to load user accounts."));
    } finally {
      setLoading(false);
    }

    try {
      setActivity(await fetchUserActivity());
      setActivityError("");
    } catch (loadError: unknown) {
      setActivityError(getApiErrorMessage(loadError, "Unable to load the audit timeline."));
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadUsers(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadUsers]);

  const resetForm = () => {
    setForm(blankForm());
    setEditingId(null);
  };

  const startEditing = (user: UserAccount) => {
    setEditingId(user.id);
    setForm({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      assignedFarmIds: user.assignedFarmIds,
      status: user.status,
    });
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (editingId) {
        const updatedUser = await updateUserAccount(editingId, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          role: form.role,
          assignedFarmIds: form.assignedFarmIds,
          status: form.status,
        });
        if (updatedUser.id === currentUserId) updateCurrentSessionUser(updatedUser);
        setNotice("User account updated.");
      } else {
        await createUserAccount({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          role: form.role,
          assignedFarmIds: form.assignedFarmIds,
        });
        setNotice("Invitation sent. The account remains pending until the user sets a password.");
      }
      resetForm();
      await loadUsers();
    } catch (saveError: unknown) {
      setError(getApiErrorMessage(saveError, "Unable to save this user account."));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (user: UserAccount, status: UserStatus) => {
    setUpdatingId(user.id);
    setError("");
    setNotice("");
    try {
      const updatedUser = await updateUserAccount(user.id, { status });
      if (updatedUser.id === currentUserId) updateCurrentSessionUser(updatedUser);
      setNotice(`${user.fullName}'s account is now ${statusLabels[status].toLowerCase()}.`);
      await loadUsers();
    } catch (updateError: unknown) {
      setError(getApiErrorMessage(updateError, "Unable to update account status."));
    } finally {
      setUpdatingId(null);
    }
  };

  const sendInvitationAgain = async (user: UserAccount) => {
    setUpdatingId(user.id);
    setError("");
    setNotice("");
    try {
      const result = await resendUserInvitation(user.id);
      setNotice(result.message);
      await loadUsers();
    } catch (inviteError: unknown) {
      setError(getApiErrorMessage(inviteError, "Unable to resend the invitation."));
    } finally {
      setUpdatingId(null);
    }
  };

  const revokeSessions = async (user: UserAccount) => {
    setRevokingId(user.id);
    setError("");
    setNotice("");
    try {
      const result = await revokeUserSessions(user.id);
      setNotice(`${result.message}. The user must sign in again.`);
      await loadUsers();
    } catch (revokeError: unknown) {
      setError(getApiErrorMessage(revokeError, "Unable to revoke sessions."));
    } finally {
      setRevokingId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return users
      .filter((user) =>
        (!normalizedQuery ||
          user.fullName.toLocaleLowerCase().includes(normalizedQuery) ||
          user.email.toLocaleLowerCase().includes(normalizedQuery)) &&
        (roleFilter === "all" || user.role === roleFilter) &&
        (statusFilter === "all" || user.status === statusFilter),
      )
      .sort((first, second) => {
        if (sortOrder === "activity") {
          return (second.lastLoginAt ?? "").localeCompare(first.lastLoginAt ?? "");
        }
        const joinedOrder = first.createdAt.localeCompare(second.createdAt);
        return sortOrder === "newest" ? -joinedOrder : joinedOrder;
      });
  }, [users, query, roleFilter, statusFilter, sortOrder]);

  const farmNames = (ids: string[]) =>
    ids.map((id) => farms.find((farm) => farm._id === id)?.name).filter(Boolean).join(", ") || "No farms assigned";

  return (
    <main className="dashboard">
      <AppSidebar />
      <section className="page">
        <div className="users-page">
          <header className="users-header">
            <div className="users-header-icon"><FontAwesomeIcon icon={faUsers} aria-hidden="true" /></div>
            <div>
              <h1>User management</h1>
              <p>Invite staff, assign farm access, manage roles and review account activity.</p>
            </div>
            <button className="users-button users-refresh" type="button" onClick={() => void loadUsers()} disabled={loading}>
              <FontAwesomeIcon icon={faRotateRight} aria-hidden="true" /> Refresh
            </button>
          </header>

          {error && <div className="users-feedback users-feedback-error" role="alert">{error}</div>}
          {notice && <div className="users-feedback users-feedback-success" role="status">{notice}</div>}

          <section className="users-panel" aria-labelledby="users-form-heading">
            <h2 id="users-form-heading">
              <FontAwesomeIcon icon={editingId ? faPen : faUserPlus} aria-hidden="true" />
              {editingId ? "Edit account" : "Invite a team member"}
            </h2>
            <p className="users-form-description">
              {editingId
                ? "Change the team member's details, role, assigned farms and account status."
                : "Send a secure, single-use activation link. Never share or set a temporary password."}
            </p>
            <form className="users-form users-form-expanded" onSubmit={handleSubmit}>
              <label htmlFor="managed-user-name">
                <span>Full name</span>
                <input id="managed-user-name" name="fullName" autoComplete="name" value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} required maxLength={120} />
              </label>
              <label htmlFor="managed-user-email">
                <span>Email address</span>
                <input id="managed-user-email" name="email" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required maxLength={254} />
              </label>
              <label htmlFor="managed-user-phone">
                <span>Phone number</span>
                <input id="managed-user-phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+234 800 000 0000" />
              </label>
              <label htmlFor="managed-user-role">
                <span>Role</span>
                <select id="managed-user-role" name="role" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}>
                  {Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                </select>
              </label>
              {editingId && (
                <label htmlFor="managed-user-status">
                  <span>Account status</span>
                  <select id="managed-user-status" name="status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as UserStatus }))}>
                    {(["active", "inactive", "suspended"] as const).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                  </select>
                </label>
              )}
              <fieldset className="users-farm-assignments">
                <legend>Assigned farms</legend>
                {farms.length === 0 ? <p>No farms are available to assign.</p> : farms.map((farm) => (
                  <label key={farm._id}>
                    <input
                      type="checkbox"
                      checked={form.assignedFarmIds.includes(farm._id)}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        assignedFarmIds: event.target.checked
                          ? [...new Set([...current.assignedFarmIds, farm._id])]
                          : current.assignedFarmIds.filter((id) => id !== farm._id),
                      }))}
                    />
                    <span>{farm.name}</span>
                  </label>
                ))}
              </fieldset>
              {editingId && (() => {
                const user = users.find((item) => item.id === editingId);
                return user ? (
                  <div className="users-photo-editor">
                    <span>Profile picture</span>
                    <ProfilePhotoControl
                      userId={user.id}
                      fullName={form.fullName}
                      profilePicture={user.profilePicture}
                      onUpdated={(updatedUser) => {
                        setUsers((current) => current.map((item) => item.id === updatedUser.id ? updatedUser : item));
                        if (updatedUser.id === currentUserId) updateCurrentSessionUser(updatedUser);
                      }}
                    />
                  </div>
                ) : null;
              })()}
              <div className="users-form-actions">
                <button className="users-button users-button-primary" type="submit" disabled={saving}>
                  <FontAwesomeIcon icon={editingId ? faPen : faUserPlus} aria-hidden="true" />
                  {saving ? "Saving…" : editingId ? "Save changes" : "Send invitation"}
                </button>
                {editingId && <button className="users-button" type="button" onClick={resetForm} disabled={saving}>Cancel</button>}
              </div>
            </form>
          </section>

          <section className="users-panel" aria-labelledby="users-list-heading">
            <div className="users-list-heading">
              <div><h2 id="users-list-heading">Team accounts</h2><p>Search, filter and manage staff access.</p></div>
              <span>{filteredUsers.length} of {users.length} users</span>
            </div>
            <div className="users-filters">
              <label htmlFor="users-search">Search<input id="users-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" /></label>
              <label htmlFor="users-role-filter">Role<select id="users-role-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as UserRole | "all")}><option value="all">All roles</option>{Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
              <label htmlFor="users-status-filter">Status<select id="users-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as UserStatus | "all")}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
              <label htmlFor="users-sort"><FontAwesomeIcon icon={faArrowDownWideShort} aria-hidden="true" /> Sort<select id="users-sort" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}><option value="newest">Date joined: newest</option><option value="oldest">Date joined: oldest</option><option value="activity">Last activity</option></select></label>
            </div>
            {loading ? (
              <p className="users-empty" role="status">Loading user accounts…</p>
            ) : filteredUsers.length === 0 ? (
              <p className="users-empty">{users.length ? "No accounts match these filters." : "No user accounts were found."}</p>
            ) : (
              <div className="users-table-wrap">
                <table className="users-table">
                  <thead><tr><th>Name</th><th>Contact</th><th>Role & farms</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <span className="users-person">
                            <span className="users-person-photo">
                              {user.profilePicture ? <img src={getProfilePictureUrl(user.profilePicture)} alt="" /> : user.fullName.charAt(0).toUpperCase()}
                            </span>
                            <span><strong>{user.fullName}{user.id === currentUserId && <span className="users-you-badge">You</span>}</strong><small>Joined {new Date(user.createdAt).toLocaleDateString()}</small></span>
                          </span>
                        </td>
                        <td>{user.email}{user.phone && <small className="users-phone">{user.phone}</small>}</td>
                        <td><strong>{roleLabels[user.role] ?? roleLabels.staff}</strong><small className="users-farm-list">{farmNames(user.assignedFarmIds)}</small></td>
                        <td><span className={`users-status users-status-${user.status}`}>{statusLabels[user.status]}</span></td>
                        <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</td>
                        <td>
                          <div className="users-row-actions">
                            <button type="button" className="users-button" onClick={() => startEditing(user)}>Edit</button>
                            {user.status === "pending" ? (
                              <button type="button" className="users-button" onClick={() => void sendInvitationAgain(user)} disabled={updatingId === user.id}>
                                {updatingId === user.id ? "Sending…" : "Resend invite"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={`users-button ${user.status === "active" ? "users-deactivate-button" : "users-activate-button"}`}
                                onClick={() => void changeStatus(user, user.status === "active" ? "inactive" : "active")}
                                disabled={updatingId === user.id || user.id === currentUserId}
                                title={user.id === currentUserId ? "You cannot deactivate your own account" : undefined}
                              >
                                {updatingId === user.id ? "Updating…" : user.status === "active" ? "Deactivate" : "Activate"}
                              </button>
                            )}
                            <button
                              type="button"
                              className="users-button"
                              onClick={() => void revokeSessions(user)}
                              disabled={revokingId === user.id || user.id === currentUserId}
                              title={user.id === currentUserId ? "Use Log out to end your own current session" : undefined}
                            >
                              <FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" /> {revokingId === user.id ? "Revoking…" : "Revoke sessions"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="users-panel users-activity-panel" aria-labelledby="users-activity-heading">
            <div className="users-list-heading">
              <div><h2 id="users-activity-heading">User activity timeline</h2><p>Server-recorded sign-ins, profile changes, farm changes and record edits.</p></div>
            </div>
            {activityError ? <p className="users-empty" role="alert">{activityError}</p> : activity.length === 0 ? <p className="users-empty">No activity has been recorded yet.</p> : (
              <ol className="users-activity-list">
                {activity.map((entry) => <li key={entry.id}>
                  <span className="users-activity-marker" />
                  <div><strong>{entry.actor?.fullName ?? "Former user"} <span>{entry.action.replaceAll("_", " ")}</span></strong><p>{entry.details || `${entry.entityType} ${entry.entityId}`}</p></div>
                  <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
                </li>)}
              </ol>
            )}
          </section>

          <p className="users-permissions-note">
            Administrators have full access. Managers manage assigned farm records. Livestock officers manage livestock and inventory; crop officers manage crops; accountants manage sales and expenses and can view reports; farm workers have read-only access to assigned farms. Role and assignment changes revoke existing sessions.
          </p>
        </div>
      </section>
    </main>
  );
}

export default UsersPage;
