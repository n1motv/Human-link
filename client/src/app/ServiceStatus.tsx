import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw, Wrench, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui';
import { CLIENT_BUILD } from '../lib/version';

interface Health {
  ok: boolean;
  version: string;
  maintenance: boolean;
}

const POLL_MS = 5 * 60_000;
const MAINTENANCE_POLL_MS = 15_000;

/**
 * Surveille l'état du service (GET /api/health) :
 * - version : le serveur annonce son identifiant de build. S'il diffère de celui du front chargé dans l'onglet, l'application a été
 *   mise à jour pendant que la personne travaillait : une bannière propose de recharger (jamais de rechargement forcé : un formulaire
 *   en cours ne doit pas être perdu).
 * - maintenance : l'API est fermée (MAINTENANCE=true côté serveur) ; la page de maintenance remplace l'application et se relance
 *   toute seule dès que le service revient.
 */
export function ServiceStatus({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [health, setHealth] = useState<Health | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const wasInMaintenance = useRef(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (res.ok) setHealth((await res.json()) as Health);
    } catch {
      /* réseau coupé : on réessaiera, rien à afficher de plus que les erreurs habituelles */
    }
  }, []);

  const maintenance = !!health?.maintenance;
  useEffect(() => {
    void check();
    const timer = setInterval(check, maintenance ? MAINTENANCE_POLL_MS : POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check, maintenance]);

  useEffect(() => {
    // Le service revient : on recharge pour repartir d'un état propre (et de la dernière version éventuelle).
    if (wasInMaintenance.current && health && !health.maintenance) window.location.reload();
    wasInMaintenance.current = maintenance;
  }, [health, maintenance]);

  if (maintenance) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div className="glass-strong max-w-md p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-warn/15 text-warn">
            <Wrench size={26} aria-hidden />
          </span>
          <h1 className="font-display mt-5 text-2xl font-bold">{t('service.maintenanceTitle')}</h1>
          <p className="mt-2 text-sm text-muted">{t('service.maintenanceText')}</p>
          <Button className="mt-6" icon={<RefreshCw size={16} />} onClick={() => void check()}>
            {t('service.retry')}
          </Button>
        </div>
      </div>
    );
  }

  const outdated = !!health && health.version !== CLIENT_BUILD && dismissed !== health.version;
  return (
    <>
      {outdated && (
        <div role="status" className="glass-strong fixed inset-x-4 bottom-24 z-[90] md:bottom-4 mx-auto flex max-w-lg items-center gap-3 p-4 shadow-2xl">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
            <RefreshCw size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('service.newVersionTitle')}</p>
            <p className="text-xs text-muted">{t('service.newVersionText')}</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
            {t('service.reload')}
          </Button>
          <button className="rounded-full p-1.5 text-muted hover:bg-glass-hover hover:text-fg" aria-label={t('service.later')} onClick={() => setDismissed(health.version)}>
            <X size={16} />
          </button>
        </div>
      )}
      {children}
    </>
  );
}
