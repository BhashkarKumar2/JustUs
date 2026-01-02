import React, { useState, useEffect } from 'react';
import { verifyEmail, resendVerification } from '../../services/auth';
import { setAuthToken } from '../../services/api';

export default function VerifyEmailPage({ email, onVerificationSuccess, onBack, theme }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [timer, setTimer] = useState(60);

  const darkMode = theme === 'dark';

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await verifyEmail({ email, code });
      const data = res.data;
      setAuthToken(data.token);
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.user.id);
      onVerificationSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0) return;

    setResending(true);
    setMessage('');
    setError('');
    try {
      await resendVerification(email);
      setMessage('Verification code resent successfully');
      setTimer(60);
    } catch (err) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-100px)]">
      <div className="w-full max-w-md">
        <div className={`rounded-2xl p-8 shadow-xl ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="text-center mb-8">
            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${darkMode ? 'bg-indigo-900/50' : 'bg-indigo-100'
              }`}>
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Verify your email
            </h2>
            <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
              We sent a verification code to<br />
              <span className="font-medium text-indigo-500">{email}</span>
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm text-center">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Verification Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={`w-full px-4 py-3 text-center text-2xl tracking-widest rounded-lg border focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 outline-none ${darkMode
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-900'
                  }`}
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-lg shadow-indigo-500/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Didn't receive the code?{' '}
              <button
                onClick={handleResend}
                disabled={timer > 0 || resending}
                className="font-medium text-indigo-500 hover:text-indigo-400 transition-colors disabled:opacity-50"
              >
                {resending ? 'Sending...' : timer > 0 ? `Resend in ${timer}s` : 'Resend Code'}
              </button>
            </p>
          </div>

          <div className="mt-8 text-center border-t border-gray-100 dark:border-gray-700 pt-6">
            <button
              onClick={onBack}
              className={`text-sm font-medium text-indigo-500 hover:text-indigo-400 transition-colors ${loading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              ← Edit Email / Back to Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
