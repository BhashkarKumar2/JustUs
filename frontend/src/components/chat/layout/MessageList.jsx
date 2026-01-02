import React from 'react';
import MessageItem from './MessageItem';

export default function MessageList({ messages = [], me, onEdit, onDelete }){
  return (
    <div>
      {messages.map(m=> (
        <MessageItem 
          key={m.id} 
          m={m} 
          me={me}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
