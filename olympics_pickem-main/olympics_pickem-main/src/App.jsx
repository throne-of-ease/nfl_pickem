import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/layout';
import { ProtectedRoute } from './components/auth';
import {
  LeaderboardPage,
  PicksOverviewPage,
  RulesPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  MyPicksPage,
  AdminPage,
} from './pages';
import './styles/global.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ResetPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Main app routes */}
            <Route path="/" element={<Layout />}>
              <Route index element={<PicksOverviewPage />} />
              <Route path="games" element={<Navigate to="/" replace />} />
              <Route path="leaderboard" element={<LeaderboardPage />} />
              <Route path="rules" element={<RulesPage />} />

              {/* Protected routes */}
              <Route
                path="my-picks"
                element={
                  <ProtectedRoute>
                    <MyPicksPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="admin"
                element={
                  <ProtectedRoute requireAdmin>
                    <AdminPage />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
