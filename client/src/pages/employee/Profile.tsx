import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/Avatar';
import { Button, Card, ErrorState, Field, Input, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDate, fmtMoney } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import type { User } from '../../lib/types';

type Form = Pick<User, 'nom' | 'prenom' | 'dateNaissance' | 'adresse' | 'ville' | 'codePostal' | 'pays' | 'nationalite' | 'telephone'> & { email: string; currentPassword?: string };

export default function Profile() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const { setSession, pending2fa } = useAuth();
  const q = useQuery({ queryKey: ['profile'], queryFn: () => api.get<{ user: User }>('/users/me/profile') });
  const { register, handleSubmit, reset, watch } = useForm<Form>();
  const file = useRef<HTMLInputElement>(null);
  const [photoKey, setPhotoKey] = useState(0);

  useEffect(() => {
    if (q.data) reset({ ...q.data.user, currentPassword: '' });
  }, [q.data, reset]);

  const save = useAction(
    (v: Form) => {
      const body: Record<string, unknown> = { ...v };
      // Les champs vides sont envoyés vides (effacement) ; l'e-mail n'est envoyé que s'il change.
      if (v.email === q.data?.user.email) delete body.email;
      if (!v.currentPassword) delete body.currentPassword;
      return api.patch<{ user: User }>('/users/me/profile', body);
    },
    {
      success: t('profile.saved'),
      onSuccess: (r) => {
        setSession(r.user, pending2fa);
        void qc.invalidateQueries({ queryKey: ['profile'] });
      },
    },
  );
  const photo = useAction(
    (f: File) => {
      const fd = new FormData();
      fd.append('photo', f);
      return api.post<{ user: User }>('/users/me/photo', fd);
    },
    {
      success: t('profile.photoSaved'),
      onSuccess: (r) => {
        setSession(r.user, pending2fa);
        setPhotoKey((k) => k + 1);
        void qc.invalidateQueries({ queryKey: ['profile'] });
      },
    },
  );

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const u = q.data!.user;
  const emailChanged = watch('email') && watch('email') !== u.email;

  return (
    <>
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card className="flex flex-col items-center gap-3 text-center">
            <div className="relative" key={photoKey}>
              <Avatar id={u.id} prenom={u.prenom} nom={u.nom} hasPhoto={!!u.photoFileId} size={96} />
              <button className="btn btn-icon btn-sm absolute -bottom-1 -end-1 !h-9 !w-9" aria-label={t('profile.changePhoto')} onClick={() => file.current?.click()}>
                <Camera size={16} />
              </button>
              <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && photo.mutate(e.target.files[0])} />
            </div>
            <div>
              <p className="text-lg font-bold">
                {u.prenom} {u.nom}
              </p>
              <p className="text-sm text-muted">{u.poste ?? '—'}</p>
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-subtle">{t('profile.employment')}</h2>
            <dl className="space-y-2.5 text-sm">
              {[
                [t('profile.matricule'), u.matricule],
                [t('profile.department'), u.departement ?? '—'],
                [t('profile.contract'), u.typeContrat ?? '—'],
                [t('profile.hired'), fmtDate(u.dateEmbauche, lang)],
                [t('profile.salary'), fmtMoney(u.salaire, lang)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-end font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-subtle">{t('profile.readOnly')}</p>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <form className="space-y-4" onSubmit={handleSubmit((v) => save.mutate(v))}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('profile.firstName')} required>
                <Input {...register('prenom', { required: true })} autoComplete="given-name" />
              </Field>
              <Field label={t('profile.lastName')} required>
                <Input {...register('nom', { required: true })} autoComplete="family-name" />
              </Field>
              <Field label={t('profile.birthDate')}>
                <Input type="date" {...register('dateNaissance')} autoComplete="bday" />
              </Field>
              <Field label={t('profile.phone')}>
                <Input type="tel" {...register('telephone')} autoComplete="tel" />
              </Field>
              <Field label={t('profile.address')} className="sm:col-span-2">
                <Input {...register('adresse')} autoComplete="street-address" />
              </Field>
              <Field label={t('profile.city')}>
                <Input {...register('ville')} autoComplete="address-level2" />
              </Field>
              <Field label={t('profile.postalCode')}>
                <Input {...register('codePostal')} autoComplete="postal-code" />
              </Field>
              <Field label={t('profile.country')}>
                <Input {...register('pays')} autoComplete="country-name" />
              </Field>
              <Field label={t('profile.nationality')}>
                <Input {...register('nationalite')} />
              </Field>
              <Field label={t('auth.email')} className="sm:col-span-2" hint={t('profile.emailHint')}>
                <Input type="email" {...register('email')} autoComplete="email" />
              </Field>
              {emailChanged && (
                <Field label={t('security.currentPassword')} className="sm:col-span-2" required>
                  <Input type="password" {...register('currentPassword')} autoComplete="current-password" />
                </Field>
              )}
            </div>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
