import axios from "axios";
import { API_BASE_URL } from "./api";

export type RecordType = "livestock" | "crops" | "sales" | "expenses" | "inventory";

export interface DashboardSummary {
  month: string;
  livestockCount: number;
  activeCropFieldCount: number;
  plantedHectares: number;
  salesTotal: number;
  previousMonthSalesTotal: number;
  expensesTotal: number;
  inventoryItemCount: number;
  previousMonthExpensesTotal: number;
}

export interface FinancialMonitoringData {
  monthly: { month: string; sales: number; expenses: number }[];
  canViewSales: boolean;
  canViewExpenses: boolean;
  alerts: {
    id: string;
    type: "inventory" | "farm" | "crop" | "livestock" | "health" | "routine";
    title: string;
    source: string;
    status: string;
    detail: string;
    href: string;
  }[];
}

export interface FarmRoutine {
  id: string;
  clientId?: string;
  title: string;
  type: "Feeding" | "Vaccination" | "Irrigation" | "Fertilizing" | "Planting" | "Harvesting" | "Other";
  dueDate: string;
  repeat: "Does not repeat" | "Daily" | "Weekly" | "Monthly";
  completed: boolean;
  farmId: string;
  farmName: string;
}

export interface FarmRecord {
  _id: string;
  name?: string;
  species?: string;
  tagId?: string;
  farmId?: string | null;
  status?: "active" | "inactive" | "maintenance";
  plantedHectares?: number;
  description?: string;
  amount?: number;
  category?: string;
  quantity?: number;
  unit?: string;
  reorderLevel?: number;
  date?: string;
  createdAt: string;
}

export type RecordPayload = Record<string, string | number>;

export interface FarmPerformance {
  livestockCount: number;
  activeCropFieldCount: number;
  plantedHectares: number;
  salesTotal: number;
  expensesTotal: number;
  inventoryItemCount: number;
}

export interface Farm {
  _id: string;
  name: string;
  location: string;
  sizeHectares: number;
  farmType: string;
  owner: string;
  cropAreaHectares: number;
  livestockAreaHectares: number;
  otherAreaHectares: number;
  status: "active" | "inactive" | "maintenance";
  performance?: FarmPerformance;
  createdAt: string;
}

export type UserRole =
  | "admin"
  | "manager"
  | "livestock_officer"
  | "crop_officer"
  | "accountant"
  | "staff";

export type UserStatus = "active" | "inactive" | "pending" | "suspended";

export function canReadRecordType(role: UserRole, type: RecordType) {
  return !["livestock_officer", "crop_officer"].includes(role) ||
    (role === "livestock_officer" && ["livestock", "inventory"].includes(type)) ||
    (role === "crop_officer" && type === "crops");
}

export function canWriteRecordType(role: UserRole, type: RecordType) {
  return role === "admin" ||
    role === "manager" ||
    (role === "livestock_officer" && ["livestock", "inventory"].includes(type)) ||
    (role === "crop_officer" && type === "crops") ||
    (role === "accountant" && ["sales", "expenses"].includes(type));
}

export interface UserAccount {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  assignedFarmIds: string[];
  profilePicture: string;
  status: UserStatus;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserActivity {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
  actor: { id: string; fullName: string; email: string } | null;
  targetUser: { id: string; fullName: string; email: string } | null;
}

export const RECORDS_CHANGED_EVENT = "agroliv:records-changed";
export const RECORDS_STORAGE_KEY = "agroliv:records-updated-at";
export const MONITORING_CHANGED_EVENT = "agroliv:monitoring-changed";

const apiClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export async function fetchDashboardSummary() {
  const response = await apiClient.get<DashboardSummary>("/dashboard/summary");
  return response.data;
}

export async function fetchFinancialMonitoring() {
  const response = await apiClient.get<FinancialMonitoringData>("/dashboard/monitoring");
  return response.data;
}

export async function fetchFarmRoutines() {
  const response = await apiClient.get<FarmRoutine[]>("/routines");
  return response.data;
}

export async function createFarmRoutine(routine: Omit<FarmRoutine, "id" | "farmName">) {
  const response = await apiClient.post<FarmRoutine>("/routines", routine);
  return response.data;
}

export async function updateFarmRoutine(
  id: string,
  routine: Partial<Omit<FarmRoutine, "id" | "farmName">>,
) {
  const response = await apiClient.patch<FarmRoutine>(`/routines/${id}`, routine);
  return response.data;
}

export async function deleteFarmRoutine(id: string) {
  await apiClient.delete(`/routines/${id}`);
}

export function notifyMonitoringChanged() {
  window.dispatchEvent(new Event(MONITORING_CHANGED_EVENT));
}

export async function fetchRecords(type: RecordType) {
  const response = await apiClient.get<FarmRecord[]>(`/records/${type}`);
  return response.data;
}

export async function createRecord(type: RecordType, record: RecordPayload) {
  const response = await apiClient.post<FarmRecord>(`/records/${type}`, record);
  return response.data;
}

export async function updateRecord(
  type: RecordType,
  id: string,
  record: RecordPayload,
) {
  const response = await apiClient.put<FarmRecord>(
    `/records/${type}/${id}`,
    record,
  );
  return response.data;
}

export async function deleteRecord(type: RecordType, id: string) {
  await apiClient.delete(`/records/${type}/${id}`);
}

export async function fetchFarms() {
  const response = await apiClient.get<Farm[]>("/farms");
  return response.data;
}

export async function createFarm(farm: RecordPayload) {
  const response = await apiClient.post<Farm>("/farms", farm);
  return response.data;
}

export async function updateFarm(id: string, farm: RecordPayload) {
  const response = await apiClient.put<Farm>(`/farms/${id}`, farm);
  return response.data;
}

export async function deleteFarm(id: string) {
  await apiClient.delete(`/farms/${id}`);
}

export async function fetchUsers() {
  const response = await apiClient.get<UserAccount[]>("/users");
  return response.data;
}

export async function createUserAccount(user: {
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  assignedFarmIds: string[];
}) {
  const response = await apiClient.post<UserAccount>("/users", user);
  return response.data;
}

export async function updateUserAccount(
  id: string,
  updates: Partial<Pick<UserAccount, "fullName" | "email" | "phone" | "role" | "assignedFarmIds" | "status" | "isActive">>,
) {
  const response = await apiClient.patch<UserAccount>(`/users/${id}`, updates);
  return response.data;
}

export async function uploadUserProfilePicture(id: string, imageData: string) {
  const endpoint = id === "me" ? "/users/me/profile-picture" : `/users/${id}/profile-picture`;
  const response = await apiClient.patch<UserAccount>(endpoint, { imageData });
  return response.data;
}

export async function removeUserProfilePicture(id: string) {
  const endpoint = id === "me" ? "/users/me/profile-picture" : `/users/${id}/profile-picture`;
  const response = await apiClient.delete<UserAccount>(endpoint);
  return response.data;
}

export async function resendUserInvitation(id: string) {
  const response = await apiClient.post<{ message: string }>(`/users/${id}/invitation`);
  return response.data;
}

export async function revokeUserSessions(id: string) {
  const response = await apiClient.post<{ message: string }>(`/users/${id}/revoke-sessions`);
  return response.data;
}

export async function fetchUserActivity() {
  const response = await apiClient.get<UserActivity[]>("/users/activity");
  return response.data;
}

export function getProfilePictureUrl(profilePicture: string | undefined) {
  if (!profilePicture) return "";
  if (/^https?:\/\//i.test(profilePicture)) return profilePicture;
  return `${API_BASE_URL}${profilePicture.startsWith("/") ? profilePicture : `/${profilePicture}`}`;
}

export function updateCurrentSessionUser(user: UserAccount) {
  const current = sessionStorage.getItem("user");
  let previous: Record<string, unknown> = {};
  if (current) {
    try {
      const parsed: unknown = JSON.parse(current);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        previous = parsed as Record<string, unknown>;
      }
    } catch {
      previous = {};
    }
  }
  sessionStorage.setItem(
    "user",
    JSON.stringify({
      ...previous,
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      profilePicture: user.profilePicture,
      role: user.role,
    }),
  );
  sessionStorage.setItem("userName", user.fullName);
  window.dispatchEvent(new Event("agroliv:user-updated"));
}

export function notifyRecordsChanged() {
  window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT));

  try {
    localStorage.setItem(RECORDS_STORAGE_KEY, String(Date.now()));
  } catch (error) {
    console.warn("Unable to notify other tabs about the record change:", error);
  }
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    if (error.response?.data?.message) return error.response.data.message;
    if (error.request) {
      return "Unable to reach the farm service. Check your connection and try again.";
    }
    return error.message || fallback;
  }

  return fallback;
}
