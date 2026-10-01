import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Archive, Eraser, KeyRound, MailPlus, Pencil, Plus, RotateCcw, Search, ShieldCheck, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/DecisionDialog';
import { Modal } from '../../components/Modal';
import { Button, Card, Empty, ErrorState, Field, Input, PageHeader, Select, Spinner, TableWrap } from '../../components/ui';
import { api } from '../../lib/api';
import { useConfig } from '../../lib/config';
import { fmtDate } from '../../lib/format';
import { useAction, useErrorText } from '../../lib/hooks';
import type { Role, User } from '../../lib/types';

type Row = Pick<User, 'id' | 'matricule' | 'nom' | 'prenom' | 'email' | 'role' | 'poste' | 'departement' | 'status' | 'isDirector' | 'dateEmbauche' | 'photoFileId' | 'twoFactor'>;

interface FormValues {
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  poste: string;
  departement: string;
  sexe: string;
  dateNaissance: string;
  telephone: string;
  adresse: string;
  ville: string;
  codePostal: string;
  pays: string;
  nationalite: string;
  numeroSecu: string;
  dateEmbauche: string;
  typeContrat: string;
  salaire: string;
  soldeConge: string;
  teleworkMax: string;
}

const blank: FormValues = {
  nom: '', prenom: '', email: '', role: 'employe', poste: '', departement: '', sexe: '', dateNaissance: '', telephone: '', adresse: '', ville: '', codePostal: '',
  pays: '', nationalite: '', numeroSecu: '', dateEmbauche: '', typeContrat: '', salaire: '', soldeConge: '', teleworkMax: '',
};

const toForm = (u: User): FormValues =>
  Object.fromEntries(Object.keys(blank).map((k) => [k, (u as unknown as Record<string, unknown>)[k] === undefined ? '' : String((u as unknown as Record<string, unknown>)[k])])) as unknown as FormValues;

const NUMERIC = ['salaire', 'soldeConge', 'teleworkMax'];

function EmployeeForm({ editId, onClose }: { editId: string | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { hr } = useConfig();
  const errText = useErrorText();
  const [error, setError] = useState<string | null>(null);
  const isNew = editId === 'new';
  const { register, handleSubmit, reset } = useForm<FormValues>({ defaultValues: blank });

  useQuery({
    queryKey: ['user', editId],
    enabled: !!editId && !isNew,
    queryFn: async () => {
      const r = await api.get<{ user: User }>(`/users/${editId}`);
      reset(toForm(r.user));
      return r.user;
    },
  });

  const save = useAction(
    (v: FormValues) => {
      const body: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        if (NUMERIC.includes(k)) {
          if (val !== '') body[k] = Number(val);
        } else body[k] = val;
      }
      return isNew ? api.post('/users', body) : api.patch(`/users/${editId}`, body);
    },
    {
      success: isNew ? t('employees.created') : t('employees.updated'),
      invalidate: [['users']],
      onSuccess: () => {
        reset(blank);
        setError(null);
        onClose();
      },
    },
  );

  return (
    <Modal
      open={!!editId}
      onClose={onClose}
      wide
      title={isNew ? t('employees.add') : t('employees.edit')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={save.isPending} onClick={handleSubmit((v) => save.mutate(v, { onError: (e) => setError(errText(e)) }))}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        {error && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        {isNew && <p className="rounded-xl border border-line bg-glass px-3 py-2 text-sm text-muted">{t('employees.inviteHint')}</p>}

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">{t('employees.identity')}</legend>
          <Field label={t('profile.firstName')} required>
            <Input {...register('prenom', { required: true })} />
          </Field>
          <Field label={t('profile.lastName')} required>
            <Input {...register('nom', { required: true })} />
          </Field>
          <Field label={t('auth.email')} required>
            <Input type="email" {...register('email', { required: true })} />
          </Field>
          <Field label={t('employees.role')} required>
            <Select {...register('role')}>
              <option value="employe">{t('role.employe')}</option>
              <option value="manager">{t('role.manager')}</option>
              <option value="admin">{t('role.admin')}</option>
            </Select>
          </Field>
          <Field label={t('profile.birthDate')} hint={t('employees.minAge', { n: hr.minimumAge })}>
            <Input type="date" {...register('dateNaissance')} />
          </Field>
          <Field label={t('employees.gender')}>
            <Select {...register('sexe')}>
              <option value="">—</option>
              <option value="Homme">{t('employees.male')}</option>
              <option value="Femme">{t('employees.female')}</option>
            </Select>
          </Field>
          <Field label={t('profile.phone')}>
            <Input type="tel" {...register('telephone')} />
          </Field>
          <Field label={t('profile.nationality')}>
            <Input {...register('nationalite')} />
          </Field>
          <Field label={t('profile.address')} className="sm:col-span-2">
            <Input {...register('adresse')} />
          </Field>
          <Field label={t('profile.city')}>
            <Input {...register('ville')} />
          </Field>
          <Field label={t('profile.postalCode')}>
            <Input {...register('codePostal')} />
          </Field>
          <Field label={t('profile.country')}>
            <Input {...register('pays')} />
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">{t('profile.employment')}</legend>
          <Field label={t('employees.job')}>
            <Input {...register('poste')} />
          </Field>
          <Field label={t('profile.department')}>
            <Input {...register('departement')} />
          </Field>
          <Field label={t('profile.contract')}>
            <Select {...register('typeContrat')}>
              <option value="">—</option>
              {['CDI', 'CDD', 'Alternance', 'Stage', 'Freelance'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('profile.hired')}>
            <Input type="date" {...register('dateEmbauche')} />
          </Field>
          <Field label={t('profile.salary')} hint={t('employees.encrypted')}>
            <Input type="number" min="0" step="0.01" inputMode="decimal" {...register('salaire')} />
          </Field>
          <Field label={t('employees.ssn')} hint={t('employees.encrypted')}>
            <Input {...register('numeroSecu')} autoComplete="off" />
          </Field>
          <Field label={t('employees.balance')}>
            <Input type="number" min="0" step="0.5" inputMode="decimal" {...register('soldeConge')} />
          </Field>
          <Field label={t('team.teleworkQuota')}>
            <Input type="number" min="0" max="5" {...register('teleworkMax')} />
          </Field>
        </fieldset>
      </form>
    </Modal>
  );
}

type Action = { kind: 'archive' | 'anonymize' | 'reset2fa'; user: Row } | null;

export default function Employees() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState<string | 'new' | null>(null);
  const [action, setAction] = useState<Action>(null);

  const q = useQuery({
    queryKey: ['users', search, status],
    queryFn: () => api.get<{ items: Row[]; total: number }>(`/users?limit=200${search ? `&q=${encodeURIComponent(search)}` : ''}${status ? `&status=${status}` : ''}`),
  });
  const archive = useAction((id: string) => api.delete(`/users/${id}`), { success: t('employees.archived'), invalidate: [['users']] });
  const anonymize = useAction((id: string) => api.post(`/users/${id}/anonymize`), { success: t('employees.anonymized'), invalidate: [['users']] });
  const restore = useAction((id: string) => api.post(`/users/${id}/restore`), { success: t('employees.restored'), invalidate: [['users']] });
  const reset2fa = useAction((id: string) => api.post(`/users/${id}/reset-2fa`), { success: t('employees.reset2faDone'), invalidate: [['users']] });
  const invite = useAction((id: string) => api.post(`/users/${id}/resend-invite`), { success: t('employees.inviteSent') });

  const badge = (s: Row['status']) => (s === 'active' ? 'badge-ok' : s === 'invited' ? 'badge-info' : 'badge-warn');

  return (
    <>
      <PageHeader
        title={t('nav.employees')}
        subtitle={t('employees.subtitle', { count: q.data?.total ?? 0 })}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit('new')}>
            {t('employees.add')}
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <Input className="!ps-10" placeholder={t('common.search')} aria-label={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select aria-label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto">
          <option value="">{t('common.all')}</option>
          <option value="active">{t('employees.st.active')}</option>
          <option value="invited">{t('employees.st.invited')}</option>
          <option value="archived">{t('employees.st.archived')}</option>
        </Select>
      </div>

      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Card>
          <Empty icon={<Users size={22} />} title={t('employees.empty')} />
        </Card>
      ) : (
        <TableWrap>
          <table className="table-glass">
            <thead>
              <tr>
                <th>{t('common.employee')}</th>
                <th>{t('profile.matricule')}</th>
                <th>{t('profile.department')}</th>
                <th>{t('employees.role')}</th>
                <th>{t('profile.hired')}</th>
                <th>{t('common.status')}</th>
                <th aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar id={u.id} prenom={u.prenom} nom={u.nom} hasPhoto={!!u.photoFileId} size={36} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {u.prenom} {u.nom}
                          {u.isDirector && <ShieldCheck size={14} className="ms-1.5 inline text-accent" aria-label={t('org.director')} />}
                        </p>
                        <p className="truncate text-xs text-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-xs">{u.matricule}</td>
                  <td>
                    {u.departement ?? '—'}
                    <p className="text-xs text-muted">{u.poste}</p>
                  </td>
                  <td>
                    <span className={`badge ${u.role === 'admin' ? 'badge-bad' : u.role === 'manager' ? 'badge-accent' : ''}`}>{t(`role.${u.role}`)}</span>
                  </td>
                  <td className="whitespace-nowrap text-muted">{fmtDate(u.dateEmbauche, i18n.language)}</td>
                  <td>
                    <span className={`badge ${badge(u.status)}`}>{t(`employees.st.${u.status}`)}</span>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      {u.status !== 'archived' && (
                        <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg" aria-label={t('common.edit')} onClick={() => setEdit(u.id)}>
                          <Pencil size={16} />
                        </button>
                      )}
                      {u.status === 'active' && u.twoFactor?.enabled && (
                        <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg" aria-label={t('employees.reset2fa')} title={t('employees.reset2fa')} onClick={() => setAction({ kind: 'reset2fa', user: u })}>
                          <KeyRound size={16} />
                        </button>
                      )}
                      {u.status === 'invited' && (
                        <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg" aria-label={t('employees.resend')} title={t('employees.resend')} onClick={() => invite.mutate(u.id)}>
                          <MailPlus size={16} />
                        </button>
                      )}
                      {u.status === 'archived' ? (
                        <>
                          <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg" aria-label={t('employees.restore')} title={t('employees.restore')} onClick={() => restore.mutate(u.id)}>
                            <RotateCcw size={16} />
                          </button>
                          <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-bad" aria-label={t('employees.anonymize')} title={t('employees.anonymize')} onClick={() => setAction({ kind: 'anonymize', user: u })}>
                            <Eraser size={16} />
                          </button>
                        </>
                      ) : (
                        <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-bad" aria-label={t('employees.archive')} title={t('employees.archive')} onClick={() => setAction({ kind: 'archive', user: u })}>
                          <Archive size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {edit && <EmployeeForm key={edit} editId={edit} onClose={() => setEdit(null)} />}
      <ConfirmDialog
        open={!!action}
        danger
        title={t(`employees.${action?.kind ?? 'archive'}`)}
        message={action ? t(`employees.${action.kind}Confirm`, { name: `${action.user.prenom} ${action.user.nom}` }) : ''}
        confirmLabel={t(`employees.${action?.kind ?? 'archive'}`)}
        onClose={() => setAction(null)}
        onConfirm={() => {
          const id = action!.user.id;
          return action!.kind === 'anonymize' ? anonymize.mutateAsync(id) : action!.kind === 'reset2fa' ? reset2fa.mutateAsync(id) : archive.mutateAsync(id);
        }}
      />
    </>
  );
}
