import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Mail, MapPin, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthShell } from '../../components/AuthShell';
import { Button, Card, Field, FormActions, Input, PageHeader, Textarea } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useConfig } from '../../lib/config';

function ContactForm({ authenticated }: { authenticated: boolean }) {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schema = z.object({
    nom: z.string().max(80).optional(),
    prenom: z.string().max(80).optional(),
    email: authenticated ? z.string().optional() : z.email(t('validation.email')),
    telephone: z.string().max(30).optional(),
    sujet: z.string().trim().min(1, t('validation.required')).max(160),
    message: z.string().trim().min(5, t('validation.messageMin')).max(4000),
    website: z.string().optional(), // champ piège anti-robots
  });
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ok/15 text-ok">
          <CheckCircle2 size={28} />
        </span>
        <p className="font-semibold">{t('contact.sent')}</p>
        <Button
          onClick={() => {
            reset();
            setSent(false);
          }}
        >
          {t('contact.another')}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={handleSubmit(async (v) => {
        setError(null);
        try {
          await api.post('/contact', v);
          setSent(true);
        } catch (e) {
          setError(e instanceof ApiError ? (e.code === 'RATE_LIMITED' ? t('auth.tooMany') : e.message) : t('common.error'));
        }
      })}
    >
      {error && (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      {!authenticated && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profile.firstName')}>
            <Input {...register('prenom')} autoComplete="given-name" />
          </Field>
          <Field label={t('profile.lastName')}>
            <Input {...register('nom')} autoComplete="family-name" />
          </Field>
          <Field label={t('auth.email')} error={formState.errors.email?.message} required>
            <Input type="email" {...register('email')} autoComplete="email" invalid={!!formState.errors.email} />
          </Field>
          <Field label={t('profile.phone')}>
            <Input type="tel" {...register('telephone')} autoComplete="tel" />
          </Field>
        </div>
      )}
      <Field label={t('contact.subject')} error={formState.errors.sujet?.message} required>
        <Input {...register('sujet')} invalid={!!formState.errors.sujet} />
      </Field>
      <Field label={t('contact.message')} error={formState.errors.message?.message} required>
        <Textarea {...register('message')} rows={6} invalid={!!formState.errors.message} />
      </Field>
      {/* Champ piège : masqué aux humains et aux lecteurs d'écran, rempli par les robots. */}
      <div aria-hidden className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website <input tabIndex={-1} autoComplete="off" {...register('website')} />
        </label>
      </div>
      <p className="text-xs text-subtle">{t('contact.gdpr')}</p>
      <FormActions>
        <Button type="submit" variant="primary" loading={formState.isSubmitting} icon={<Send size={16} />}>
          {t('contact.send')}
        </Button>
      </FormActions>
    </form>
  );
}

function CompanyInfo() {
  const { company } = useConfig();
  return (
    <ul className="space-y-3 text-sm">
      <li className="flex items-start gap-3">
        <Mail size={16} className="mt-0.5 text-accent" />{' '}
        <a className="hover:underline" href={`mailto:${company.supportEmail}`}>
          {company.supportEmail}
        </a>
      </li>
      <li className="flex items-start gap-3">
        <MapPin size={16} className="mt-0.5 text-accent" /> <span>{company.address}</span>
      </li>
    </ul>
  );
}

/** Version intégrée à l'application (utilisateur connecté, identité reprise du compte). */
export function ContactInternal() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('nav.contact')} subtitle={t('contact.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <ContactForm authenticated />
        </Card>
        <Card>
          <CompanyInfo />
        </Card>
      </div>
    </>
  );
}

/** Version publique (visiteur non connecté). */
export default function ContactPublic() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (user) return <Navigate to="/support" replace />;
  return (
    <AuthShell
      title={t('nav.contact')}
      subtitle={t('contact.subtitle')}
      footer={
        <Link to="/login" className="font-semibold text-accent hover:underline">
          {t('common.back')}
        </Link>
      }
    >
      <ContactForm authenticated={false} />
    </AuthShell>
  );
}
