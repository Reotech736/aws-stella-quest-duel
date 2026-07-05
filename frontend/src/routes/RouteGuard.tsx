import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export function ProtectedRoutes() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === "loading") {
    return <main className="page-shell">認証状態を確認しています。</main>;
  }
  if (auth.status === "anonymous") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}

export function AnonymousOnly() {
  const auth = useAuth();
  if (auth.status === "loading") {
    return <main className="page-shell">認証状態を確認しています。</main>;
  }
  if (auth.status === "authenticated") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
