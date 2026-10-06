import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';

interface Msg {
  from: 'me' | 'bot';
  text: string;
}

const SUGGESTIONS = ['chat.s1', 'chat.s2', 'chat.s3', 'chat.s4'];

export function ChatWidget() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' }); // pas de `return` : certains navigateurs renvoient une Promise
  }, [msgs, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { from: 'me', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const lang = ['fr', 'en', 'es', 'it', 'ar'].includes(i18n.language) ? i18n.language : 'fr';
      const r = await api.post<{ answer: string }>('/chatbot', { question: q, lang });
      setMsgs((m) => [...m, { from: 'bot', text: r.answer }]);
    } catch (e) {
      setMsgs((m) => [...m, { from: 'bot', text: e instanceof ApiError ? e.message : t('common.error') }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('chat.title')}
        aria-expanded={open}
        className="btn-primary fixed bottom-24 end-4 z-40 md:bottom-5 md:end-5 grid h-14 w-14 place-items-center rounded-full transition hover:scale-105"
      >
        {open ? <X size={22} /> : <Bot size={24} />}
      </button>

      {open && (
        <section
          aria-label={t('chat.title')}
          className="glass-strong rise fixed bottom-40 end-3 z-40 md:bottom-24 flex h-[min(34rem,calc(100vh-8rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col sm:end-5"
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent2 text-on-accent">
              <Sparkles size={18} />
            </span>
            <div>
              <p className="text-sm font-bold">{t('chat.title')}</p>
              <p className="text-xs text-muted">{t('chat.subtitle')}</p>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted">{t('chat.hello')}</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((k) => (
                    <button key={k} className="btn btn-sm" onClick={() => void send(t(k))}>
                      {t(k)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                <p
                  className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm ${
                    m.from === 'me' ? 'bg-gradient-to-br from-accent to-accent2 text-on-accent' : 'border border-line bg-glass'
                  }`}
                >
                  {m.text}
                </p>
              </div>
            ))}
            {busy && <div className="skeleton h-8 w-24" />}
            <div ref={end} />
          </div>

          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              className="field !min-h-10 flex-1 !rounded-full"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('chat.placeholder')}
              maxLength={500}
              aria-label={t('chat.placeholder')}
            />
            <button className="btn btn-primary btn-icon !h-10 !w-10" disabled={busy || !input.trim()} aria-label={t('chat.send')}>
              <Send size={16} className="rtl:-scale-x-100" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
