import type { ReactNode } from 'react';
import { AlertTriangle, RotateCw, Compass } from 'lucide-react';

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-oat bg-ivory/50 px-6 py-12 text-center">
      <div className="mb-3 text-latte">{icon ?? <Compass size={28} aria-hidden />}</div>
      <h3 className="text-xl text-espresso">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm leading-relaxed text-mocha">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-2xl border border-clay/30 bg-clay-light/40 px-6 py-10 text-center">
      <AlertTriangle className="mb-2 text-clay" aria-hidden />
      <h3 className="text-lg">Something didn’t load</h3>
      <p className="mt-1 max-w-md text-sm text-mocha">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-ghost mt-4">
          <RotateCw size={15} aria-hidden /> Try again
        </button>
      )}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-ivory shadow-card" aria-hidden>
      <div className="shimmer aspect-[4/3]" />
      <div className="space-y-2 p-4">
        <div className="shimmer h-5 w-2/3 rounded" />
        <div className="shimmer h-4 w-1/2 rounded" />
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
