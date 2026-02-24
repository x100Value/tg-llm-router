import React, { useState, useEffect } from 'react';
import { fetchModels, sendChat } from '../api';

export default function AIDashboard({ t, userId }) {
  const [models, setModels] = useState([]);
  const [testModel, setTestModel] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchModels(userId).then((m) => {
      setModels(m);
      if (m.length) setTestModel(m[0].id);
    });
  }, [userId]);

  const runTest = async () => {
    if (!testModel) return;
    setTesting(true);
    setTestResult(null);
    const start = Date.now();
    try {
      const res = await sendChat(userId, testModel, 'Say hello in one sentence.');
      setTestResult({
        success: true,
        response: res.response,
        model: res.model,
        provider: res.provider,
        fallback: res.fallback,
        latency: Date.now() - start,
      });
    } catch (err) {
      setTestResult({ success: false, error: err.message, latency: Date.now() - start });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-white/90">{t.aiPanel}</h2>
        <p className="text-sm text-white/40 mt-1">{t.models}: {models.length}</p>
      </div>

      {/* Models list */}
      <div className="space-y-2">
        {models.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all"
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.status === 'available' ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 font-mono truncate">{m.name}</p>
              <p className="text-[10px] text-white/30">{m.provider} · {m.context_length ? `${(m.context_length / 1000).toFixed(0)}k ctx` : m.id}</p>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              m.status === 'available' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {m.status === 'available' ? t.available : t.unavailable}
            </span>
          </div>
        ))}
      </div>

      {/* Test section */}
      <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4 space-y-3">
        <h3 className="text-sm font-medium text-white/70">{t.testModel}</h3>
        <select
          value={testModel}
          onChange={(e) => setTestModel(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-indigo-500/50"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id} className="bg-[#1a1a3e]">{m.name}</option>
          ))}
        </select>
        <button
          onClick={runTest}
          disabled={testing}
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-all"
        >
          {testing ? t.thinking : `⚡ ${t.testModel}`}
        </button>

        {testResult && (
          <div className={`rounded-lg p-3 text-sm ${
            testResult.success ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'
          }`}>
            {testResult.success ? (
              <>
                <p className="text-white/80">{testResult.response}</p>
                <div className="flex gap-3 mt-2 text-[10px] text-white/40">
                  <span>📡 {testResult.provider}</span>
                  <span>⏱ {testResult.latency}ms</span>
                  {testResult.fallback && <span className="text-amber-400">⚡ fallback</span>}
                </div>
              </>
            ) : (
              <p className="text-red-300">❌ {testResult.error} ({testResult.latency}ms)</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
