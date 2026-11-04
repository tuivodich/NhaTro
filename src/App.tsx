import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import ListingPage from "./pages/ListingPage";
import ProductPage from "./pages/ProductPage";
import Login from "./pages/Login";
import Account from "./pages/Account";
import MyProfile from "./pages/MyProfile";
import InvoiceView from "./pages/InvoiceView";
import StaffShell from "./StaffShell";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/gioi-thieu" element={<ProductPage />} />
      <Route path="/phong/:id" element={<ListingPage />} />
      <Route path="/dang-nhap" element={<Login />} />
      <Route path="/tai-khoan" element={<Account />} />
      <Route path="/ho-so" element={<MyProfile />} />
      <Route path="/hoa-don/:id" element={<InvoiceView />} />
      <Route path="/app/*" element={<StaffShell />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
