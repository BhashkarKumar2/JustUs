import React, { useState } from 'react';
import { forgotPassword, resetPassword } from '../../services/auth';

export default function ForgotPasswordPage({ onBackToLogin, theme }) {
    const [step, setStep] = useState(1); // 1: Email, 2: OTP + New Password
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const darkMode = theme === 'dark';

    const handleSendCode = async (e) => {
        e.preventDefault();
        if (!email.trim()) {
            setError('Email is required');
            return;
        }

        setLoading(true);
        setError('');
        setMessage('');

        try {
            const res = await forgotPassword(email.trim());
            // Even if user doesn't exist, we move to next step for security privacy
            setStep(2);
            setMessage(res.message || 'Verification code sent if account exists.');
        } catch (err) {
            setError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (!code.trim() || !newPassword || !confirmPassword) {
            setError('All fields are required');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        if (!/(?=.*[A-Z])/.test(newPassword)) {
            setError('Password must contain at least one uppercase letter');
            return;
        }
        if (!/(?=.*\d)/.test(newPassword)) {
            setError('Password must contain at least one digit');
            return;
        }
        if (!/(?=.*[!@#$%^&*])/.test(newPassword)) {
            setError('Password must contain at least one special character (!@#$%^&*)');
            return;
        }

        setLoading(true);
        setError('');
        setMessage('');

        try {
            const res = await resetPassword({
                email: email.trim(),
                code: code.trim(),
                newPassword
            });
            setMessage(res.message || 'Password reset successful!');

            // Redirect to login after success
            setTimeout(() => {
                onBackToLogin();
            }, 2000);
        } catch (err) {
            setError(err.message || 'Failed to reset password. Code may be invalid or expired.');
        } finally {
            setLoading(false);
        }
    };

    // Glass UI styles matching the reference
    const glassCardClass = `w-full max-w-md p-8 rounded-3xl backdrop-blur-md border shadow-2xl transition-all duration-300 ${darkMode
        ? 'bg-black/30 border-white/10 shadow-black/20'
        : 'bg-white/10 border-white/20 shadow-black/10'
        }`;

    const glassInputClass = `w-full px-4 py-3.5 bg-transparent border-b-2 border-white/20 text-white placeholder-white/60 focus:border-white/90 outline-none transition-all duration-300 text-lg`;

    const glassButtonClass = `w-full py-4 px-6 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold rounded-full shadow-lg backdrop-blur-sm transition-all duration-200 transform active:scale-[0.98] tracking-wide uppercase text-sm mt-8`;

    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-100px)]">
            <div className={`relative z-10 w-full max-w-md px-4`}>
                <div className={glassCardClass}>

                    {/* Logo/Icon Area */}
                    <div className="flex justify-center -mt-16 mb-6">
                        <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg p-1">
                            <div className="w-full h-full rounded-full border border-white/10 flex items-center justify-center bg-black/20">
                                <span className="text-2xl font-bold text-white tracking-widest">JU</span>
                            </div>
                        </div>
                    </div>

                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-light text-white tracking-wider mb-2">
                            {step === 1 ? 'RECOVER' : 'RESET'}
                        </h2>
                        <p className="text-white/60 text-sm tracking-wide">
                            {step === 1 ? 'Enter email to receive code' : 'Set your new password'}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 rounded-lg bg-red-500/20 border border-red-500/30 text-white text-sm text-center backdrop-blur-sm">
                            {error}
                        </div>
                    )}

                    {message && (
                        <div className="mb-6 p-4 rounded-lg bg-green-500/20 border border-green-500/30 text-white text-sm text-center backdrop-blur-sm">
                            {message}
                        </div>
                    )}

                    {step === 1 && (
                        <form onSubmit={handleSendCode} className="space-y-6">
                            <div className="relative group">
                                <div className="absolute left-0 top-3.5 text-white/50 group-focus-within:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                                    </svg>
                                </div>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={`${glassInputClass} pl-10`}
                                    placeholder="Email Address"
                                    required
                                    autoFocus
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className={glassButtonClass}
                            >
                                {loading ? 'SENDING...' : 'SEND CODE'}
                            </button>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleResetPassword} className="space-y-6">
                            <div className="relative group">
                                <div className="absolute left-0 top-3.5 text-white/50 group-focus-within:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    className={`${glassInputClass} pl-10 tracking-widest`}
                                    placeholder="CODE"
                                    maxLength={6}
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="relative group">
                                <div className="absolute left-0 top-3.5 text-white/50 group-focus-within:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                    </svg>
                                </div>
                                <input
                                    type={showNewPassword ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className={`${glassInputClass} pl-10 pr-10`}
                                    placeholder="New Password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    className="absolute right-0 top-3 text-white/50 hover:text-white focus:outline-none transition-colors"
                                >
                                    {showNewPassword ? (
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
                            </div>

                            <div className="relative group">
                                <div className="absolute left-0 top-3.5 text-white/50 group-focus-within:text-white transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                    </svg>
                                </div>
                                <input
                                    type={showConfirmPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={`${glassInputClass} pl-10 pr-10`}
                                    placeholder="Confirm Password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-0 top-3 text-white/50 hover:text-white focus:outline-none transition-colors"
                                >
                                    {showConfirmPassword ? (
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
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className={glassButtonClass}
                            >
                                {loading ? 'RESETTING...' : 'RESET PASSWORD'}
                            </button>

                            <div className="text-center mt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="text-xs text-white/50 hover:text-white"
                                >
                                    Resend Code / Change Email
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="mt-8 text-center">
                        <button
                            onClick={onBackToLogin}
                            className="font-bold text-white hover:text-indigo-200 transition-colors tracking-wide text-sm"
                        >
                            BACK TO SIGN IN
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
