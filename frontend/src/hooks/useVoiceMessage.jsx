import { useEffect, useRef, useState } from 'react';
import { getAuthenticatedApi } from '../services/api';
import { sendSocketMessage } from '../services/socket';
import aiService from '../services/aiService';

export default function useVoiceMessage({ userId, otherUserId, conversationId, setMessages }) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const recognitionRef = useRef(null);
  const [transcript, setTranscript] = useState('');
  const transcriptRef = useRef(''); // Add ref to track latest transcript

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
            console.log('[VoiceMessage] Speech recognized (final):', transcript);
          } else {
            interimTranscript += transcript;
            // console.log('[VoiceMessage] Speech recognized (interim):', transcript);
          }
        }

        const combined = finalTranscript + interimTranscript;
        setTranscript(combined);
        transcriptRef.current = combined; // Keep ref in sync
        // console.log('[VoiceMessage] Current transcript:', combined);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices) {
      alert('Voice recording is not supported in your browser.');
      return;
    }
    try {
      setRecording(true);
      setTranscript('');
      transcriptRef.current = ''; // Reset ref too

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // Start audio recording
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => audioChunksRef.current.push(e.data);

      // Start speech recognition
      if (recognitionRef.current) {
        console.log('[VoiceMessage] Starting speech recognition...');
        recognitionRef.current.start();
      } else {
        console.warn('[VoiceMessage] ⚠️ Speech Recognition not available!');
        console.warn('Translation will not work without transcript.');
        console.warn('Use Chrome or Edge browser for Speech Recognition support.');
      }

      mr.onstop = async () => {
        // Stop speech recognition
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }

        // Use ref to get latest transcript value
        const capturedTranscript = transcriptRef.current.trim();
        console.log('[VoiceMessage] Recording stopped. Transcript:', capturedTranscript || '(empty)');

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const blobUrl = URL.createObjectURL(blob);

        // Create temp message immediately for UI feedback
        const tempId = 'temp-audio-' + Date.now();
        const baseMetadata = {
          status: 'processing', // processing -> translating -> uploading
          progress: 0,
          transcript: capturedTranscript
        };

        const tempMessage = {
          id: tempId,
          type: 'audio',
          content: blobUrl,
          senderId: userId,
          receiverId: otherUserId,
          conversationId,
          timestamp: new Date().toISOString(),
          temporary: true,
          metadata: baseMetadata
        };

        setMessages(prev => [...prev, tempMessage]);

        const updateTempMessage = (updates) => {
          setMessages(prev => prev.map(msg =>
            msg.id === tempId
              ? { ...msg, metadata: { ...msg.metadata, ...updates } }
              : msg
          ));
        };

        // Enhance transcription with AI if available
        let finalTranscript = capturedTranscript;
        let translatedTranscript = '';
        let targetLanguage = 'en';

        if (finalTranscript) {
          setTranscribing(true);
          updateTempMessage({ status: 'translating' });

          try {
            console.log('[VoiceTranslation] Enhancing transcript...');
            const enhanced = await aiService.enhanceTranscription(finalTranscript);
            if (enhanced.improved) {
              finalTranscript = enhanced.enhanced;
              // Update transcript in UI
              updateTempMessage({ transcript: finalTranscript });
            }

            // Get receiver's preferred language
            try {
              const authenticatedApi = getAuthenticatedApi();
              const receiverRes = await authenticatedApi.get(`/api/auth/user/${otherUserId}`);
              targetLanguage = receiverRes.data?.preferredLanguage || 'en';
            } catch (err) {
              console.warn('[VoiceTranslation] Could not fetch receiver language:', err.message);
            }

            console.log('[VoiceTranslation] Translating to', targetLanguage, '...');
            const translation = await aiService.translateText(finalTranscript, 'auto', targetLanguage);
            if (translation?.translated) {
              translatedTranscript = translation.translated;
              updateTempMessage({ translatedTranscript });
            }
          } catch (error) {
            console.error('[VoiceTranslation] ✗ AI enhancement/translation failed:', error);
          }
          setTranscribing(false);
        } else {
          // Warnings logic omitted for brevity in UI flow, kept in logs
          console.warn('[VoiceMessage] No transcript captured');
        }

        // Start Upload
        updateTempMessage({ status: 'uploading', progress: 0 });

        const fd = new FormData();
        fd.append('file', blob, 'voice.webm');
        if (conversationId) fd.append('conversationId', conversationId);

        try {
          const authenticatedApi = getAuthenticatedApi();
          const res = await authenticatedApi.post('/api/media/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              updateTempMessage({ progress: percent });
            }
          });

          const id = res.data.id;
          const url = `/api/media/file/${id}`;

          const finalMetadata = {
            transcript: finalTranscript,
            translatedTranscript: translatedTranscript || undefined,
            targetLanguage: targetLanguage || 'en',
            // Remove status/progress for final message
          };

          // Send Socket Message
          const success = sendSocketMessage({
            receiverId: otherUserId || 'other',
            type: 'audio',
            content: url,
            conversationId,
            senderId: userId,
            metadata: finalMetadata
          });

          if (!success) {
            try {
              const apiRes = await authenticatedApi.post('/api/chat/messages', {
                type: 'audio',
                content: url,
                receiverId: otherUserId,
                conversationId,
                metadata: finalMetadata
              });
              // Replace temp with API result
              setMessages(prev => prev.map(msg => msg.id === tempId ? { ...apiRes.data, temporary: false } : msg));
            } catch (apiError) {
              console.error('API send failed', apiError);
              setMessages(prev => prev.filter(msg => msg.id !== tempId));
              alert('Failed to send audio message. Please try again.');
            }
          } else {
            // Socket sent - remove temp. Server echo will add real message.
            // Note: To avoid flickering, we could keep it and wait for echo to replace it if IDs match? 
            // But server generates new ID. 
            // Usually we remove temp message as soon as socket sends, assuming socket echo comes fast.
            // OR we mark it as sent?
            // The current pattern in useImageUpload is filtering it out. I'll stick to that.
            setMessages(prev => prev.filter(msg => msg.id !== tempId));
          }

        } catch (error) {
          console.error('Voice upload failed:', error);
          alert('Failed to send voice message. Please try again.');
          setMessages(prev => prev.filter(msg => msg.id !== tempId));
        }

        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
        }
        setRecording(false);
        setTranscript('');
      };
      mr.start();
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to access microphone. Please check your permissions.');
      setRecording(false);
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') {
      console.log('[VoiceMessage] Stopping recording...');
      mr.stop();
    } else {
      console.warn('[VoiceMessage] stopRecording called but state was:', mr?.state);
    }
  };

  useEffect(() => () => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  return {
    recording,
    startRecording,
    stopRecording,
    transcript: transcript.trim(),
    transcribing
  };
}
