import { Navigate, useParams } from 'react-router-dom';
import { moodBySlug } from '@/lib/moods';
import ExplorePage from './ExplorePage';

export default function MoodPage() {
  const { slug } = useParams();
  const mood = moodBySlug(slug);
  if (!mood) return <Navigate to="/explore" replace />;
  return (
    <ExplorePage
      key={mood.slug}
      preset={{
        eyebrow: mood.kicker,
        title: mood.title,
        blurb: mood.blurb,
        image: mood.image,
        match: mood.match,
        rankOccasion: mood.occasion,
        rankAtmosphere: mood.atmosphere,
        suggestedFacilities: mood.suggestedFacilities,
      }}
    />
  );
}

export function HiddenGemsPage() {
  return (
    <ExplorePage
      preset={{
        eyebrow: 'Hidden gems',
        title: 'Quietly wonderful',
        blurb: 'Small, lesser-known places our curators have tagged as worth seeking out. This is an editorial tag, not a measure of popularity.',
        image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1400&q=70',
        match: { tag: 'hidden-gem' },
      }}
    />
  );
}
