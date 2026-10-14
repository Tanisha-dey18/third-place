import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { DataProvider } from '@/context/DataContext';
import { LibraryProvider } from '@/context/LibraryContext';
import { ToastProvider } from '@/context/ToastContext';
import { Layout } from '@/components/layout/Layout';
import HomePage from '@/pages/HomePage';

// Route-level code splitting keeps the first load small on mobile.
const ExplorePage = lazy(() => import('@/pages/ExplorePage'));
const MoodPage = lazy(() => import('@/pages/MoodPage'));
const HiddenGemsPage = lazy(() => import('@/pages/MoodPage').then((m) => ({ default: m.HiddenGemsPage })));
const StudyPage = lazy(() => import('@/pages/StudyPage'));
const FindPage = lazy(() => import('@/pages/FindPage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const CafeDetailPage = lazy(() => import('@/pages/CafeDetailPage'));
const MenuPage = lazy(() => import('@/pages/MenuPage'));
const NeighbourhoodsPage = lazy(() => import('@/pages/NeighbourhoodsPage'));
const CollectionsPage = lazy(() => import('@/pages/CollectionsPage'));
const CollectionDetailPage = lazy(() => import('@/pages/CollectionsPage').then((m) => ({ default: m.CollectionDetailPage })));
const SavedPage = lazy(() => import('@/pages/SavedPage'));
const AuthPage = lazy(() => import('@/pages/AuthPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <LibraryProvider>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<HomePage />} />
                  <Route path="explore" element={<ExplorePage />} />
                  <Route path="mood/:slug" element={<MoodPage />} />
                  <Route path="dates" element={<Navigate to="/mood/date" replace />} />
                  <Route path="hidden-gems" element={<HiddenGemsPage />} />
                  <Route path="study" element={<StudyPage />} />
                  <Route path="find" element={<FindPage />} />
                  <Route path="search" element={<SearchPage />} />
                  <Route path="cafe/:slug" element={<CafeDetailPage />} />
                  <Route path="menu" element={<MenuPage />} />
                  <Route path="neighbourhoods" element={<NeighbourhoodsPage />} />
                  <Route path="collections" element={<CollectionsPage />} />
                  <Route path="collections/:id" element={<CollectionDetailPage />} />
                  <Route path="saved" element={<SavedPage />} />
                  <Route path="login" element={<AuthPage mode="login" />} />
                  <Route path="signup" element={<AuthPage mode="signup" />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="about" element={<AboutPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </LibraryProvider>
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
