import { useEffect } from 'react';

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · THIRD PLACE` : 'THIRD PLACE — Not home. Not work. Your place.';
  }, [title]);
}
