import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Download, KeyRound, Laptop, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PasswordStrength } from '../../components/PasswordStrength';
import { SessionsPanel } from '../../components/SessionsPanel';
import { TwoFactorPanel } from '../../components/TwoFactorPanel';
import { Button, Card, Field, FormActions, Input, PageHeader } from '../../components/ui';
import { api, ApiError, downloadFile } from '../../lib/api';
import { useConfig } from '../../lib/config';
import { useToast } from '../../lib/toast';

function ChangePassword() {
  const { t } = useTranslation();
  const min = useConfig().security.passwordMinLength;
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const schema = z
    .object({
      currentPassword: z.string().min(1, t('validation.required')),
      newPassword: z
        .string()
        .min(min, t('validation.passwordMin', { n: min }))
        .regex(/\d/, t('validation.passwordDigit'))
        .regex(/[a-zA-Z]/, t('validation.passwordLetter')),
      confirm: z.string(),
    })
    .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: t('validation.passwordMatch') });
  const { register, handleSubmit, reset, watch, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={handleSubmit(async (v) => {
        setError(null);
        try {
          await api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
          toast.success(t('security.passwordChanged'));
          reset();
        } catch (e) {
          setError(e instanceof ApiError ? (e.code === 'INVALID_CREDENTIALS' ? t('security.wrongCurrent') : e.message) : t('common.error'));
        }
      })}
    >
      {error && (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <Field label={t('security.currentPassword')} error={formState.errors.currentPassword?.message}>
        <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
      </Field>
      <Field label={t('auth.newPassword')} error={formState.errors.newPassword?.message}>
        <Input type="password" autoComplete="new-password" {...register('newPassword')} />
      </Field>
      <PasswordStrength value={watch('newPassword') ?? ''} min={min} />
      <Field label={t('auth.confirmPassword')} error={formState.errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...register('confirm')} />
      </Field>
      <p className="text-xs text-subtle">{t('security.logoutOthers')}</p>
      <FormActions>
        <Button type="submit" variant="primary" loading={formState.isSubmitting} icon={<Lock size={16} />}>
          {t('security.changePassword')}
        </Button>
      </FormActions>
    </form>
  );
}

export default function Security() {
  const { t } = useTranslation();
  const toast = useToast();
  return (
    <>
      <PageHeader title={t('nav.security')} subtitle={t('security.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <KeyRound size={18} className="text-accent" /> {t('security.password')}
          </h2>
          <ChangePassword />
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-bold">{t('security.twoFactor')}</h2>
          <TwoFactorPanel />
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
            <Laptop size={18} className="text-accent" /> {t('sessions.title')}
          </h2>
          <p className="mb-4 text-sm text-muted">{t('sessions.subtitle')}</p>
          <SessionsPanel />
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-1 text-lg font-bold">{t('privacy.myDataTitle')}</h2>
          <p className="mb-4 text-sm text-muted">{t('privacy.myDataHint')}</p>
          <FormActions>
            <Button icon={<Download size={16} />} onClick={() => downloadFile('/rgpd/export', 'mes-donnees.json').catch(() => toast.error(t('common.error')))}>
              {t('privacy.export')}
            </Button>
          </FormActions>
        </Card>
      </div>
    </>
  );
}
