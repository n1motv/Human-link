import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, Link2, Link2Off, Network, Trash2, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/DecisionDialog';
import { Button, Card, ErrorState, Field, FormActions, PageHeader, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';
import type { Brief, User } from '../../lib/types';

interface Assignments {
  assignments: { manager: Brief & { id: string }; supervise: Brief & { id: string } }[];
  director: (Brief & { id: string }) | null;
}
interface TreeNode {
  id: string;
  name: string;
  poste?: string;
  role: string;
  children: TreeNode[];
}
interface Tree {
  tree: TreeNode | null;
  unassigned: { id: string; name: string; poste?: string }[];
  otherRoots: TreeNode[];
}

function Node({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  return (
    <li>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-glass px-3 py-2">
        <Avatar prenom={node.name.split(' ')[0]} nom={node.name.split(' ')[1]} size={30} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{node.name}</p>
          {node.poste && <p className="truncate text-xs text-muted">{node.poste}</p>}
        </div>
        {depth === 0 && <Crown size={15} className="ms-auto text-warn" />}
      </div>
      {node.children.length > 0 && (
        <ul className="ms-5 mt-2 space-y-2 border-s border-line ps-4">
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Org() {
  const { t } = useTranslation();
  const people = useQuery({ queryKey: ['users', 'active'], queryFn: () => api.get<{ items: User[] }>('/users?status=active&limit=200') });
  const sup = useQuery({ queryKey: ['org', 'supervisions'], queryFn: () => api.get<Assignments>('/org/supervisions') });
  const tree = useQuery({ queryKey: ['org', 'tree'], queryFn: () => api.get<Tree>('/org/tree') });
  const [managerId, setManagerId] = useState('');
  const [superviseId, setSuperviseId] = useState('');
  const [directorId, setDirectorId] = useState('');
  const [ask, setAsk] = useState<{ kind: 'assign' | 'unassign' | 'director'; a?: string; b?: string } | null>(null);
  const refresh = [['org']] as const;

  const assign = useAction(() => api.post('/org/supervisions', { managerId, superviseId }), {
    success: t('org.assigned'),
    invalidate: [...refresh],
    onSuccess: () => setSuperviseId(''),
  });
  const unassign = useAction((a: { m: string; s: string }) => api.delete(`/org/supervisions/${a.m}/${a.s}`), { success: t('org.unassigned'), invalidate: [...refresh] });
  const setDirector = useAction(() => api.put('/org/director', { managerId: directorId }), { success: t('org.directorSet'), invalidate: [...refresh] });

  if (people.isLoading || sup.isLoading || tree.isLoading) return <Spinner />;
  if (people.isError || sup.isError || tree.isError) return <ErrorState error={people.error ?? sup.error ?? tree.error} />;

  const nameOf = (id?: string) => {
    const u = people.data!.items.find((p) => p.id === id);
    return u ? `${u.prenom} ${u.nom}` : '';
  };
  const askName = (id?: string) => nameOf(id) || sup.data!.assignments.flatMap((x) => [x.manager, x.supervise]).map((u) => ({ id: u.id, n: `${u.prenom} ${u.nom}` })).find((u) => u.id === id)?.n || '';

  const all = people.data!.items.filter((p) => p.role !== 'admin');
  const managers = all.filter((p) => p.role === 'manager');
  const assigned = new Set(sup.data!.assignments.map((a) => a.supervise.id));
  const free = all.filter((p) => !assigned.has(p.id) && p.id !== managerId);

  return (
    <>
      <PageHeader title={t('nav.org')} subtitle={t('org.subtitle')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Link2 size={18} className="text-accent" /> {t('org.assign')}
            </h2>
            <div className="space-y-4">
              <Field label={t('common.manager')}>
                <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                  <option value="">—</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.prenom} {m.nom}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('org.supervised')} hint={t('org.oneManager')}>
                <Select value={superviseId} onChange={(e) => setSuperviseId(e.target.value)}>
                  <option value="">—</option>
                  {free.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.prenom} {m.nom} ({t(`role.${m.role}`)})
                    </option>
                  ))}
                </Select>
              </Field>
              <FormActions>
                <Button variant="primary" disabled={!managerId || !superviseId} loading={assign.isPending} onClick={() => setAsk({ kind: 'assign' })}>
                  {t('org.assignBtn')}
                </Button>
              </FormActions>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Crown size={18} className="text-warn" /> {t('org.director')}
            </h2>
            <p className="mb-3 text-sm text-muted">
              {sup.data!.director ? t('org.currentDirector', { name: `${sup.data!.director.prenom} ${sup.data!.director.nom}` }) : t('org.noDirector')}
            </p>
            <div className="flex gap-2">
              <Select aria-label={t('org.director')} value={directorId} onChange={(e) => setDirectorId(e.target.value)}>
                <option value="">—</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.prenom} {m.nom}
                  </option>
                ))}
              </Select>
              <Button disabled={!directorId} loading={setDirector.isPending} onClick={() => setAsk({ kind: 'director' })}>
                {t('org.designate')}
              </Button>
            </div>
            <p className="mt-3 text-xs text-subtle">{t('org.directorHint')}</p>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-bold">{t('org.assignments')}</h2>
            {sup.data!.assignments.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">{t('org.none')}</p>
            ) : (
              <ul className="space-y-2">
                {sup.data!.assignments.map((a) => (
                  <li key={`${a.manager.id}-${a.supervise.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-glass px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <strong>{a.manager.prenom} {a.manager.nom}</strong> <span className="text-subtle">→</span> {a.supervise.prenom} {a.supervise.nom}
                    </span>
                    <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-bad" aria-label={t('common.delete')} onClick={() => setAsk({ kind: 'unassign', a: a.manager.id, b: a.supervise.id })}>
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Network size={18} className="text-accent" /> {t('org.chart')}
          </h2>
          {tree.data!.tree ? (
            <ul>
              <Node node={tree.data!.tree} />
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted">{t('org.noDirector')}</p>
          )}
          {tree.data!.otherRoots.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-line pt-4">
              {tree.data!.otherRoots.map((r) => (
                <Node key={r.id} node={r} />
              ))}
            </ul>
          )}
          {tree.data!.unassigned.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-warn">
                <UserX size={15} /> {t('org.unassigned')}
              </h3>
              <ul className="flex flex-wrap gap-2">
                {tree.data!.unassigned.map((u) => (
                  <li key={u.id} className="badge badge-warn">
                    {u.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={!!ask}
        danger={ask?.kind === 'unassign'}
        icon={ask?.kind === 'assign' ? <Link2 size={22} /> : ask?.kind === 'director' ? <Crown size={22} /> : <Link2Off size={22} />}
        title={t(`confirm.${ask?.kind ?? 'assign'}Title`)}
        message={
          ask?.kind === 'assign'
            ? t('confirm.assignMsg', { manager: nameOf(managerId), person: nameOf(superviseId) })
            : ask?.kind === 'director'
              ? t('confirm.directorMsg', { name: nameOf(directorId) })
              : t('confirm.unassignMsg', { manager: askName(ask?.a), person: askName(ask?.b) })
        }
        confirmLabel={ask?.kind === 'assign' ? t('org.assignBtn') : ask?.kind === 'director' ? t('org.designate') : t('confirm.unassignBtn')}
        onClose={() => setAsk(null)}
        onConfirm={() => (ask!.kind === 'assign' ? assign.mutateAsync() : ask!.kind === 'director' ? setDirector.mutateAsync() : unassign.mutateAsync({ m: ask!.a!, s: ask!.b! }))}
      />
    </>
  );
}
