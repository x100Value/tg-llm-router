import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';

export default function UserPanel({ t, userId }) {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { api.models(userId).then(m => { setModels(m); if (m.length && !model) setModel(m[0].id); }); }, [userId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setMsgs(p => [...p, { role: 'user', content: text }]);
    setLoading(true);
    // Add empty assistant message for streaming
    const assistantIdx = msgs.length + 1;
    setMsgs(p => [...p, { role: 'assistant', content: '', streaming: true }]);
    try {
      await api.chatStream(userId, model, text, (chunk) => {
        setMsgs(p => {
          const updated = [...p];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') last.content += chunk;
          return updated;
        });
      });
      setMsgs(p => {
        const updated = [...p];
        const last = updated[updated.length - 1];
        if (last) last.streaming = false;
        return updated;
      });
    } catch (err) {
      setMsgs(p => {
        const updated = [...p];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && !last.content) { last.content = `⚠️ ${err.message}`; last.error = true; }
        else updated.push({ role: 'assistant', content: `⚠️ ${err.message}`, error: true });
        return updated;
      });
    }
    setLoading(false);
  };

  const clear = async () => { await api.clearSession(userId); setMsgs([]); };
  const cur = models.find(m => m.id === model);

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <div className="px-3 py-2 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowModels(!showModels)} className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2 border border-white/5 hover:border-white/10 transition-all text-left">
            <div className="w-2 h-2 rounded-full bg-neon-green status-online flex-shrink-0" />
            <span className="text-[13px] text-white/70 truncate font-mono">{cur?.name || t.selectModel}</span>
            <svg className={`w-3.5 h-3.5 text-white/20 ml-auto transition-transform ${showModels ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <button onClick={clear} className="p-2 rounded-xl bg-surface-2 border border-white/5 text-white/25 hover:text-neon-red hover:border-red-500/20 transition-all" title={t.clearChat}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
        {showModels && (
          <div className="mt-2 rounded-xl bg-surface-3 border border-white/5 max-h-52 overflow-y-auto animate-slide-down">
            {models.map(m => (
              <button key={m.id} onClick={() => { setModel(m.id); setShowModels(false); }} className={`w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-white/5 transition-all ${m.id === model ? 'bg-accent-dim' : ''}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.status === 'available' ? 'bg-neon-green' : 'bg-neon-red'}`} />
                <span className={`text-xs font-mono truncate ${m.id === model ? 'text-accent' : 'text-white/50'}`}>{m.name}</span>
                <span className="ml-auto text-[9px] text-white/15">{m.provider}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2.5">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-16 h-16 rounded-2xl bg-surface-3 flex items-center justify-center"><span className="text-2xl opacity-60">💬</span></div>
            <p className="text-sm text-white/20">{t.noMessages}</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg-enter flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] px-3.5 py-2.5 text-[13px] leading-relaxed ${
              m.role === 'user' ? 'bg-accent text-white rounded-2xl rounded-br-md'
              : m.error ? 'bg-red-500/10 text-red-300 border border-red-500/15 rounded-2xl rounded-bl-md'
              : 'bg-surface-2 text-white/80 border border-white/5 rounded-2xl rounded-bl-md'
            }`}>
              <p className="whitespace-pre-wrap break-words">{m.content}{m.streaming ? '▍' : ''}</p>
              {m.fallback && <p className="text-[9px] text-neon-amber mt-1 opacity-70">⚡ {t.fallbackUsed}</p>}
            </div>
          </div>
        ))}
        {loading && msgs[msgs.length-1]?.content === '' && (
          <div className="flex justify-start msg-enter">
            <div className="bg-surface-2 border border-white/5 px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex gap-1.5"><span className="typing-dot w-1.5 h-1.5 bg-accent rounded-full" /><span className="typing-dot w-1.5 h-1.5 bg-accent rounded-full" /><span className="typing-dot w-1.5 h-1.5 bg-accent rounded-full" /></div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex-shrink-0 px-3 py-2.5 border-t border-white/5 glass">
        <div className="flex items-end gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={t.sendMessage} rows={1} className="flex-1 resize-none bg-surface-2 border border-white/5 rounded-xl px-3.5 py-2.5 text-[13px] text-white/85 placeholder-white/20 focus:outline-none focus:border-accent/40 focus:bg-surface-3 transition-all" style={{ maxHeight: '100px' }} />
          <button onClick={send} disabled={loading || !input.trim()} className="p-2.5 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-20 text-white transition-all flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
