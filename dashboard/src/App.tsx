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

// VITE_AUTH_DISABLED matches the API's DASHBOARD_AUTH_DISABLED — set for throwaway
// testing only. Never build with this on for a deployment holding real customer data.
const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === "true";

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!AUTH_DISABLED && !getToken()) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
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
