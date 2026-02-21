import React, { useState, useEffect, lazy, Suspense } from 'react';
import ErrorBoundary from './components/common/ErrorBoundary';
import LoadingSpinner from './components/common/LoadingSpinner';
import ProfileModal from './components/modals/ProfileModal';
import api, { setAuthToken } from './services/api';
import { Toaster, toast } from 'react-hot-toast';

// Lazy load pages for better performance
const ChatPage = lazy(() => import('./pages/chat/ChatPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const SignupPage = lazy(() => import('./pages/auth/SignupPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));


export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [view, setView] = useState('login'); // login, signup, verify, forgot-password, reset-password
  const [verificationEmail, setVerificationEmail] = useState('');
  const [showContactSwitcher, setShowContactSwitcher] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Check for invite link on load
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/connect/')) {
      const inviteCode = path.split('/connect/')[1];
      if (inviteCode) {
        localStorage.setItem('pendingInviteCode', inviteCode);
        // Clean URL to avoid re-processing
        window.history.replaceState({}, document.title, '/');
      }
    } else if (path === '/forgot-password' || path === '/forgotpassword') {
      setView('forgot-password');
    }
  }, []);

  // Process pending invite when user is logged in
  useEffect(() => {
    const processPendingInvite = async () => {
      const inviteCode = localStorage.getItem('pendingInviteCode');
      if (inviteCode && user) {
        if (localStorage.getItem('invite_connecting') === '1') return; // prevent duplicate
        localStorage.setItem('invite_connecting', '1');
        try {
          const res = await api.post('/api/auth/connect', { inviteCode });
          localStorage.removeItem('pendingInviteCode');
          toast.success(`Connected with ${res.data.user.displayName}!`);
          // Force reload to update contacts list
          window.location.reload();
        } catch (error) {
          console.error('Failed to connect:', error);
          const msg = error.response?.data?.message || 'Failed to connect using invite link.';
          if (msg !== 'Already connected') {
            toast.error(msg);
          }
          localStorage.removeItem('pendingInviteCode');
        } finally {
          localStorage.removeItem('invite_connecting');
        }
      }
    };

    if (user) {
      processPendingInvite();
    }
  }, [user]);

  // Sync theme changes - uses CustomEvent for same-tab, storage event for cross-tab
  useEffect(() => {
    // Cross-tab theme sync via storage event
    const handleStorageChange = (e) => {
      if (e.key === 'theme') {
        setTheme(e.newValue || 'dark');
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Same-tab theme sync via CustomEvent (no polling needed!)
    const handleThemeChange = (e) => {
      setTheme(e.detail || 'dark');
    };
    window.addEventListener('themeChange', handleThemeChange);

    // Apply theme class to body for global styles (scrollbars etc)
    if (theme === 'dark') {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('themeChange', handleThemeChange);
    };
  }, [theme]);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('userData');

    if (token && userData) {
      try {
        setAuthToken(token);
        const cachedUser = JSON.parse(userData);
        setUser(cachedUser);

        // Background refresh: fetch fresh user data from server
        // This ensures fields like hasCompletedTour stay in sync
        api.get(`/api/auth/user/${cachedUser.id}`)
          .then(res => {
            const freshUser = { ...cachedUser, ...res.data };
            setUser(freshUser);
            localStorage.setItem('userData', JSON.stringify(freshUser));
          })
          .catch(() => { }); // Keep cached data on failure
      } catch (error) {
        console.error('Failed to restore user session:', error);
        localStorage.clear();
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    localStorage.setItem('userData', JSON.stringify(userData));
    setView('chat');
  };

  const handleUserUpdate = (updates) => {
    setUser(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem('userData', JSON.stringify(next));
      return next;
    });
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.clear();
    setAuthToken(null);
    setView('login');
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    // Dispatch CustomEvent for same-tab sync (replaces 100ms polling)
    window.dispatchEvent(new CustomEvent('themeChange', { detail: newTheme }));
  };

  if (loading) {
    const darkMode = theme === 'dark';
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-black'
        : 'bg-gradient-to-br from-indigo-200 via-blue-50 to-indigo-200'
        }`}>
        {/* Abstract shapes for visual interest behind glass */}
        <div className={`fixed top-1/4 left-1/4 w-72 h-72 rounded-full filter blur-xl opacity-70 animate-blob pointer-events-none will-change-transform hidden md:block ${darkMode ? 'bg-gray-700/30' : 'bg-gray-400/30'}`}></div>
        <div className={`fixed top-1/3 right-1/4 w-72 h-72 rounded-full filter blur-xl opacity-70 animate-blob animation-delay-2000 pointer-events-none will-change-transform hidden md:block ${darkMode ? 'bg-slate-700/30' : 'bg-gray-500/30'}`}></div>
        <div className={`fixed -bottom-8 left-1/3 w-72 h-72 rounded-full filter blur-xl opacity-70 animate-blob animation-delay-4000 pointer-events-none will-change-transform hidden md:block ${darkMode ? 'bg-zinc-700/30' : 'bg-gray-400/30'}`}></div>

        <LoadingSpinner size="lg" text="Loading JustUs..." />
      </div>
    );
  }

  const darkMode = theme === 'dark';

  const renderContent = () => {
    if (user) {
      return <ChatPage
        user={user}
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
        showContactSwitcher={showContactSwitcher}
        setShowContactSwitcher={setShowContactSwitcher}
        theme={theme}
      />;
    }

    if (view === 'signup') {
      return (
        <SignupPage
          onSignupSuccess={(email) => {
            setVerificationEmail(email);
            setView('verify');
          }}
          onSwitchToLogin={() => setView('login')}
          theme={theme}
        />
      );
    }

    if (view === 'verify') {
      return (
        <VerifyEmailPage
          email={verificationEmail}
          onVerificationSuccess={handleLogin}
          onBack={() => setView('login')}
          theme={theme}
        />
      );
    }

    if (view === 'forgot-password') {
      return (
        <ForgotPasswordPage
          onBackToLogin={() => setView('login')}
          theme={theme}
        />
      );
    }



    return (
      <LoginPage
        onLogin={handleLogin}
        onSwitchToSignup={() => setView('signup')}
        onSwitchToForgotPassword={() => setView('forgot-password')}
        onRequiresVerification={(email) => {
          setVerificationEmail(email);
          setView('verify');
        }}
        theme={theme}
      />
    );
  };

  return (
    <ErrorBoundary>
      <Toaster position="top-center" reverseOrder={false} />
      <div className={`min-h-screen relative overflow-hidden ${darkMode
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-black'
        : 'bg-gradient-to-br from-indigo-300 via-blue-200 to-indigo-300'
        }`}>
        {/* Abstract shapes for visual interest behind glass - Fixed positioning for entire app */}
        <div className={`fixed top-1/4 left-1/4 w-96 h-96 rounded-full filter blur-3xl opacity-50 animate-blob pointer-events-none -z-10 will-change-transform hidden md:block ${darkMode ? 'bg-gray-700/20' : 'bg-gray-400/30'}`}></div>
        <div className={`fixed top-1/3 right-1/4 w-96 h-96 rounded-full filter blur-3xl opacity-50 animate-blob animation-delay-2000 pointer-events-none -z-10 will-change-transform hidden md:block ${darkMode ? 'bg-slate-700/20' : 'bg-gray-500/30'}`}></div>
        <div className={`fixed -bottom-8 left-1/3 w-96 h-96 rounded-full filter blur-3xl opacity-50 animate-blob animation-delay-4000 pointer-events-none -z-10 will-change-transform hidden md:block ${darkMode ? 'bg-zinc-700/20' : 'bg-gray-400/30'}`}></div>

        <header className={`shadow-lg border-b sticky top-0 z-50 backdrop-blur-md transition-colors duration-300 ${darkMode
          ? 'bg-black/20 border-white/10'
          : 'bg-white/10 border-white/20'
          }`}>
          <div className="max-w-6xl mx-auto py-3 px-4 md:py-4 md:px-6 flex justify-between items-center">
            <div className="flex items-center space-x-2 md:space-x-3">
              <img src="/logo192.png" alt="JustUs Logo" className="w-8 h-8 md:w-10 md:h-10 rounded-lg object-contain" />
              <h1 className={`text-xl md:text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>JustUs</h1>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
              {/* Quick Contact Switcher - Only visible when logged in */}
              {user && (
                <button
                  onClick={() => setShowContactSwitcher(!showContactSwitcher)}
                  className={`p-2 rounded-lg transition-all duration-200 ${darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    : 'bg-gray-100 hover:bg-gray-200 text-indigo-600'
                    }`}
                  title="Quick switch contacts"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                </button>
              )}

              {/* Theme Toggle Button - Always Visible */}
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-lg transition-all duration-200 ${darkMode
                  ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400'
                  : 'bg-blue-200 hover:bg-blue-400 text-blue-700'
                  }`}
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {darkMode ? (
                  // Sun icon for light mode
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                ) : (
                  // Moon icon for dark mode
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                  </svg>
                )}
              </button>
              {/* Profile button - opens profile modal */}
              {user && (
                <button
                  onClick={() => setShowProfileModal(true)}
                  className={`p-2 rounded-lg transition-all duration-200 ${darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    : 'bg-gray-100 hover:bg-gray-200 text-indigo-600'
                    }`}
                  title="View Profile"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11.25a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 21v-1.125A6.375 6.375 0 0013.125 13.5h-2.25A6.375 6.375 0 004.5 19.875V21" />
                  </svg>
                </button>
              )}
              {user && (
                <>
                  <div className={`hidden md:block text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Welcome, <span className={`font-semibold ${darkMode ? 'text-white' : 'text-indigo-600'}`}>{user.displayName || user.username}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        {/* Profile modal for viewing/updating current user profile */}
        <ProfileModal
          show={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          user={user}
          onAvatarUpdate={(newUrl) => {
            handleUserUpdate({ avatarUrl: newUrl });
            setShowProfileModal(false);
          }}
          onProfileUpdate={(updates) => {
            handleUserUpdate(updates);
          }}
          theme={theme}
        />
        <main className="max-w-6xl mx-auto p-0 md:py-8 md:px-4">
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
              <LoadingSpinner size="lg" text="Loading..." />
            </div>
          }>
            {renderContent()}
          </Suspense>
        </main>
      </div>
    </ErrorBoundary>
  )
}
