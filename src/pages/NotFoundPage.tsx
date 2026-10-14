import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/States';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="page py-20">
      <EmptyState title="This page isn’t on the map" action={<Link to="/" className="btn-primary">Back home</Link>}>
        The link may be broken or the page may have moved.
      </EmptyState>
    </div>
  );
}
