import React from 'react';

export default function Stub({ title, description, icon = '🚧', t }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 animate-fade-in">
      <div className="w-20 h-20 rounded-2xl bg-surface-3 flex items-center justify-center text-3xl mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white/80 mb-1">{title}</h3>
      <p className="text-sm text-white/30 text-center max-w-[280px]">
        {description || t?.stubDesc || 'Coming soon'}
      </p>
      <div className="mt-6 px-4 py-2 rounded-full bg-accent-dim text-accent text-xs font-medium">
        {t?.comingSoon || 'Coming soon'}
      </div>
    </div>
  );
}
