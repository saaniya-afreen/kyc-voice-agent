import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { type ReactNode } from "react";
import { getToken } from "@/lib/api";
import { Layout } from "@/components/Layout";
import Login from "@/pages/Login";
import Overview from "@/pages/Overview";
import Worklist from "@/pages/Worklist";
import ComplianceQueue from "@/pages/ComplianceQueue";
import CaseDetail from "@/pages/CaseDetail";
import CustomerDetail from "@/pages/CustomerDetail";

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!getToken()) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Overview />} />
        <Route path="/worklist" element={<Worklist />} />
        <Route path="/compliance" element={<ComplianceQueue />} />
        <Route path="/compliance/:caseId" element={<CaseDetail />} />
        <Route path="/customers/:customerId" element={<CustomerDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
