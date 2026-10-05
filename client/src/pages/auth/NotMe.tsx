import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '../../components/AuthShell';
import { Button, FormActions } from '../../components/ui';
import { api, ApiError } from '../../lib/api';

/** Page ouverte depuis l'e-mail « nouvelle connexion » : « ce n'était pas moi » ferme toutes les sessions. */
export default function NotMe() {
  const { t } = useTranslation();
  const token = useSearchParams()[0].get('token') ?? '';
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'invalid'>(token ? 'idle' : 'invalid');

  const confirm = async () => {
    setState('busy');
    try {
      await api.post('/auth/not-me', { token }, { noRefresh: true });
      setState('done');
    } catch (e) {
      setState(e instanceof ApiError && e.status < 500 ? 'invalid' : 'idle');
    }
  };

  return (
    <AuthShell
      title={t('notMe.title')}
      subtitle={state === 'idle' || state === 'busy' ? t('notMe.hint') : undefined}
      footer={
        <Link to="/login" className="font-semibold text-accent hover:underline">
          {t('common.back')}
        </Link>
      }
    >
      {state === 'done' ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ok/15 text-ok">
            <ShieldCheck size={28} />
          </span>
          <p className="text-sm text-muted">{t('notMe.done')}</p>
        </div>
      ) : state === 'invalid' ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-bad/15 text-bad">
            <ShieldAlert size={28} />
          </span>
          <p className="text-sm text-muted">{t('notMe.invalid')}</p>
        </div>
      ) : (
        <FormActions>
          <Button variant="danger" loading={state === 'busy'} icon={<ShieldAlert size={16} />} onClick={() => void confirm()}>
            {t('notMe.button')}
          </Button>
        </FormActions>
      )}
    </AuthShell>
  );
}
