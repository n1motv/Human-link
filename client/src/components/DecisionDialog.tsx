import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Textarea } from './ui';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Reçoit le motif saisi. */
  onConfirm: (reason: string) => Promise<unknown> | void;
}

/** Saisie du motif de refus (obligatoire côté serveur aussi). */
export function RefuseDialog({ open, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('decision.refuseTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={submit}>
            {t('decision.refuse')}
          </Button>
        </>
      }
    >
      <Field label={t('decision.reason')} required>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder={t('decision.reasonPlaceholder')} />
      </Field>
    </Modal>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<unknown> | void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onClose, onConfirm }: ConfirmProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={run}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">{message}</p>
    </Modal>
  );
}
