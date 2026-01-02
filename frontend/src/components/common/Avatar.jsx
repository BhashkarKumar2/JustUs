import React from 'react';

export default function Avatar({ user, size = 40, className = '' }) {
  // Use initials if no avatar image
  const initials = user.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase()
    : (user.username ? user.username[0].toUpperCase() : '?');
  return (
    <div
      className={`signal-avatar flex items-center justify-center rounded-full font-bold text-white shadow ${className}`}
      style={{ width: size, height: size, fontSize: size / 2 }}
      aria-label={user.displayName || user.username}
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.displayName || user.username}
          className="rounded-full w-full h-full object-cover"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
