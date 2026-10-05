import { Link } from 'react-router-dom';
import { ArrowLeft, Database, Eye, Lock, Scale, Timer, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../../lib/config';
import { ThemeToggle } from '../../app/Layout';

/** Notice d'information RGPD (art. 13) générée depuis la configuration du client : un seul endroit à maintenir. */
export default function Privacy() {
  const { t } = useTranslation();
  const { company, gdpr } = useConfig();

  const sections = [
    { icon: Scale, key: 'controller', params: { company: company.legalName, address: company.address } },
    { icon: Database, key: 'data', params: {} },
    { icon: Eye, key: 'purposes', params: {} },
    {
      icon: Timer,
      key: 'retention',
      params: {
        audit: gdpr.auditLogRetentionDays,
        notif: gdpr.notificationRetentionDays,
        contact: gdpr.contactRequestRetentionDays,
        feedback: gdpr.feedbackRetentionMonths,
        years: gdpr.departedEmployeeRetentionYears,
      },
    },
    { icon: Lock, key: 'security', params: {} },
    { icon: UserCheck, key: 'rights', params: { dpo: company.dpoEmail } },
  ] as const;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/" className="btn btn-sm">
          <ArrowLeft size={14} className="rtl:rotate-180" /> {t('common.back')}
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="text-3xl font-bold tracking-tight">{t('privacy.title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('privacy.intro', { company: company.name })}</p>

      <div className="mt-8 space-y-4">
        {sections.map((s) => (
          <section key={s.key} className="glass p-5 sm:p-6">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
              <s.icon size={18} className="text-accent" /> {t(`privacy.${s.key}.title`)}
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{t(`privacy.${s.key}.body`, s.params)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
