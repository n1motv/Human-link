import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileArchive, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PersonPicker, type Person } from '../../components/PersonPicker';
import { Button, Card, ErrorState, PageHeader, Spinner, StatTile } from '../../components/ui';
import { api, downloadFile } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import { schemas } from '../../lib/schemas';
import type { z } from 'zod';

type Register = z.infer<typeof schemas.complianceRegister>;

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** Registre au format CSV (s'ouvre dans Excel) : une ligne par traitement, prêt à remettre à l'autorité de contrôle. */
function registerToCsv(r: Register, heads: string[]) {
  const rows = r.treatments.map((x) => [
    x.name,
    x.purpose,
    x.legalBasis,
    x.dataCategories.join(' ; '),
    x.sensitive ? 'oui' : 'non',
    x.recipients.join(' ; '),
    x.retention,
    x.security.join(' ; '),
  ]);
  return '﻿' + [heads, ...rows].map((line) => line.map(csvCell).join(';')).join('\r\n');
}

/**
 * Conformité (RGPD) : le registre des traitements avec les durées de conservation réellement appliquées, et l'export d'un dossier complet
 * pour une demande d'accès reçue par courrier.
 */
export default function Compliance() {
  const { t, i18n } = useTranslation();
  const [person, setPerson] = useState<Person | null>(null);
  const q = useQuery({ queryKey: ['compliance', 'register'], queryFn: () => api.get<Register>('/rgpd/register'), staleTime: 10 * 60_000 });
  const exportDossier = useAction((p: Person) => downloadFile(`/rgpd/dossier/${p.id}`, `dossier-${p.nom}-${p.matricule ?? p.id}.zip`), {
    success: t('compliance.exportDone'),
    invalidate: [['audit']],
  });

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data!;

  const download = () => {
    const heads = ['name', 'purpose', 'legalBasis', 'data', 'sensitive', 'recipients', 'retention', 'security'].map((k) => t(`compliance.col.${k}`));
    const url = URL.createObjectURL(new Blob([registerToCsv(r, heads)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `registre-des-traitements-${r.generatedAt.slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <>
      <PageHeader
        title={t('nav.compliance')}
        subtitle={t('compliance.subtitle')}
        actions={
          <Button icon={<Download size={16} />} onClick={download}>
            {t('compliance.downloadRegister')}
          </Button>
        }
      />

      <Card className="mb-6">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
          <FileArchive size={18} className="text-accent" /> {t('compliance.exportTitle')}
        </h2>
        <p className="mb-4 text-sm text-muted">{t('compliance.exportHint')}</p>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-[16rem] flex-1">
            <PersonPicker aria-label={t('compliance.chooseEmployee')} placeholder={t('compliance.chooseEmployee')} value={person} onChange={setPerson} filter="page=1" />
          </div>
          <Button variant="primary" icon={<FileArchive size={16} />} disabled={!person} loading={exportDossier.isPending} onClick={() => exportDossier.mutate(person!)}>
            {t('compliance.exportBtn')}
          </Button>
        </div>
      </Card>

      <h2 className="mb-3 text-lg font-bold">{t('compliance.retentionTitle')}</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label={t('compliance.ret.departed')} value={t('compliance.years', { count: r.retention.departedEmployeeYears })} tone="accent" />
        <StatTile label={t('compliance.ret.audit')} value={t('compliance.days', { count: r.retention.auditLogDays })} tone="info" />
        <StatTile label={t('compliance.ret.notifications')} value={t('compliance.days', { count: r.retention.notificationDays })} tone="ok" />
        <StatTile label={t('compliance.ret.contacts')} value={t('compliance.days', { count: r.retention.contactRequestDays })} tone="warn" />
        <StatTile label={t('compliance.ret.feedback')} value={t('compliance.months', { count: r.retention.feedbackMonths })} tone="accent" />
      </div>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{t('compliance.registerTitle')}</h2>
        <p className="text-xs text-muted">{t('compliance.generatedAt', { date: fmtDateTime(r.generatedAt, i18n.language) })}</p>
      </div>
      <Card className="mb-4 text-sm">
        <p>
          <strong>{t('compliance.controller')} :</strong> {r.controller.name} — {r.controller.address}
        </p>
        <p className="text-muted">
          {t('compliance.dpo')} :{' '}
          <a className="text-accent hover:underline" href={`mailto:${r.controller.dpoEmail}`}>
            {r.controller.dpoEmail}
          </a>
        </p>
      </Card>

      <div className="space-y-4">
        {r.treatments.map((x) => (
          <Card key={x.id}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold">{x.name}</h3>
              {x.sensitive && (
                <span className="badge badge-bad inline-flex items-center gap-1">
                  <ShieldCheck size={12} aria-hidden /> {t('compliance.sensitive')}
                </span>
              )}
            </div>
            <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
              <Field label={t('compliance.col.purpose')}>{x.purpose}</Field>
              <Field label={t('compliance.col.legalBasis')}>{x.legalBasis}</Field>
              <Field label={t('compliance.col.data')}>
                <List items={x.dataCategories} />
              </Field>
              <Field label={t('compliance.col.recipients')}>
                <List items={x.recipients} />
              </Field>
              <Field label={t('compliance.col.retention')}>
                <span className="font-semibold text-fg">{x.retention}</span>
              </Field>
              <Field label={t('compliance.col.security')}>
                <List items={x.security} />
              </Field>
            </dl>
          </Card>
        ))}
      </div>

      <Card className="mt-6 space-y-3 text-sm">
        <h3 className="text-base font-bold">{t('compliance.processors')}</h3>
        <ul className="space-y-1 text-muted">
          {r.processors.map((p) => (
            <li key={p.name}>
              <strong className="text-fg">{p.name}</strong> — {p.role}
            </li>
          ))}
        </ul>
        <h3 className="pt-2 text-base font-bold">{t('compliance.transfers')}</h3>
        <p className="text-muted">{r.transfers}</p>
        <h3 className="pt-2 text-base font-bold">{t('compliance.rights')}</h3>
        <p className="text-muted">{r.rights}</p>
      </Card>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-subtle">{label}</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 ps-4">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}
