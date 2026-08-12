import { AuthProvider, useAuth } from "./auth";
import { Layout } from "./Layout";
import { parseRoute, useHashRoute } from "./router";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { MyTasks } from "./pages/MyTasks";
import { Meetings } from "./pages/Meetings";
import { MeetingDetail } from "./pages/MeetingDetail";
import { AgendaItems } from "./pages/AgendaItems";
import { AgendaDetail } from "./pages/AgendaDetail";
import { Audit } from "./pages/Audit";
import { EngagementDetail } from "./pages/EngagementDetail";
import { Findings } from "./pages/Findings";
import { FindingDetail } from "./pages/FindingDetail";
import { Evidence } from "./pages/Evidence";
import { AuditLog } from "./pages/AuditLog";
import { Retention } from "./pages/Retention";
import { SearchPage } from "./pages/SearchPage";
import { Admin } from "./pages/Admin";
import { NotFound } from "./pages/NotFound";

function Router() {
  const route = useHashRoute();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="login-wrap">
        <p className="muted">読み込み中…</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const { path, params } = parseRoute(route);
  const newMode = params.new === "1";
  let page: React.ReactNode;
  if (path.startsWith("/meetings/")) page = <MeetingDetail id={params.id ?? ""} />;
  else if (path.startsWith("/agenda-items/")) page = <AgendaDetail id={params.id ?? ""} newMode={false} />;
  else if (path.startsWith("/findings/")) page = <FindingDetail id={params.id ?? ""} />;
  else if (path.startsWith("/audit/engagements/")) page = <EngagementDetail id={params.id ?? ""} />;
  else if (path.startsWith("/evidence/")) page = <Evidence />;
  else if (path === "/") page = <Dashboard />;
  else if (path === "/tasks") page = <MyTasks />;
  else if (path === "/meetings") page = <Meetings />;
  else if (path === "/agenda-items") page = newMode ? <AgendaDetail id="new" newMode /> : <AgendaItems />;
  else if (path === "/audit") page = <Audit />;
  else if (path === "/findings") page = <Findings />;
  else if (path === "/evidence") page = <Evidence />;
  else if (path === "/audit-log") page = <AuditLog />;
  else if (path === "/retention") page = <Retention />;
  else if (path === "/search") page = <SearchPage initial={params.q ?? ""} />;
  else if (path === "/admin") page = <Admin />;
  else page = <NotFound />;

  return <Layout current={path}>{page}</Layout>;
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
