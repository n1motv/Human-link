import { Navigate, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '../../components/AuthShell';
import { TwoFactorPanel } from '../../components/TwoFactorPanel';
import { HOME } from '../../app/nav';
import { useAuth } from '../../lib/auth';

/** Page imposée par la politique du client tant que la 2FA n'est pas activée (ex. comptes administrateur). */
export default function Setup2fa() {
  const { t } = useTranslation();
  const { user, pending2fa, logout } = useAuth();
  const nav = useNavigate();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <AuthShell
      title={t('security.setupTitle')}
      subtitle={t('security.setupHint')}
      footer={
        <button
          className="inline-flex items-center gap-2 font-semibold text-accent hover:underline"
          onClick={async () => {
            await logout();
            nav('/login', { replace: true });
          }}
        >
          <LogOut size={14} /> {t('auth.logout')}
        </button>
      }
    >
      <TwoFactorPanel onEnabled={() => nav(pending2fa ? '/setup-2fa' : HOME[user.role], { replace: true })} />
    </AuthShell>
  );
}
