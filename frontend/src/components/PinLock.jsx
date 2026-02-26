import React, { useEffect, useMemo, useState } from 'react';
import { e2e } from '../crypto';

const MIN_PIN_LENGTH = 6;
const MAX_PIN_LENGTH = 8;
const SOFT_BASE_DELAY_MS = 1000;
const SOFT_MAX_DELAY_MS = 5 * 60 * 1000;
const HARD_LOCK_AFTER_ATTEMPTS = 10;
const HARD_LOCK_MS = 30 * 60 * 1000;

function lockKey(userId) {
  return `e2e_pin_lock_${userId}`;
}

function checkKey(userId) {
  return `e2e_check_${userId}`;
}

function readLockState(userId) {
  try {
    const raw = localStorage.getItem(lockKey(userId));
    if (!raw) return { failedCount: 0, lockUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      failedCount: Number(parsed.failedCount) || 0,
      lockUntil: Number(parsed.lockUntil) || 0,
    };
  } catch {
    return { failedCount: 0, lockUntil: 0 };
  }
}

function saveLockState(userId, state) {
  localStorage.setItem(lockKey(userId), JSON.stringify(state));
}

function clearLockState(userId) {
  localStorage.removeItem(lockKey(userId));
}

export default function PinLock({ userId, onUnlock, t }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(Date.now());
  const [lockState, setLockState] = useState(() => readLockState(userId));
  const [step, setStep] = useState(() => (localStorage.getItem(checkKey(userId)) ? 'unlock' : 'create'));

  useEffect(() => {
    setPin('');
    setConfirm('');
    setError('');
    setLockState(readLockState(userId));
    setStep(localStorage.getItem(checkKey(userId)) ? 'unlock' : 'create');
  }, [userId]);

  const remainingMs = Math.max(0, lockState.lockUntil - tick);
  const isLocked = remainingMs > 0;

  useEffect(() => {
    if (!isLocked) return undefined;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLocked]);

  const lockHint = useMemo(() => {
    if (!isLocked) return '';
    const sec = Math.ceil(remainingMs / 1000);
    return `Too many attempts. Try again in ${sec}s.`;
  }, [isLocked, remainingMs]);

  const persistLock = (next) => {
    setLockState(next);
    saveLockState(userId, next);
    setTick(Date.now());
  };

  const validatePin = (value) => /^\d{6,8}$/.test(value);

  const registerFailedAttempt = () => {
    const nextCount = (lockState.failedCount || 0) + 1;

    if (nextCount >= HARD_LOCK_AFTER_ATTEMPTS) {
      persistLock({ failedCount: 0, lockUntil: Date.now() + HARD_LOCK_MS });
      return HARD_LOCK_MS;
    }

    const delay = Math.min(SOFT_BASE_DELAY_MS * (2 ** (nextCount - 1)), SOFT_MAX_DELAY_MS);
    persistLock({ failedCount: nextCount, lockUntil: Date.now() + delay });
    return delay;
  };

  const handleCreate = async () => {
    if (!validatePin(pin)) {
      setError(`PIN must be ${MIN_PIN_LENGTH}-${MAX_PIN_LENGTH} digits`);
      return;
    }
    if (pin !== confirm) {
      setError('PINs do not match');
      return;
    }

    const key = await e2e.deriveKeyFromPin(pin, userId);
    const check = await e2e.encrypt(key, 'e2e_ok');
    localStorage.setItem(checkKey(userId), check);
    clearLockState(userId);
    setLockState({ failedCount: 0, lockUntil: 0 });
    e2e.storeKey(key);
    onUnlock(key);
  };

  const handleUnlock = async () => {
    if (isLocked) {
      setError(lockHint);
      return;
    }

    if (!validatePin(pin)) {
      setError(`PIN must be ${MIN_PIN_LENGTH}-${MAX_PIN_LENGTH} digits`);
      return;
    }

    const check = localStorage.getItem(checkKey(userId));
    if (!check) {
      setStep('create');
      setError('PIN is not set. Create a new PIN.');
      return;
    }

    const key = await e2e.deriveKeyFromPin(pin, userId);
    const result = await e2e.decrypt(key, check);

    if (result === 'e2e_ok') {
      clearLockState(userId);
      setLockState({ failedCount: 0, lockUntil: 0 });
      setError('');
      e2e.storeKey(key);
      onUnlock(key);
      return;
    }

    const delay = registerFailedAttempt();
    setError(`${t?.error || 'Wrong PIN'}. Retry in ${Math.ceil(delay / 1000)}s.`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-6">
      <div className="w-full max-w-xs space-y-6 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
          <span className="text-3xl">🔐</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white/90">{step === 'create' ? 'Create PIN' : 'Enter PIN'}</h2>
          <p className="text-xs text-white/40 mt-1">
            {step === 'create' ? 'Your data will be encrypted with this PIN' : 'Unlock your encrypted data'}
          </p>
        </div>
        <div className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''));
              setError('');
            }}
            placeholder={`PIN (${MIN_PIN_LENGTH}-${MAX_PIN_LENGTH} digits)`}
            maxLength={MAX_PIN_LENGTH}
            disabled={isLocked}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] text-white/90 font-mono placeholder-white/20 focus:outline-none focus:border-indigo-500/50 disabled:opacity-40"
            autoFocus
          />
          {step === 'create' && (
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              placeholder="Confirm PIN"
              maxLength={MAX_PIN_LENGTH}
              disabled={isLocked}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] text-white/90 font-mono placeholder-white/20 focus:outline-none focus:border-indigo-500/50 disabled:opacity-40"
            />
          )}
          {(error || lockHint) && <p className="text-xs text-red-400">{error || lockHint}</p>}
          <button
            onClick={step === 'create' ? handleCreate : handleUnlock}
            disabled={isLocked || pin.length < MIN_PIN_LENGTH}
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
