import React, { useState, useEffect, useRef } from 'react';
import { fetchModels, sendChat, clearSession } from '../api';

export default function UserDashboard({ t, userId }) {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showModels, setShowModels] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetchModels(userId).then((m) => {
      setModels(m);
      if (m.length && !selectedModel) setSelectedModel(m[0].id);
    });
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setError('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const res = await sendChat(userId, selectedModel, msg);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.response,
          model: res.model,
          fallback: res.fallback,
        },
      ]);
    } catch (err) {
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ ${err.message}`, error: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    await clearSession(userId);
    setMessages([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentModel = models.find((m) => m.id === selectedModel);

  return (
    <div className="flex flex-col h-full">
      {/* Model selector bar */}
      <div className="px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModels(!showModels)}
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 transition-all text-left"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm text-white/80 truncate font-mono">
              {currentModel?.name || t.selectModel}
            </span>
            <svg className="w-4 h-4 text-white/30 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={handleClear}
            className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"
            title={t.clearChat}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {/* Model dropdown */}
        {showModels && (
          <div className="mt-2 rounded-lg bg-[#1a1a3e] border border-white/10 max-h-48 overflow-y-auto">
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => { setSelectedModel(m.id); setShowModels(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-all flex items-center gap-2 ${
                  m.id === selectedModel ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/60'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'available' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className="font-mono text-xs">{m.name}</span>
                <span className="ml-auto text-[10px] text-white/20">{m.provider}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                <span className="text-2xl">💬</span>
              </div>
              <p className="text-white/30 text-sm">{t.noMessages}</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`msg-enter flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-md'
                  : msg.error
                  ? 'bg-red-500/10 text-red-300 border border-red-500/20 rounded-bl-md'
                  : 'bg-white/5 text-white/85 rounded-bl-md'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.fallback && (
                <p className="text-[10px] text-amber-400/60 mt-1">⚡ {t.fallbackUsed}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start msg-enter">
            <div className="bg-white/5 px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="dot-pulse flex gap-1">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="sticky bottom-16 px-4 py-3 border-t border-white/5 bg-[#0f0f23]/95 backdrop-blur-xl">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.sendMessage}
            rows={1}
            className="flex-1 resize-none bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/90 placeholder-white/25 focus:outline-none focus:border-indigo-500/50 focus:bg-white/8 transition-all"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
