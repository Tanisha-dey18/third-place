import { Bookmark } from 'lucide-react';
import { useLibrary } from '@/context/LibraryContext';

export function SaveButton({ cafeId, name, variant = 'icon' }: { cafeId: string; name: string; variant?: 'icon' | 'full' }) {
  const { isSaved, toggleSave } = useLibrary();
  const saved = isSaved(cafeId);
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void toggleSave(cafeId, name);
  };
  if (variant === 'full') {
    return (
      <button onClick={onClick} className={saved ? 'btn-primary' : 'btn-ghost'} aria-pressed={saved}>
        <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} aria-hidden />
        {saved ? 'Saved' : 'Save'}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`}
      className={`flex h-9 w-9 items-center justify-center rounded-full shadow-card backdrop-blur transition-colors ${
        saved ? 'bg-espresso text-ivory' : 'bg-ivory/90 text-espresso hover:bg-ivory'
      }`}
    >
      <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} aria-hidden />
    </button>
  );
}
