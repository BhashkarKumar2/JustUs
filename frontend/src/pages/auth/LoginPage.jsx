import React, { useState } from 'react';
import { login } from '../../services/auth';
import { setAuthToken } from '../../services/api';

export default function LoginPage({ onLogin, onSwitchToSignup, onSwitchToForgotPassword, onRequiresVerification, theme }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const [showPassword, setShowPassword] = useState(false);
  const darkMode = theme === 'dark';

  const validateForm = () => {
    const newErrors = {};
    if (!username.trim()) newErrors.username = 'Username or Email is required';
    if (!password) newErrors.password = 'Password is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setErrors({});

    try {
      const res = await login({ username: username.trim(), password });
      const data = res.data;
      setAuthToken(data.token);
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.user.id);
      onLogin(data.user);
    } catch (error) {
      console.error('Login failed:', error);

      if (error.requiresVerification) {
        onRequiresVerification(error.email);
        return;
      }

      setErrors({ general: error.message || 'Login failed' });
    } finally {
      setLoading(false);
    }
  }

  // Deep Blue Glass UI matching the user's reference (Deep Blue instead of Pink)
  // We apply a dark/deep-blue glass effect even in light mode to ensure visibility and contrast.
  const glassCardClass = `w-full max-w-md p-8 rounded-3xl backdrop-blur-xl border shadow-2xl transition-all duration-300 ${darkMode
    ? 'bg-black/40 border-white/10 shadow-black/30'
    : 'bg-[#1e3a8a]/70 border-white/20 shadow-blue-900/20' // Deep Blue Glass for Light Mode
    }`;

  const glassInputClass = `w-full px-4 py-3.5 bg-transparent border-b-2 outline-none transition-all duration-300 text-lg border-white/20 text-white placeholder-white/60 focus:border-white/90`;

  const glassButtonClass = `w-full py-4 px-6 font-semibold rounded-full shadow-lg backdrop-blur-sm transition-all duration-200 transform active:scale-[0.98] tracking-wide uppercase text-sm mt-8 ${darkMode
    ? 'bg-white/10 hover:bg-white/20 border border-white/30 text-white'
    : 'bg-white/20 hover:bg-white/30 border border-white/30 text-white'
    }`;

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-100px)]">
      <div className={`relative z-10 w-full max-w-md px-4`}>
        <div className={glassCardClass}>

          {/* Logo/Icon Area - Mimicking the "cutout" or top icon */}
          <div className="flex justify-center -mt-16 mb-6">
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg p-1">
              <div className="w-full h-full rounded-full border border-white/10 flex items-center justify-center bg-black/20">
                <span className="text-2xl font-bold text-white tracking-widest">JU</span>
              </div>
            </div>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-3xl font-light text-white tracking-wider mb-2">
              WELCOME
            </h2>
            <p className="text-white/60 text-sm tracking-wide">
              Sign in to continue
            </p>
          </div>

          {errors.general && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/20 border border-red-500/30 text-white text-sm text-center backdrop-blur-sm">
              {errors.general}
            </div>
          )}

          <form onSubmit={submit} className="space-y-6">
            <div className="relative group">
              {/* Icon */}
              <div className="absolute left-0 top-3.5 text-white/50 group-focus-within:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`${glassInputClass} pl-10`}
                placeholder="Username"
              />
              {errors.username && <p className="mt-1 text-xs text-red-300">{errors.username}</p>}
            </div>

            <div className="relative group">
              {/* Icon */}
              <div className="absolute left-0 top-3.5 text-white/50 group-focus-within:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${glassInputClass} pl-10 pr-10`}
                placeholder="Password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-3.5 text-white/50 hover:text-white focus:outline-none transition-colors"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                )}
              </button>
              {errors.password && <p className="mt-1 text-xs text-red-300">{errors.password}</p>}
            </div>

            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => onSwitchToForgotPassword ? onSwitchToForgotPassword() : console.warn('onSwitchToForgotPassword not provided')}
                className="text-sm font-medium text-white/80 hover:text-white transition-colors underline decoration-white/30 hover:decoration-white"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={glassButtonClass}
            >
              {loading ? 'Processing...' : 'LOGIN'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-white/60 text-sm">
              Don't have an account?{' '}
              <button
                onClick={onSwitchToSignup}
                className="font-bold text-white hover:text-indigo-200 transition-colors ml-1"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
