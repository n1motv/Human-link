import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '../../components/AuthShell';
import { Button, Field, Input } from '../../components/ui';
import { api, ApiError } from '../../lib/api';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schema = z.object({ email: z.email(t('validation.email')) });
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const back = (
    <Link to="/login" className="font-semibold text-accent hover:underline">
      {t('common.back')}
    </Link>
  );

  return (
    <AuthShell title={t('auth.forgotTitle')} subtitle={sent ? undefined : t('auth.forgotHint')} footer={back}>
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ok/15 text-ok">
            <MailCheck size={28} />
          </span>
          <p className="text-sm text-muted">{t('auth.forgotSent')}</p>
        </div>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={handleSubmit(async (v) => {
            setError(null);
            try {
              await api.post('/auth/forgot-password', v, { noRefresh: true });
              setSent(true);
            } catch (e) {
              setError(e instanceof ApiError && e.code === 'RATE_LIMITED' ? t('auth.tooMany') : t('common.error'));
            }
          })}
        >
          {error && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
          <Field label={t('auth.email')} error={formState.errors.email?.message}>
            <Input {...register('email')} type="email" autoComplete="email" autoFocus invalid={!!formState.errors.email} />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting}>
            {t('auth.sendLink')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
