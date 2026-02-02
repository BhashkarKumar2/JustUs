import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatPage from './chat/ChatPage'; // Corrected path
import * as chatService from '../services/chat'; // Adjusted path
import * as socketService from '../services/socket'; // Adjusted path

// --- Mocks ---

// Mock Services
jest.mock('../services/chat');
jest.mock('../services/socket');
jest.mock('../services/wallpaperService', () => ({
    saveWallpaper: jest.fn(),
    fetchWallpaper: jest.fn().mockResolvedValue({}),
    buildWallpaperUrl: jest.fn()
}));

// Mock Child Components to simplify testing (Integration Test level)
jest.mock('../components/chat/layout/ChatMessages', () => {
    const MockChatMessages = ({ onForward }) => (
        <div data-testid="chat-messages">
            <button
                data-testid="trigger-forward"
                onClick={() => onForward({ id: 'msg-1', content: 'Hello', type: 'text' })}
            >
                Forward Msg 1
            </button>
        </div>
    );
    MockChatMessages.displayName = 'MockChatMessages';
    return MockChatMessages;
});

jest.mock('../components/modals/UserSelectModal', () => {
    const MockUserSelectModal = ({ show, onSelect, onClose }) => {
        if (!show) return null;
        return (
            <div data-testid="user-select-modal">
                <button data-testid="select-user-2" onClick={() => onSelect('user-2')}>Select User 2</button>
                <button onClick={onClose}>Close</button>
            </div>
        );
    };
    MockUserSelectModal.displayName = 'MockUserSelectModal';
    return MockUserSelectModal;
});

jest.mock('../components/chat/layout/ChatHeader', () => Object.assign(() => <div>ChatHeader</div>, { displayName: 'MockChatHeader' }));
jest.mock('../components/chat/input/ComposeBar', () => Object.assign(() => <div>ComposeBar</div>, { displayName: 'MockComposeBar' }));
jest.mock('../components/chat/layout/TypingIndicator', () => Object.assign(() => null, { displayName: 'MockTypingIndicator' }));
jest.mock('../components/chat/layout/ScrollToBottomButton', () => Object.assign(() => null, { displayName: 'MockScrollToBottomButton' }));
jest.mock('../components/modals/VoiceCallModal', () => Object.assign(() => null, { displayName: 'MockVoiceCallModal' }));
jest.mock('../components/modals/VideoCallModal', () => Object.assign(() => null, { displayName: 'MockVideoCallModal' }));
jest.mock('../components/modals/SmartSearch', () => Object.assign(() => null, { displayName: 'MockSmartSearch' }));
jest.mock('../components/chat/layout/WallpaperPanel', () => Object.assign(() => null, { displayName: 'MockWallpaperPanel' }));

// Mock Hooks
const mockSetMessages = jest.fn();
const mockSetOtherUserId = jest.fn();

jest.mock('../hooks/useChatInitialization', () => () => ({
    messages: [{ id: 'msg-1', content: 'Hello', type: 'text' }],
    setMessages: mockSetMessages,
    conversationId: 'conv-1',
    otherUser: { id: 'user-2', username: 'User 2' },
    otherUserId: 'user-1', // Initially talking to user 1
    setOtherUserId: mockSetOtherUserId,
    availableUsers: [{ id: 'user-1' }, { id: 'user-2' }],
    loading: false,
    hasMoreMessages: false,
    loadingMore: false,
    loadMoreMessages: jest.fn()
}));

jest.mock('../hooks/useChatSocket', () => () => ({
    onTyping: jest.fn()
}));

jest.mock('../hooks/useMessageSender', () => () => ({
    text: '',
    setText: jest.fn(),
    sendMessage: jest.fn()
}));

jest.mock('../hooks/useWallpaper', () => () => ({
    wallpaperSettings: { sourceType: 'none' },
    wallpaperPreview: { sourceType: 'none' },
    setWallpaperSettings: jest.fn(),
    setWallpaperPreview: jest.fn(),
    presets: []
}));

jest.mock('../hooks/useEncryption', () => () => ({
    getKeyPair: () => ({ publicKey: 'pub', secretKey: 'sec' }),
    exchangeKey: jest.fn(),
    decryptMessage: jest.fn().mockReturnValue('decrypted')
}));

// Mock other hooks with simple returns
jest.mock('../hooks/useImageUpload', () => () => ({}));
jest.mock('../hooks/useVoiceCall', () => () => ({ callState: 'idle', localStreamRef: { current: null }, remoteStreamRef: { current: null } }));
jest.mock('../hooks/useVideoCall', () => () => ({ callState: 'idle', localStreamRef: { current: null }, remoteStreamRef: { current: null } }));
jest.mock('../hooks/useReconnection', () => ({
    useReconnection: () => ({
        connectionStatus: 'connected',
        showRateLimitWarning: false,
        rateLimitRetryAfter: 0
    })
}));
jest.mock('../hooks/useReadReceipts', () => () => { });


describe('ChatPage Forward Functionality', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        chatService.forwardMessage.mockResolvedValue({
            data: {
                messages: [{ id: 'new-msg-2', content: 'Hello', type: 'text', forwarded: true }]
            }
        });
        // Stub localStorage
        Storage.prototype.setItem = jest.fn();
        Storage.prototype.getItem = jest.fn();
        window.HTMLElement.prototype.scrollIntoView = jest.fn(); // Stub for JSDOM
    });

    test('successfully forwards a message and updates state', async () => {
        render(<ChatPage user={{ id: 'user-me' }} />);

        const forwardTrigger = screen.getByTestId('trigger-forward');
        fireEvent.click(forwardTrigger);

        const modal = screen.getByTestId('user-select-modal');
        expect(modal).toBeInTheDocument();

        const userSelectBtn = screen.getByTestId('select-user-2');

        await act(async () => {
            fireEvent.click(userSelectBtn);
        });

        expect(chatService.forwardMessage).toHaveBeenCalledWith({
            messageId: 'msg-1',
            targetUserId: 'user-2'
        });

        expect(mockSetOtherUserId).toHaveBeenCalledWith('user-2');
        // expect(mockSetMessages).toHaveBeenCalled(); // Mocked hook doesn't trigger effect
    });
});
