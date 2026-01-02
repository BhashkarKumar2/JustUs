import { useState, useRef, useEffect, useCallback } from 'react';
import { getWebRTCConfig } from '../services/config';

/**
 * Shared WebRTC hook for both Video and Voice calls
 * @param {Object} params
 * @param {string} params.type - 'video' or 'audio'
 * @param {Object} params.socket - Socket.IO instance
 * @param {string} params.userId - Current user ID
 * @param {string} params.otherUserId - Target user ID
 * @param {Function} params.onCallEnd - Callback when call ends
 */
export default function useWebRTC({ type, socket, userId, otherUserId, onCallEnd }) {
    const isVideo = type === 'video';
    const logPrefix = `[${type}]`;
    const eventPrefix = isVideo ? 'video-call' : 'call';

    const [callState, setCallState] = useState('idle'); // idle, calling, ringing, connected, ended
    const [incomingCall, setIncomingCall] = useState(null);
    const [callDuration, setCallDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);

    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const callTimerRef = useRef(null);
    const callStartTimeRef = useRef(null);
    const rtcConfigRef = useRef(null);
    const pendingCandidates = useRef([]);

    // Fetch config on mount
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                rtcConfigRef.current = await getWebRTCConfig();
                console.log(`${logPrefix} WebRTC config loaded`);
            } catch (err) {
                console.error(`${logPrefix} Failed to load WebRTC config`, err);
            }
        };
        fetchConfig();
    }, [logPrefix]);

    // Timer logic
    const startCallTimer = useCallback(() => {
        console.log(`${logPrefix} startCallTimer`);
        setCallDuration(0);
        callStartTimeRef.current = Date.now();

        if (callTimerRef.current) clearInterval(callTimerRef.current);

        callTimerRef.current = setInterval(() => {
            setCallDuration(prev => {
                const next = prev + 1;
                if (next % 5 === 0) console.log(`${logPrefix} callDuration`, next);
                return next;
            });
        }, 1000);
    }, [logPrefix]);

    const stopCallTimer = useCallback(() => {
        console.log(`${logPrefix} stopCallTimer`);
        if (callTimerRef.current) {
            clearInterval(callTimerRef.current);
            callTimerRef.current = null;
        }
    }, [logPrefix]);

    // Media toggles
    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
                console.log(`${logPrefix} toggleMute, nowMuted=`, !audioTrack.enabled);
            }
        }
    }, [logPrefix]);

    const toggleVideo = useCallback(() => {
        if (!isVideo) return; // No-op for audio calls
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoOff(!videoTrack.enabled);
                console.log(`${logPrefix} toggleVideo, nowVideoOff=`, !videoTrack.enabled);
            }
        }
    }, [isVideo, logPrefix]);

    // Cleanup logic
    const cleanupMedia = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        setLocalStream(null);
        setRemoteStream(null);
        remoteStreamRef.current = null;
    }, []);

    const closePeerConnection = useCallback(() => {
        if (peerConnectionRef.current) {
            try {
                peerConnectionRef.current.close();
                console.log(`${logPrefix} peerConnection closed`);
            } catch (e) {
                console.error(`${logPrefix} error closing pc`, e);
            }
            peerConnectionRef.current = null;
        }
    }, [logPrefix]);

    // End call
    const endCall = useCallback(() => {
        console.log(`${logPrefix} endCall called, state=`, callState);
        const hadActiveCall = callState === 'connected';
        const finalDuration = callDuration;

        cleanupMedia();
        closePeerConnection();
        stopCallTimer();

        // Notify other user
        if (callState !== 'idle' && socket && otherUserId) {
            socket.emit(`${eventPrefix}.end`, { receiverId: otherUserId });
            console.log(`${logPrefix} emitted end to`, otherUserId);
        }

        if (hadActiveCall && finalDuration > 0 && onCallEnd) {
            onCallEnd(finalDuration, type);
        }

        setCallState('idle');
        setCallDuration(0);
        setIsMuted(false);
        setIsVideoOff(false);
        callStartTimeRef.current = null;
        pendingCandidates.current = [];
    }, [callState, callDuration, cleanupMedia, closePeerConnection, stopCallTimer, socket, otherUserId, eventPrefix, logPrefix, onCallEnd, type]);

    // Initialize PC
    const createPeerConnection = useCallback(() => {
        if (!rtcConfigRef.current) {
            console.error(`${logPrefix} usage: config not loaded`);
            return null;
        }

        const pc = new RTCPeerConnection(rtcConfigRef.current);

        pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
                socket.emit(`${eventPrefix}.ice-candidate`, {
                    receiverId: otherUserId,
                    candidate: event.candidate
                });
            }
        };

        pc.ontrack = (event) => {
            console.log(`${logPrefix} ontrack`, event.streams.length);
            if (event.streams && event.streams[0]) {
                if (remoteStreamRef.current?.id !== event.streams[0].id) {
                    remoteStreamRef.current = event.streams[0];
                    setRemoteStream(event.streams[0]);
                }
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`${logPrefix} connectionState:`, pc.connectionState);
            if (pc.connectionState === 'connected') {
                setCallState('connected');
                startCallTimer();
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                endCall();
            }
        };

        peerConnectionRef.current = pc;
        return pc;
    }, [logPrefix, socket, eventPrefix, otherUserId, startCallTimer, endCall]);

    // Signaling Actions
    const startCall = async () => {
        if (!socket || !otherUserId) return alert('Not connected');

        try {
            setCallState('calling');

            let constraints = { audio: true };
            if (isVideo) {
                constraints.video = { width: 640, height: 480 };
            } else {
                // Audio enhancements for voice calls
                constraints.audio = {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                };
                constraints.video = false;
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            localStreamRef.current = stream;
            setLocalStream(stream);

            const pc = createPeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.emit(`${eventPrefix}.offer`, {
                receiverId: otherUserId,
                offer
            });

        } catch (err) {
            console.error(`${logPrefix} startCall error`, err);
            alert(`Failed to start call: ${err.message}`);
            setCallState('idle');
        }
    };

    const answerCall = async () => {
        if (!incomingCall || !socket) return;

        try {
            setCallState('connected');

            // Use same constraints as startCall
            let constraints = { audio: true };
            if (isVideo) {
                constraints.video = { width: 640, height: 480 };
            } else {
                constraints.audio = {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                };
                constraints.video = false;
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            localStreamRef.current = stream;
            setLocalStream(stream);

            const pc = createPeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));

            // Add pending candidates
            if (pendingCandidates.current.length) {
                console.log(`${logPrefix} Adding ${pendingCandidates.current.length} queued candidates`);
                for (const c of pendingCandidates.current) {
                    await pc.addIceCandidate(new RTCIceCandidate(c));
                }
                pendingCandidates.current = [];
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit(`${eventPrefix}.answer`, {
                receiverId: incomingCall.callerId,
                answer
            });

            setIncomingCall(null);

        } catch (err) {
            console.error(`${logPrefix} answerCall error`, err);
            alert(`Failed to answer: ${err.message}`);
            rejectCall();
        }
    };

    const rejectCall = () => {
        if (incomingCall && socket) {
            socket.emit(`${eventPrefix}.reject`, { receiverId: incomingCall.callerId });
            setIncomingCall(null);
        }
        setCallState('idle');
    };

    // Socket Listeners
    useEffect(() => {
        if (!socket) return;

        const handlers = {
            offer: (data) => {
                console.log(`${logPrefix} received offer`);
                setIncomingCall({ callerId: data.senderId, callerName: data.callerName || 'User', offer: data.offer });
                setCallState('ringing');
            },
            answer: async (data) => {
                console.log(`${logPrefix} received answer`);
                if (peerConnectionRef.current) {
                    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
                }
            },
            iceCandidate: async (data) => {
                if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
                    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                } else {
                    pendingCandidates.current.push(data.candidate);
                }
            },
            reject: () => {
                console.log(`${logPrefix} received reject`);
                setCallState('idle'); // Just reset state, don't call endCall() loop logic
                alert('Call rejected');
                cleanupMedia(); // Cleanup media but don't re-emit end
                closePeerConnection();
                stopCallTimer();
            },
            end: () => {
                console.log(`${logPrefix} received end`);
                endCall();
            }
        };

        socket.on(`${eventPrefix}.offer`, handlers.offer);
        socket.on(`${eventPrefix}.answer`, handlers.answer);
        socket.on(`${eventPrefix}.ice-candidate`, handlers.iceCandidate);
        socket.on(`${eventPrefix}.reject`, handlers.reject);
        socket.on(`${eventPrefix}.end`, handlers.end);

        return () => {
            socket.off(`${eventPrefix}.offer`, handlers.offer);
            socket.off(`${eventPrefix}.answer`, handlers.answer);
            socket.off(`${eventPrefix}.ice-candidate`, handlers.iceCandidate);
            socket.off(`${eventPrefix}.reject`, handlers.reject);
            socket.off(`${eventPrefix}.end`, handlers.end);
        };
    }, [socket, eventPrefix, logPrefix, endCall, cleanupMedia, closePeerConnection, stopCallTimer]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Use the ref-safe cleanup logic
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop());
            }
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
            }
            if (callTimerRef.current) {
                clearInterval(callTimerRef.current);
            }
        };
    }, []);

    return {
        callState, incomingCall, callDuration,
        isMuted, isVideoOff,
        localStream, remoteStream,
        localStreamRef, remoteStreamRef,
        startCall, answerCall, rejectCall, endCall,
        toggleMute, toggleVideo
    };
}
