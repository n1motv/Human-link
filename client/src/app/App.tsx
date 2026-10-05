import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppSplash } from '../components/AppSplash';
import { RouteProgress } from '../components/RouteProgress';
import { useAuth } from '../lib/auth';
import { useConfig } from '../lib/config';
import type { PublicConfig, Role } from '../lib/types';
import { HOME } from './nav';
import { Layout } from './Layout';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const page = <T extends { default: React.ComponentType<any> }>(loader: () => Promise<T>) => lazy(loader);

const Login = page(() => import('../pages/auth/Login'));
const ForgotPassword = page(() => import('../pages/auth/ForgotPassword'));
const SetPassword = page(() => import('../pages/auth/SetPassword'));
const Setup2fa = page(() => import('../pages/auth/Setup2fa'));
const NotMe = page(() => import('../pages/auth/NotMe'));
const PublicContact = page(() => import('../pages/common/Contact'));
const InternalContact = page(() => import('../pages/common/Contact').then((m) => ({ default: m.ContactInternal })));
const Privacy = page(() => import('../pages/common/Privacy'));
const NotFound = page(() => import('../pages/common/NotFound'));

const Notifications = page(() => import('../pages/common/Notifications'));
const Security = page(() => import('../pages/common/Security'));

const Home = page(() => import('../pages/employee/Home'));
const MyLeaves = page(() => import('../pages/employee/MyLeaves'));
const MySick = page(() => import('../pages/employee/MySick'));
const Telework = page(() => import('../pages/employee/Telework'));
const Invitations = page(() => import('../pages/employee/Invitations'));
const MyCalendar = page(() => import('../pages/employee/MyCalendar'));
const MyVault = page(() => import('../pages/employee/MyVault'));
const Feedback = page(() => import('../pages/employee/Feedback'));
const Profile = page(() => import('../pages/employee/Profile'));

const Team = page(() => import('../pages/manager/Team'));
const LeaveRequests = page(() => import('../pages/shared/LeaveRequests'));
const Bonuses = page(() => import('../pages/shared/Bonuses'));
const Organize = page(() => import('../pages/manager/Organize'));
const TeamCalendar = page(() => import('../pages/shared/TeamCalendar'));

const Dashboard = page(() => import('../pages/admin/Dashboard'));
const Employees = page(() => import('../pages/admin/Employees'));
const Org = page(() => import('../pages/admin/Org'));
const SickRequests = page(() => import('../pages/admin/SickRequests'));
const AdminVault = page(() => import('../pages/admin/AdminVault'));
const FeedbackResults = page(() => import('../pages/admin/FeedbackResults'));
const Contacts = page(() => import('../pages/admin/Contacts'));
const Audit = page(() => import('../pages/admin/Audit'));

function Protected() {
  const { user, loading, pending2fa } = useAuth();
  const loc = useLocation();
  if (loading) return <AppSplash />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  // Politique du client : certains rôles doivent activer la 2FA avant toute autre action.
  if (pending2fa && loc.pathname !== '/setup-2fa') return <Navigate to="/setup-2fa" replace />;
  return <Outlet />;
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  return roles.includes(user.role) ? <>{children}</> : <Navigate to={HOME[user.role]} replace />;
}

function RequireModule({ name, children }: { name: keyof PublicConfig['modules']; children: ReactNode }) {
  const { modules } = useConfig();
  return modules[name] ? <>{children}</> : <NotFound />;
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <AppSplash />;
  return <Navigate to={user ? HOME[user.role] : '/login'} replace />;
}

const adminOnly = (el: ReactNode, module?: keyof PublicConfig['modules']) => (
  <RequireRole roles={['admin']}>{module ? <RequireModule name={module}>{el}</RequireModule> : el}</RequireRole>
);
const managerOnly = (el: ReactNode, module?: keyof PublicConfig['modules']) => (
  <RequireRole roles={['manager']}>{module ? <RequireModule name={module}>{el}</RequireModule> : el}</RequireRole>
);
const staff = (el: ReactNode, module?: keyof PublicConfig['modules']) => (
  <RequireRole roles={['employe', 'manager']}>{module ? <RequireModule name={module}>{el}</RequireModule> : el}</RequireRole>
);

export function App() {
  return (
    <Suspense fallback={<AppSplash />}>
      <RouteProgress />
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<SetPassword mode="reset" />} />
        <Route path="/activate" element={<SetPassword mode="activate" />} />
        <Route path="/not-me" element={<NotMe />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/contact" element={<RequireModule name="contact"><PublicContact /></RequireModule>} />

        <Route element={<Protected />}>
          <Route path="/setup-2fa" element={<Setup2fa />} />
          <Route element={<Layout />}>
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/security" element={<Security />} />
            <Route path="/support" element={<RequireModule name="contact"><InternalContact /></RequireModule>} />

            {/* Espace personnel : employés et managers */}
            <Route path="/me" element={staff(<Home />)} />
            <Route path="/me/profile" element={staff(<Profile />)} />
            <Route path="/me/leaves" element={staff(<MyLeaves />, 'leaves')} />
            <Route path="/me/sick" element={staff(<MySick />, 'sickLeaves')} />
            <Route path="/me/telework" element={staff(<Telework />, 'telework')} />
            <Route path="/me/meetings" element={staff(<Invitations />, 'meetings')} />
            <Route path="/me/calendar" element={staff(<MyCalendar />)} />
            <Route path="/me/vault" element={staff(<MyVault />, 'vault')} />
            <Route path="/me/feedback" element={staff(<Feedback />, 'feedback')} />

            {/* Manager */}
            <Route path="/manager" element={managerOnly(<Team />)} />
            <Route path="/manager/leaves" element={managerOnly(<LeaveRequests role="manager" />, 'leaves')} />
            <Route path="/manager/bonuses" element={managerOnly(<Bonuses role="manager" />, 'bonuses')} />
            <Route path="/manager/meetings" element={managerOnly(<Organize />, 'meetings')} />
            <Route path="/manager/calendar" element={managerOnly(<TeamCalendar />)} />

            {/* Admin */}
            <Route path="/admin" element={adminOnly(<Dashboard />)} />
            <Route path="/admin/employees" element={adminOnly(<Employees />)} />
            <Route path="/admin/org" element={adminOnly(<Org />, 'orgChart')} />
            <Route path="/admin/leaves" element={adminOnly(<LeaveRequests role="admin" />, 'leaves')} />
            <Route path="/admin/sick" element={adminOnly(<SickRequests />, 'sickLeaves')} />
            <Route path="/admin/bonuses" element={adminOnly(<Bonuses role="admin" />, 'bonuses')} />
            <Route path="/admin/calendar" element={adminOnly(<TeamCalendar />)} />
            <Route path="/admin/vault" element={adminOnly(<AdminVault />, 'vault')} />
            <Route path="/admin/feedback" element={adminOnly(<FeedbackResults />, 'feedback')} />
            <Route path="/admin/contacts" element={adminOnly(<Contacts />, 'contact')} />
            <Route path="/admin/audit" element={adminOnly(<Audit />)} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
