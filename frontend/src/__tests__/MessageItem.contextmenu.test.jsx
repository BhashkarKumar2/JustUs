import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock media loader to avoid network / axios imports during tests
jest.mock('../utils/mediaLoader', () => ({
  loadAuthenticatedMedia: jest.fn().mockResolvedValue('blob:test')
}));

import MessageItem from '../components/chat/messages/MessageItem';

describe('MessageItem context menu', () => {
  test('opens menu when three-dot button is clicked and shows Edit/Delete for own message', () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();

    const message = {
      id: 'msg-1',
      type: 'text',
      content: 'Hello world',
      senderId: 'user-1',
      senderDisplayName: 'User One',
      timestamp: new Date().toISOString(),
      deleted: false
    };

    // Render MessageItem with 'me' equal to senderId so Edit appears
    const { container } = render(<MessageItem me={message.senderId} m={message} onEdit={onEdit} onDelete={onDelete} />);

    // Find the three-dot button by class
    const triggerBtn = container.querySelector('button.signal-icon-button');
    expect(triggerBtn).toBeTruthy();

    // Click the button
    fireEvent.click(triggerBtn);

    // The menu should display Edit and Delete buttons (text)
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText(/Delete/)).toBeInTheDocument();
  });
});
