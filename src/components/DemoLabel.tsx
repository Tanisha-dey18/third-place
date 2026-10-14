import { FlaskConical } from 'lucide-react';

/** Always shown on fictional sample records. */
export function DemoLabel({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-espresso/85 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ivory backdrop-blur ${className}`}
      title="Fictional sample record for demonstration. Not a real business."
    >
      <FlaskConical size={11} aria-hidden /> Demo
    </span>
  );
}
