import React, { useState } from 'react';

export default function ChatInput({ onSend, disabled }){
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if(!text.trim() || disabled) return;
        onSend(text.trim());
        setText('');
      }}
      className="flex items-center space-x-3"
    >
      <textarea
        value={text}
        onChange={e=>setText(e.target.value)}
        className="signal-input w-full resize-none"
        placeholder="Type a message..."
        rows={2}
        disabled={disabled}
        aria-label="Message input"
      />
      <button
        type="submit"
        disabled={!text.trim() || disabled}
        className="signal-button disabled:opacity-50"
        aria-label="Send message"
      >
        Send
      </button>
    </form>
  )
}
