import React, { useEffect } from 'react';
import { TonConnectButton, useTonAddress } from '@tonconnect/ui-react';

export function TonWalletButton({ userId }) {
  const address = useTonAddress();

  useEffect(() => {
    if (address && userId) {
      fetch(`/api/user/${userId}/ton-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || '' },
        body: JSON.stringify({ address }),
      }).catch(() => {});
    }
  }, [address, userId]);

  return (
    <div className="flex items-center gap-2">
      <TonConnectButton className="ton-btn" />
    </div>
  );
}

// --- Stubs ---
export async function payForModel(modelId, amount) { console.log('[TON] payForModel stub:', modelId, amount); return { success: false, error: 'Not implemented' }; }
export async function subscribeWithTon(planId) { console.log('[TON] subscribe stub:', planId); return { success: false, error: 'Not implemented' }; }
export async function getTonBalance(address) { console.log('[TON] getBalance stub:', address); return { balance: 0 }; }
