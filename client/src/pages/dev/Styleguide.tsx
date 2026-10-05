import { useState, type ReactNode } from 'react';
import { Archive, Plus, Users } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog, RefuseDialog } from '../../components/DecisionDialog';
import { OtpInput, type OtpStatus } from '../../components/OtpInput';
import { StatusBadge } from '../../components/StatusBadge';
import { Button, Card, Empty, ErrorState, Field, Input, Select, Spinner, StatTile, Tabs, Textarea } from '../../components/ui';
import { ApiError } from '../../lib/api';

/**
 * Page de styles interne (route /styleguide, développement uniquement : absente du build de production, voir app/App.tsx).
 * Chaque composant y est montré dans ses états, côte à côte en thème clair et sombre : un défaut de contraste, un décalage ou une
 * couleur oubliée se voit d'un coup d'œil, sans naviguer dans l'application ni préparer de données.
 */

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h3 className="font-display mb-3 text-sm font-bold uppercase tracking-wide text-subtle">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs text-subtle">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function OtpDemo() {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<OtpStatus>('idle');
  const play = (next: 'success' | 'error') => {
    setValue('123456');
    setStatus('checking');
    setTimeout(() => setStatus(next), 600);
  };
  const reset = () => {
    setValue('');
    setStatus('idle');
  };
  return (
    <>
      <OtpInput label="Code de vérification" value={value} onChange={setValue} status={status} onSettle={reset} />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => play('success')}>
          Code bon
        </Button>
        <Button size="sm" onClick={() => play('error')}>
          Code faux
        </Button>
        <Button size="sm" onClick={reset}>
          Réinitialiser
        </Button>
      </div>
    </>
  );
}

function Panel({ theme }: { theme: 'light' | 'dark' }) {
  const [tab, setTab] = useState<'a' | 'b'>('a');
  const [select, setSelect] = useState('b');
  const [confirm, setConfirm] = useState<'normal' | 'danger' | null>(null);
  const [refuse, setRefuse] = useState(false);

  return (
    // data-theme limite le thème à ce panneau : les variables CSS (couleurs, verre, bordures) y suivent le thème demandé.
    <div data-theme={theme} className="rounded-3xl border border-white/10 p-5" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <p className="font-display mb-6 text-lg font-bold">{theme === 'dark' ? 'Thème sombre' : 'Thème clair'}</p>

      <Block title="Boutons">
        <Row label="Variantes">
          <Button>Par défaut</Button>
          <Button variant="primary" icon={<Plus size={16} />}>
            Principal
          </Button>
          <Button variant="danger" icon={<Archive size={16} />}>
            Danger
          </Button>
        </Row>
        <Row label="États">
          <Button variant="primary" loading>
            Chargement
          </Button>
          <Button disabled>Désactivé</Button>
          <Button size="sm">Petit</Button>
        </Row>
      </Block>

      <Block title="Champs">
        <Field label="Champ normal" hint="Texte d'aide sous le champ">
          <Input placeholder="Saisie…" />
        </Field>
        <Field label="Champ invalide" error="Ce champ est obligatoire">
          <Input invalid defaultValue="valeur" />
        </Field>
        <Field label="Champ désactivé">
          <Input disabled defaultValue="Non modifiable" />
        </Field>
        <Field label="Zone de texte">
          <Textarea rows={2} defaultValue="Plusieurs lignes de texte." />
        </Field>
      </Block>

      <Block title="Listes déroulantes">
        <Field label="Normale">
          <Select value={select} onChange={(e) => setSelect(e.target.value)}>
            <option value="a">Administrateur</option>
            <option value="b">Manager</option>
            <option value="c">Employé</option>
            <option value="d" disabled>
              Option indisponible
            </option>
          </Select>
        </Field>
        <Field label="Invalide">
          <Select invalid defaultValue="">
            <option value="">Choisir…</option>
            <option value="a">Option</option>
          </Select>
        </Field>
        <Field label="Désactivée">
          <Select disabled defaultValue="a">
            <option value="a">Verrouillée</option>
          </Select>
        </Field>
      </Block>

      <Block title="Dates">
        <Field label="Jour">
          <Input type="date" defaultValue="2026-10-05" />
        </Field>
        <Field label="Mois">
          <Input type="month" defaultValue="2026-10" />
        </Field>
        <Field label="Jour et heure">
          <Input type="datetime-local" defaultValue="2026-10-05T10:00" />
        </Field>
        <Field label="Invalide">
          <Input type="date" invalid />
        </Field>
      </Block>

      <Block title="Code 2FA (cases qui fusionnent)">
        <OtpDemo />
      </Block>

      <Block title="Confirmations">
        <Row label="Fenêtres">
          <Button onClick={() => setConfirm('normal')}>Confirmation</Button>
          <Button variant="danger" onClick={() => setConfirm('danger')}>
            Confirmation dangereuse
          </Button>
          <Button onClick={() => setRefuse(true)}>Motif de refus</Button>
        </Row>
        <ConfirmDialog
          open={confirm !== null}
          danger={confirm === 'danger'}
          title={confirm === 'danger' ? 'Archiver ce compte ?' : 'Affecter ce responsable ?'}
          message="Cette action sera enregistrée dans le journal d'audit."
          confirmLabel="Confirmer"
          onClose={() => setConfirm(null)}
          onConfirm={() => undefined}
        />
        <RefuseDialog open={refuse} onClose={() => setRefuse(false)} onConfirm={() => undefined} />
      </Block>

      <Block title="Badges et statuts">
        <Row label="Statuts de demande">
          <StatusBadge status="en attente" />
          <StatusBadge status="accepte" />
          <StatusBadge status="refuse" />
        </Row>
        <Row label="Étiquettes">
          <span className="badge badge-ok">Actif</span>
          <span className="badge badge-warn">Archivé</span>
          <span className="badge badge-bad">Administrateur</span>
          <span className="badge badge-info">Invité</span>
          <span className="badge badge-accent">Manager</span>
        </Row>
      </Block>

      <Block title="Cartes, onglets, avatars">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile label="Solde de congés" value="17" hint="jours restants" icon={<Users size={20} />} tone="ok" />
          <StatTile label="En attente" value="3" icon={<Users size={20} />} tone="warn" />
        </div>
        <Card>Carte simple : contenu, bordure et ombre du thème.</Card>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'a', label: 'En attente', count: 3 },
            { value: 'b', label: 'Traitées' },
          ]}
        />
        <Row label="Avatars (initiales)">
          <Avatar id="1" prenom="Sofia" nom="Lopez" size={36} />
          <Avatar id="2" prenom="Karim" nom="Bernard" size={36} />
          <Avatar id="3" prenom="Nadia" nom="Haddad" size={36} />
        </Row>
      </Block>

      <Block title="États vides, chargement, erreur">
        <Card className="max-h-44 overflow-hidden">
          <Spinner label="Chargement…" />
        </Card>
        <Card>
          <Empty icon={<Users size={22} />} title="Aucun résultat" hint="Modifiez les filtres pour élargir la recherche." />
        </Card>
        <ErrorState error={new ApiError(500, 'Erreur interne du serveur')} onRetry={() => undefined} />
      </Block>
    </div>
  );
}

export default function Styleguide() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold">Styleguide</h1>
      <p className="mb-8 mt-1 text-sm text-muted">Composants dans leurs états, en thème sombre et clair. Page de développement : absente de la production.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel theme="dark" />
        <Panel theme="light" />
      </div>
    </main>
  );
}
