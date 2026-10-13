import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faCartShopping,
  faChartColumn,
  faGear,
  faGaugeHigh,
  faHeartPulse,
  faHouse,
  faReceipt,
  faRightFromBracket,
  faUsers,
  faBoxesStacked,
  faWheatAwn,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { canReadRecordType, getProfilePictureUrl } from "../lib/records";
import type { RecordType, UserRole } from "../lib/records";

const navigationItems = [
  { label: "Livestock", icon: faHeartPulse, href: "/records/livestock" },
  { label: "Crops", icon: faWheatAwn, href: "/records/crops" },
  { label: "Farm", icon: faHouse, href: "/farms" },
  { label: "Inventory", icon: faBoxesStacked, href: "/records/inventory" },
  { label: "Sales", icon: faCartShopping, href: "/records/sales" },
  { label: "Expenses", icon: faReceipt, href: "/records/expenses" },
  { label: "Reports", icon: faChartColumn, href: "/reports" },
  { label: "Users", icon: faUsers, href: "/users" },
  { label: "Settings", icon: faGear, href: "/settings" },
];

function AppSidebar() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [account, setAccount] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("user") ?? "{}") as {
        fullName?: string;
        role?: UserRole;
        profilePicture?: string;
      };
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const refreshAccount = () => {
      try {
        setAccount(JSON.parse(sessionStorage.getItem("user") ?? "{}"));
      } catch {
        setAccount({});
      }
    };
    window.addEventListener("agroliv:user-updated", refreshAccount);
    window.addEventListener("storage", refreshAccount);
    return () => {
      window.removeEventListener("agroliv:user-updated", refreshAccount);
      window.removeEventListener("storage", refreshAccount);
    };
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("userName");
    sessionStorage.removeItem("lastLoginAt");
    sessionStorage.removeItem("userRole");
    navigate("/", { replace: true });
  };

  return (
    <>
      <button
        type="button"
        className="mobile-menu-toggle"
        aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={isMobileMenuOpen}
        aria-controls="app-sidebar"
        onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
      >
        <FontAwesomeIcon icon={isMobileMenuOpen ? faXmark : faBars} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`mobile-menu-backdrop${isMobileMenuOpen ? " is-visible" : ""}`}
        aria-label="Close navigation menu"
        aria-hidden={!isMobileMenuOpen}
        disabled={!isMobileMenuOpen}
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <aside
        id="app-sidebar"
        className={`sidebar-menu${isMobileMenuOpen ? " is-open" : ""}`}
      >
        <div className="brand">
          <img src={logo} alt="Agro Livestock" />
        </div>
        <div className="sidebar-links">
          <Link
            to="/dashboard"
            className="nav-item active"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <FontAwesomeIcon icon={faGaugeHigh} aria-hidden="true" />
            <span>Dashboard</span>
          </Link>
          {navigationItems.filter((item) => {
            const role = account.role ?? (sessionStorage.getItem("userRole") as UserRole | null) ?? "staff";
            const recordTypes: Partial<Record<string, RecordType>> = {
              Livestock: "livestock",
              Crops: "crops",
              Inventory: "inventory",
              Sales: "sales",
              Expenses: "expenses",
            };
            if (item.label === "Users") return role === "admin";
            const recordType = recordTypes[item.label];
            if (recordType) return canReadRecordType(role, recordType);
            if (item.label === "Reports") return !["livestock_officer", "crop_officer"].includes(role);
            return true;
          }).map((item) => (
            <Link
              key={item.label}
              to={item.href}
              className="nav-item"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <FontAwesomeIcon icon={item.icon} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
        <div className="sidebar-account">
          <span className="sidebar-account-photo">
            {account.profilePicture
              ? <img src={getProfilePictureUrl(account.profilePicture)} alt="" />
              : <FontAwesomeIcon icon={faUsers} aria-hidden="true" />}
          </span>
          <span className="sidebar-account-name">{account.fullName ?? sessionStorage.getItem("userName") ?? "Farm user"}</span>
        </div>
        <button type="button" className="aside-logout" onClick={handleLogout}>
          <FontAwesomeIcon icon={faRightFromBracket} aria-hidden="true" />
          Log out
        </button>
      </aside>
    </>
  );
}

export default AppSidebar;
