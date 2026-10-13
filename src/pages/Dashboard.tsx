import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretUp,
  faCartShopping,
  faChartLine,
  faClock,
  faCloudBolt,
  faCloudRain,
  faCloudSun,
  faCoins,
  faCow,
  faSeedling,
  faSmog,
  faSnowflake,
  faSun,
  faTractor,
  faTree,
  faUser,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import AppSidebar from "../components/AppSidebar";
import FinancialMonitoring from "../components/FinancialMonitoring";
import SalesCropOverview from "../components/SalesCropOverview";
import { formatCurrency, useCurrency } from "../lib/currency";
import type { DashboardSummary } from "../lib/records";
import {
  getProfilePictureUrl,
  fetchDashboardSummary,
  getApiErrorMessage,
  RECORDS_CHANGED_EVENT,
  RECORDS_STORAGE_KEY,
} from "../lib/records";

interface CurrentWeather {
  temperature: number;
  code: number;
}

const weatherDescriptions: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

function getWeatherIcon(code: number) {
  if (code >= 95) return faCloudBolt;
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return faCloudRain;
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return faSnowflake;
  if ([45, 48].includes(code)) return faSmog;
  if (code === 0) return faSun;
  return faCloudSun;
}

function Dashboard() {
  const currency = useCurrency();
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherUnavailable, setWeatherUnavailable] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const userName = sessionStorage.getItem("userName")?.trim() || "Farmer";
  const profilePicture = (() => {
    try {
      return (JSON.parse(sessionStorage.getItem("user") ?? "{}") as { profilePicture?: string }).profilePicture ?? "";
    } catch {
      return "";
    }
  })();
  const firstName = userName.split(/\s+/)[0];
  const lastLoginValue = sessionStorage.getItem("lastLoginAt");
  const lastLogin = lastLoginValue ? new Date(lastLoginValue) : null;
  const validLastLogin = lastLogin && !Number.isNaN(lastLogin.getTime());
  const welcomeType = (location.state as { welcomeType?: string } | null)
    ?.welcomeType;
  const welcomeMessage =
    welcomeType === "signup"
      ? `Welcome to AgroLiv, ${firstName}`
      : `Welcome back, ${firstName}`;
  const timeOfDay =
    currentTime.getHours() < 12
      ? "morning"
      : currentTime.getHours() < 18
        ? "afternoon"
        : "evening";
  const formattedLastLogin = validLastLogin
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(lastLogin)
    : "Not available";
  const monthLabel = summary
    ? new Intl.DateTimeFormat(undefined, { month: "short" }).format(
        new Date(`${summary.month}-01T00:00:00Z`),
      )
    : "";
  const previousMonthLabel = summary
    ? (() => {
        const previousMonth = new Date(`${summary.month}-01T00:00:00Z`);
        previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
        return new Intl.DateTimeFormat(undefined, { month: "short" }).format(
          previousMonth,
        );
      })()
    : "";
  const formatMonthlyChange = (current: number, previous: number) => {
    if (previous === 0) {
      return current === 0
        ? `No records in ${previousMonthLabel}`
        : `New vs ${previousMonthLabel}`;
    }

    const change = Math.round(((current - previous) / previous) * 100);
    return `${change > 0 ? "+" : ""}${change}% vs ${previousMonthLabel}`;
  };
  useEffect(() => {
    let active = true;
    let requestInProgress = false;
    const loadSummary = async () => {
      if (!active || requestInProgress) return;
      requestInProgress = true;

      try {
        const nextSummary = await fetchDashboardSummary();
        if (!active) return;
        setSummary(nextSummary);
        setSummaryError("");
      } catch (error: unknown) {
        if (!active) return;
        setSummaryError(
          getApiErrorMessage(error, "Unable to load dashboard data right now."),
        );
      } finally {
        requestInProgress = false;
        if (active) setSummaryLoading(false);
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === RECORDS_STORAGE_KEY) void loadSummary();
    };

    void loadSummary();
    const dashboardRefresh = window.setInterval(() => void loadSummary(), 10_000);
    window.addEventListener(RECORDS_CHANGED_EVENT, loadSummary);
    window.addEventListener("storage", handleStorageChange);

    const updateWeather = async () => {
      try {
        const response = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=8.8833&longitude=7.8667&current=temperature_2m,weather_code&timezone=Africa%2FLagos",
        );

        if (!response.ok) {
          throw new Error(`Weather service returned ${response.status}`);
        }

        const data: {
          current?: { temperature_2m?: number; weather_code?: number };
        } = await response.json();
        const temperature = data.current?.temperature_2m;
        const code = data.current?.weather_code;

        if (typeof temperature !== "number" || typeof code !== "number") {
          throw new Error(
            "Weather service returned incomplete current conditions",
          );
        }

        setWeather({ temperature, code });
        setWeatherUnavailable(false);
      } catch (error) {
        console.error("Unable to load current weather:", error);
        setWeatherUnavailable(true);
      }
    };

    void updateWeather();
    const weatherRefresh = window.setInterval(
      () => void updateWeather(),
      15 * 60 * 1000,
    );
    const clockRefresh = window.setInterval(
      () => setCurrentTime(new Date()),
      60 * 1000,
    );

    return () => {
      active = false;
      window.clearInterval(dashboardRefresh);
      window.clearInterval(weatherRefresh);
      window.clearInterval(clockRefresh);
      window.removeEventListener(RECORDS_CHANGED_EVENT, loadSummary);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return (
    <main className="dashboard">
      <AppSidebar />

      <section className="page">
        <div className="site-pages">
          <div className="site-pages-header">
            <div className="site-pages-header-title">
              <h1>
                Good {timeOfDay}, {firstName}!
              </h1>
              <span>
                <FontAwesomeIcon icon={faTractor} className="me-2 align-middle" aria-hidden="true" />
                {welcomeMessage}
              </span>
            </div>
            <div className="site-pages-header-info">
              <span>
                <FontAwesomeIcon
                  icon={weather ? getWeatherIcon(weather.code) : faCloudSun}
                  className="me-2 align-middle"
                  aria-hidden="true"
                />
                Keffi, NG:{" "}
                {weather
                  ? `${Math.round(weather.temperature)}°C - ${weatherDescriptions[weather.code] ?? "Current conditions"}`
                  : weatherUnavailable
                    ? "Weather unavailable"
                    : "Loading weather..."}
              </span>
              <span>
                <FontAwesomeIcon icon={faClock} className="me-2 align-middle" aria-hidden="true" />
                Last login: {formattedLastLogin}
              </span>
            </div>
            <div className="site-pages-header-user">
              <span className="dashboard-account">
                {profilePicture
                  ? <img src={getProfilePictureUrl(profilePicture)} alt="" />
                  : <FontAwesomeIcon icon={faUser} className="me-2 align-middle" aria-hidden="true" />}
                {userName}
              </span>
            </div>
          </div>
          {/*  Livestock for main content */}
          <div className="livestock-pages-content">
            {summaryError && (
              <div className="dashboard-data-error" role="alert">
                <span>{summaryError}</span>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT))}
                >
                  Try again
                </button>
              </div>
            )}
            {summaryLoading && !summary && (
              <p className="dashboard-data-status" role="status">Loading farm data...</p>
            )}
            <div className="livestock-page-content-row">
              {/* Livestock Metric */}
              <div className="livestock-pages-col">
                <div>
                  <div className="livestock-pages-col-header">
                    <span className="livestock-pages-col-header-icon">
                      <FontAwesomeIcon icon={faCow} aria-hidden="true" />
                    </span>
                    <span>Livestock Metric</span>
                  </div>
                </div>

                <div className="livestock-pages-col-body">
                  {summary
                    ? summary.livestockCount.toLocaleString()
                    : summaryLoading
                      ? "..."
                      : "Unavailable"}
                </div>

                <div className="livestock-pages-col-footer">
                  <span>Total livestock records</span>
                </div>

                <Link to="/records/livestock" className="livestock-pages-col-link">
                  <span className="hover-underline">View Livestock →</span>
                  <FontAwesomeIcon icon={faCow} aria-hidden="true" />
                </Link>
              </div>

              {/* Active Crop Fields */}
              <div className="livestock-pages-col crops-card">
                <div>
                  <div className="livestock-pages-col-header">
                    <span className="livestock-pages-col-header-icon">
                      <FontAwesomeIcon icon={faSeedling} aria-hidden="true" />
                    </span>
                    <span>Active Crop Fields</span>
                  </div>
                </div>

                <div className="livestock-pages-col-body">
                  {summary
                    ? summary.activeCropFieldCount.toLocaleString()
                    : summaryLoading
                      ? "..."
                      : "Unavailable"}
                </div>

                <div className="livestock-pages-col-footer">
                  <span>
                    {summary
                      ? `${summary.plantedHectares.toLocaleString(undefined, { maximumFractionDigits: 2 })} ha planted`
                      : "Planted hectares"}
                  </span>
                </div>

                <Link to="/records/crops" className="livestock-pages-col-link">
                  <span className="hover-underline">View Crops →</span>
                  <FontAwesomeIcon icon={faTree} aria-hidden="true" />
                </Link>
              </div>

              {/* Total Sales */}
              <div className="livestock-pages-col sales-card">
                <div>
                  <div className="livestock-pages-col-header">
                    <span className="livestock-pages-col-header-icon">
                      <FontAwesomeIcon icon={faCartShopping} aria-hidden="true" />
                    </span>
                    <span>Total Sales ({monthLabel || "this month"})</span>
                  </div>
                </div>

                <div className="livestock-pages-col-body">
                  {summary
                    ? formatCurrency(summary.salesTotal, currency)
                    : summaryLoading
                      ? "..."
                      : "Unavailable"}
                </div>

                <div className="livestock-pages-col-footer">
                  <FontAwesomeIcon
                    icon={
                      summary && summary.salesTotal < summary.previousMonthSalesTotal
                        ? faCaretDown
                        : faCaretUp
                    }
                    aria-hidden="true"
                  />
                  <span>
                    {summary
                      ? formatMonthlyChange(
                          summary.salesTotal,
                          summary.previousMonthSalesTotal,
                        )
                      : "Compared with previous month"}
                  </span>
                </div>

                <Link to="/records/sales" className="livestock-pages-col-link">
                  <span className="hover-underline">View Sales →</span>
                  <FontAwesomeIcon icon={faChartLine} aria-hidden="true" />
                </Link>
              </div>

              {/* Expenses */}
              <div className="livestock-pages-col expenses-card">
                <div>
                  <div className="livestock-pages-col-header">
                    <span className="livestock-pages-col-header-icon">
                      <FontAwesomeIcon icon={faWallet} aria-hidden="true" />
                    </span>
                    <span>Expenses ({monthLabel || "this month"})</span>
                  </div>
                </div>

                <div className="livestock-pages-col-body">
                  {summary
                    ? formatCurrency(summary.expensesTotal, currency)
                    : summaryLoading
                      ? "..."
                      : "Unavailable"}
                </div>

                <div className="livestock-pages-col-footer">
                  <FontAwesomeIcon
                    icon={
                      summary &&
                      summary.expensesTotal < summary.previousMonthExpensesTotal
                        ? faCaretDown
                        : faCaretUp
                    }
                    aria-hidden="true"
                  />
                  <span>
                    {summary
                      ? formatMonthlyChange(
                          summary.expensesTotal,
                          summary.previousMonthExpensesTotal,
                        )
                      : "Compared with previous month"}
                  </span>
                </div>

                <Link to="/records/expenses" className="livestock-pages-col-link">
                  <span className="hover-underline">View Expenses →</span>
                  <FontAwesomeIcon icon={faCoins} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
          <FinancialMonitoring />
          <div className="livestock-pages-footer">
            <SalesCropOverview />
          </div>
        </div>
      </section>
    </main>
  );
}

export default Dashboard;
