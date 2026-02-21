import React from 'react';

export default function ThemeToggle({ theme, setTheme }) {
  const toggle = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    try {
      localStorage.setItem('theme', newTheme);
      // Dispatch CustomEvent for same-tab sync (replaces 100ms polling)
      window.dispatchEvent(new CustomEvent('themeChange', { detail: newTheme }));
    } catch (e) {
      // ignore
    }
  };

  return (
    <button
      onClick={toggle}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      style={{
        background: theme === 'light' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
        border: theme === 'light' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.3s',
        fontSize: '1.2rem'
      }}
      onMouseEnter={e => e.currentTarget.style.background = theme === 'light' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'}
      onMouseLeave={e => e.currentTarget.style.background = theme === 'light' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'}
    >
      {theme === 'light' ? 'Dark' : 'Light'}
    </button>
  );
}
