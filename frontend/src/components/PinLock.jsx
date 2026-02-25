import React, { useState } from 'react';
import { e2e } from '../crypto';

export default function PinLock({ userId, onUnlock, t }) {
  const [pin, setPin] = useState('');
  const [isNew, setIsNew] = useState(!localStorage.getItem(`e2e_check_${userId}`));
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState(isNew ? 'create' : 'unlock');

  const handleCreate = async () => {
    if (pin.length < 4) { setError('PIN min 4 digits'); return; }
    if (pin !== confirm) { setError('PINs do not match'); return; }
    const key = await e2e.deriveKeyFromPin(pin, userId);
    // Store check value to verify PIN later
    const check = await e2e.encrypt(key, 'e2e_ok');
    localStorage.setItem(`e2e_check_${userId}`, check);
    e2e.storeKey(key);
    onUnlock(key);
  };

  const handleUnlock = async () => {
    if (!pin) return;
    const key = await e2e.deriveKeyFromPin(pin, userId);
    const check = localStorage.getItem(`e2e_check_${userId}`);
    const result = await e2e.decrypt(key, check);
    if (result === 'e2e_ok') {
      e2e.storeKey(key);
      onUnlock(key);
    } else {
      setError(t?.error || 'Wrong PIN');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-6">
      <div className="w-full max-w-xs space-y-6 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
          <span className="text-3xl">🔐</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white/90">{step === 'create' ? 'Create PIN' : 'Enter PIN'}</h2>
          <p className="text-xs text-white/40 mt-1">{step === 'create' ? 'Your data will be encrypted with this PIN' : 'Unlock your encrypted data'}</p>
        </div>
        <div className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g,'')); setError(''); }}
            placeholder="PIN (min 4 digits)"
            maxLength={8}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] text-white/90 font-mono placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
            autoFocus
          />
          {step === 'create' && (
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={confirm}
              onChange={e => { setConfirm(e.target.value.replace(/\D/g,'')); setError(''); }}
              placeholder="Confirm PIN"
              maxLength={8}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] text-white/90 font-mono placeholder-white/20 focus:outline-none focus:border-indigo-500/50"
            />
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={step === 'create' ? handleCreate : handleUnlock}
            disabled={pin.length < 4}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-medium transition-all"
          >
            {step === 'create' ? '🔒 Create & Encrypt' : '🔓 Unlock'}
          </button>
        </div>
        <p className="text-[10px] text-white/20">E2E encrypted • Server cannot read your data</p>
      </div>
    </div>
  );
}
