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
    return null;
}
