import React, { useEffect, useRef, useState } from 'react';
import { loadAuthenticatedMedia } from '../../../utils/mediaLoader';
import { getAuthenticatedApi } from '../../../services/api';
import { toast } from 'react-hot-toast';

export default function AudioMessage({ message, mine, colors, theme }) {
  // ... existing state hooks

  // Styles derived from colors prop or defaults
  const containerStyle = {
    // Force a semi-transparent black background to darken the parent bubble color
    background: theme === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.06)',
    color: mine ? colors?.bubbleOutText || '#fff' : colors?.bubbleInText || '#1f2937'
  };
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speakingTranslated, setSpeakingTranslated] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const audioRef = useRef(null);
  const ttsAudioRef = useRef(null);

  // Only load audio when user clicks play button
  const handleDownload = async () => {
    if (downloaded || loading) return;

    setDownloaded(true);

    // If temporary (local blob), use directly
    if (!message.content || message.temporary) {
      setAudioUrl(message.content);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(false);

      // FIX: Use direct URL with token instead of complex fetch/blob flow
      // This solves the 401 Unauthorized issue by leveraging the backend's tokenFromQuery middleware
      const token = localStorage.getItem('token');
      let baseUrl = message.content;

      // FIX: Handle relative URLs for production (Vercel -> Render)
      if (baseUrl && baseUrl.startsWith('/')) {
        const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        baseUrl = `${API_URL}${baseUrl}`;
      }

      // Ensure we have a valid URL
      const authUrl = baseUrl.includes('?')
        ? `${baseUrl}&token=${token}`
        : `${baseUrl}?token=${token}`;

      console.log('AudioMessage: Using direct auth URL for playback');
      setAudioUrl(authUrl);
      setLoading(false);

    } catch (error) {
      console.error('Failed to load audio:', error);
      setError(true);
      setLoading(false);
    }
  };

  // Auto-load temporary messages (uploads in progress)
  useEffect(() => {
    if (message.temporary) {
      setDownloaded(true);
      setAudioUrl(message.content);
    }
  }, [message.content, message.temporary]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const handleError = () => { console.error('Audio playback error'); setError(true); };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      // Stop and cleanup TTS audio when component unmounts
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
    };
  }, []);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else { audio.play(); setIsPlaying(true); }
  };

  const handleProgressClick = (e) => {
    const audio = audioRef.current;
    if (!audio || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSpeakTranslation = async () => {
    const translated = message.metadata?.translatedTranscript;
    const targetLang = message.metadata?.targetLanguage || 'hi';
    console.log('[AudioMessage] handleSpeakTranslation called:', { hasTranslation: !!translated, language: targetLang, text: translated });

    if (!translated) {
      console.warn('[AudioMessage] No translation available');
      return;
    }

    // If already speaking, stop
    if (speakingTranslated) {
      console.log('[AudioMessage] Stopping TTS playback');
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.currentTime = 0;
        ttsAudioRef.current = null;
      }
      setSpeakingTranslated(false);
      return;
    }

    try {
      console.log('[AudioMessage] Fetching TTS audio for language:', targetLang);
      setSpeakingTranslated(true);

      const api = getAuthenticatedApi();
      const response = await api.post('/api/tts/generate', {
        text: translated,
        language: targetLang
      }, {
        responseType: 'blob'
      });

      const audioBlob = response.data;


      const ttsAudioUrl = URL.createObjectURL(audioBlob);

      console.log('[AudioMessage] Playing TTS audio');

      // Create a new audio element for TTS
      const ttsAudio = new Audio(ttsAudioUrl);
      ttsAudioRef.current = ttsAudio; // Store reference for stopping

      ttsAudio.onended = () => {
        console.log('[AudioMessage] TTS playback ended');
        setSpeakingTranslated(false);
        URL.revokeObjectURL(ttsAudioUrl);
        ttsAudioRef.current = null;
      };
      ttsAudio.onerror = (e) => {
        console.error('[AudioMessage] TTS playback error:', e);
        setSpeakingTranslated(false);
        URL.revokeObjectURL(ttsAudioUrl);
        toast.error('Failed to play translation audio');
      };

      await ttsAudio.play();

    } catch (error) {
      console.error('[AudioMessage] TTS error:', error);
      setSpeakingTranslated(false);
      toast.error('Failed to generate speech for translation. Please try again.');
    }
  };

  if (error) {
    return (
      <div className="flex items-center space-x-3 py-2">
        <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-600">
          <p className="text-sm font-medium">Message load failed</p>
          <p className="text-xs opacity-80 mt-1">Ask the sender to send the message again</p>
        </div>
      </div>
    );
  }

  // Styles derived from colors prop or defaults


  const playBtnStyle = {
    background: mine
      ? (colors?.bubbleOutText || '#fff')
      : (theme === 'dark' ? '#4b5563' : (colors?.sendBtn || '#4f46e5')), // Gray-600 in dark mode
    color: mine
      ? (colors?.bubbleOut || '#4f46e5')
      : '#fff'
  };

  return (
    <div className="flex items-center space-x-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="p-4 rounded-xl border border-white/10 backdrop-blur-sm" style={containerStyle}>
          {!downloaded ? (
            // Placeholder with play button
            <div className="flex items-center space-x-4">
              <button
                onClick={handleDownload}
                style={playBtnStyle}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg"
              >
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              </button>

              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <div className="flex-1 h-2 bg-black/10 rounded-full relative overflow-hidden">
                    <div className="h-full w-0 rounded-full" style={{ background: mine ? colors?.bubbleOutText || '#fff' : colors?.sendBtn || '#4f46e5' }} />
                  </div>
                  <div className="text-xs font-medium tabular-nums opacity-80">
                    Voice Message
                  </div>
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-medium opacity-80">Loading voice message...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-4">
              <button
                onClick={togglePlayPause}
                style={playBtnStyle}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg"
              >
                {isPlaying ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <div className="flex-1 h-2 bg-black/10 rounded-full cursor-pointer relative overflow-hidden" onClick={handleProgressClick}>
                    <div
                      className="h-full rounded-full transition-all duration-150"
                      style={{
                        width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
                        background: mine ? colors?.bubbleOutText || '#fff' : colors?.sendBtn || '#4f46e5'
                      }}
                    />
                  </div>
                  <div className="text-xs font-medium tabular-nums opacity-80">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>
                <div className="mt-1">
                  {isPlaying && <span className="text-xs font-medium opacity-70 animate-pulse">● Playing</span>}
                </div>
              </div>
            </div>
          )}

          {audioUrl && (
            <audio ref={audioRef} src={audioUrl} preload="metadata" style={{ display: 'none' }} />
          )}

          {/* Toggle Transcript Button */}
          {(message.metadata?.translatedTranscript || message.metadata?.transcript) && (
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                style={{
                  fontSize: '11px',
                  opacity: 0.7,
                  background: 'rgba(0,0,0,0.1)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer'
                }}
              >
                {showTranscript ? 'Hide Text' : 'Show Text'}
              </button>
            </div>
          )}

          {/* Transcripts container - hidden by default */}
          {showTranscript && (
            <div className="animate-fadeIn">
              {/* Display translated transcript if available */}
              {message.metadata?.translatedTranscript && (
                <div className="mt-2 px-3 py-2 rounded-lg text-sm" style={{ borderLeft: '3px solid currentColor', background: 'rgba(0,0,0,0.05)' }}>
                  <div className="flex items-center justify-end gap-2 mb-1">
                    <button
                      type="button"
                      onClick={handleSpeakTranslation}
                      style={{ background: colors?.sendBtn || '#10b981', color: '#fff' }}
                      className="text-xs font-semibold px-3 py-1 rounded-md transition-opacity hover:opacity-90 flex-shrink-0"
                    >
                      {speakingTranslated ? 'Stop' : 'Play'} translation
                    </button>
                  </div>
                  <div className="italic opacity-90">&quot;{message.metadata.translatedTranscript}&quot;</div>
                </div>
              )}

              {/* Display transcript if available */}
              {message.metadata?.transcript && (
                <div className="mt-2 px-3 py-2 rounded-lg text-sm italic opacity-80" style={{ borderLeft: '3px solid currentColor', background: 'rgba(0,0,0,0.05)' }}>
                  💬 &quot;{message.metadata.transcript}&quot;
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {message.temporary && (
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60"></div>
          <span className="text-xs opacity-60 font-medium">
            {message.metadata?.status === 'translating' ? 'Translating...' :
              message.metadata?.status === 'uploading' ? `Uploading ${message.metadata.progress}%` :
                message.metadata?.status === 'processing' ? 'Processing...' :
                  'Sending...'}
          </span>
        </div>
      )}
    </div>
  );
}
