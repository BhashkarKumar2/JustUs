import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Utility to convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export default function NotificationManager() {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [permission, setPermission] = useState(Notification.permission);

    const checkSubscription = async () => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setIsSubscribed(!!subscription);
        }
    };

    useEffect(() => {
        checkSubscription();
    }, []);

    const subscribeUser = async () => {
        if (!('serviceWorker' in navigator)) return;

        try {
            const registration = await navigator.serviceWorker.ready;

            const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            if (!publicVapidKey) {
                console.error('VAPID public key not found');
                return;
            }

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
            });

            // Send subscription to server
            // Assuming axios default base URL is set or we use relative path with proxy
            const token = localStorage.getItem('token') || document.cookie.split('; ').find(row => row.startsWith('auth-token='))?.split('=')[1];

            await axios.post('/api/notifications/subscribe', subscription, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setIsSubscribed(true);
            setPermission(Notification.permission);
            console.log('User subscribed to push notifications');
        } catch (err) {
            console.error('Failed to subscribe user: ', err);
        }
    };

    // Expose UI or just logic?
    // User asked for "Enable Notifications" button/logic.
    return (
        <div className="fixed bottom-4 left-4 z-50">
            {permission === 'default' && (
                <button
                    onClick={subscribeUser}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium transition-all"
                >
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    Enable Notifications
                </button>
            )}
        </div>
    );
}
