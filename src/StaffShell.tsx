import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { useI18n } from "./i18n";
import { isAdminRole, isStaffRole } from "./lib/types";
import { PropertyProvider, useProps } from "./lib/scoped";
import Dropdown, { type DdItem } from "./components/Dropdown";
import Dashboard from "./pages/Dashboard";
import PropertiesPage from "./pages/PropertiesPage";
import RoomsPage from "./pages/RoomsPage";
import TenantsPage from "./pages/TenantsPage";
import ContractsPage from "./pages/ContractsPage";
import MetersPage from "./pages/MetersPage";
import InvoicesPage from "./pages/InvoicesPage";
import FinancePage from "./pages/FinancePage";
import TicketsPage from "./pages/TicketsPage";
import ResidencePage from "./pages/ResidencePage";
import AccountsPage from "./pages/AccountsPage";
import SettingsPage from "./pages/SettingsPage";
import BankTxPage from "./pages/BankTxPage";
import AuditPage from "./pages/AuditPage";

function PropPicker() {
  const { props, current, setCurrent } = useProps();
  if (props.length < 2) return null;
  return (
    <select className="proppick" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Chọn khu">
      <option value="">Tất cả khu</option>
      {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );
}

export default function StaffShell() {
  const { user, profile, loading, logout } = useAuth();
  const { L } = useI18n();
  const loc = useLocation();
  if (loading) return <div className="center">Đang tải…</div>;
  if (!user) return <Navigate to="/dang-nhap?next=/app" replace />;
  if (!isStaffRole(profile?.role)) return <Navigate to="/tai-khoan" replace />;
  const admin = isAdminRole(profile?.role);
  const owner = profile?.role === "owner";
  const isIn = (...paths: string[]) => paths.some((p) => loc.pathname.startsWith(p));

  const peopleItems: DdItem[] = [
    ...(admin ? [{ label: "Người cư trú (hồ sơ, CCCD)", to: "/app/nguoi-thue" }, { label: "Tạm trú", to: "/app/tam-tru" }] : []),
    { label: "Hợp đồng", to: "/app/hop-dong" },
  ];
  const moneyItems: DdItem[] = [
    { label: "Hóa đơn & thu tiền", to: "/app/hoa-don" },
    ...(admin ? [{ label: "Thu chi & báo cáo", to: "/app/thu-chi" }, { label: "Đối soát ngân hàng", to: "/app/ngan-hang" }] : []),
  ];
  const sysItems: DdItem[] = [
    ...(owner ? [{ label: "Tài khoản & phân quyền", to: "/app/tai-khoan" }] : []),
    ...(admin ? [{ label: "Nhật ký hoạt động", to: "/app/nhat-ky" }] : []),
    { label: "Cài đặt", to: "/app/cai-dat" },
  ];

  return (
    <PropertyProvider>
      <div className="shell">
        <header>
          <Link to="/" className="brand"><img className="brandicon" src="/favicon.svg" alt="" width="24" height="24" /> Nhà trọ</Link>
          <PropPicker />
          <span className="spacer" />
          <span className="who" title={user.email ?? ""}>{profile?.name || user.email} <span className="dd-role">({L.role[profile!.role]})</span></span>
          <button className="ghost" onClick={logout}>Đăng xuất</button>
        </header>
        <nav>
          <NavLink to="/app" end>Tổng quan</NavLink>
          {owner && <NavLink to="/app/khu">Khu nhà trọ</NavLink>}
          <NavLink to="/app/phong">Phòng</NavLink>
          <Dropdown className="st-dd" label="Người thuê" items={peopleItems} active={isIn("/app/nguoi-thue", "/app/tam-tru", "/app/hop-dong")} />
          <NavLink to="/app/chi-so">Điện nước</NavLink>
          <Dropdown className="st-dd" label="Tài chính" items={moneyItems} active={isIn("/app/hoa-don", "/app/thu-chi", "/app/ngan-hang")} />
          <NavLink to="/app/bao-hong">Báo hỏng</NavLink>
          <Dropdown className="st-dd" label="Hệ thống" items={sysItems} active={isIn("/app/tai-khoan", "/app/nhat-ky", "/app/cai-dat")} />
        </nav>
        <main>
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="phong" element={<RoomsPage />} />
            <Route path="hop-dong" element={<ContractsPage />} />
            <Route path="chi-so" element={<MetersPage />} />
            <Route path="hoa-don" element={<InvoicesPage />} />
            <Route path="bao-hong" element={<TicketsPage />} />
            <Route path="cai-dat" element={<SettingsPage />} />
            {admin && <Route path="nguoi-thue" element={<TenantsPage />} />}
            {admin && <Route path="tam-tru" element={<ResidencePage />} />}
            {admin && <Route path="thu-chi" element={<FinancePage />} />}
            {admin && <Route path="ngan-hang" element={<BankTxPage />} />}
            {admin && <Route path="nhat-ky" element={<AuditPage />} />}
            {owner && <Route path="khu" element={<PropertiesPage />} />}
            {owner && <Route path="tai-khoan" element={<AccountsPage />} />}
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </main>
      </div>
    </PropertyProvider>
  );
}
