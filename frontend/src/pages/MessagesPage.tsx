import { useEffect, useState } from 'react';
import axios from 'axios';
import './MessagesPage.css';

interface Conversation {
  id: number;
  user_id: number;
  photographer_id: number;
  other_name: string;
  photographer_name: string;
  last_message: string;
  unread_count: number;
  updated_at: string;
}

interface Message {
  id: number;
  sender_id: number;
  content: string;
  read: boolean;
  created_at: string;
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const userId = parseInt(localStorage.getItem('userId') || '0');
  const token = localStorage.getItem('token');

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedConv) {
      loadMessages(selectedConv);
      const interval = setInterval(() => loadMessages(selectedConv), 2000);
      return () => clearInterval(interval);
    }
  }, [selectedConv]);

  const loadConversations = async () => {
    try {
      const res = await axios.get('/api/messages/conversations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConversations(res.data.conversations);
    } catch (err) {
      console.error('Erro carregando conversas', err);
    }
  };

  const loadMessages = async (convId: number) => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/messages/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(res.data.messages);
    } catch (err) {
      console.error('Erro carregando mensagens', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConv) return;

    setSending(true);
    try {
      await axios.post(
        `/api/messages/conversations/${selectedConv}/messages`,
        { content: newMessage },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewMessage('');
      await loadMessages(selectedConv);
      await loadConversations();
    } catch (err) {
      alert('Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const selectedConvData = conversations.find(c => c.id === selectedConv);

  return (
    <div className="messages-container">
      <div className="messages-sidebar">
        <h1>💬 Mensagens</h1>
        <div className="conversations-list">
          {conversations.length === 0 ? (
            <p className="empty-state">Nenhuma conversa ainda</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${selectedConv === conv.id ? 'active' : ''}`}
                onClick={() => setSelectedConv(conv.id)}
              >
                <div className="conv-header">
                  <div className="conv-name">
                    {conv.photographer_id === userId ? conv.other_name : conv.photographer_name}
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="unread-badge">{conv.unread_count}</span>
                  )}
                </div>
                <p className="conv-preview">{conv.last_message || 'Nenhuma mensagem'}</p>
                <span className="conv-time">
                  {new Date(conv.updated_at).toLocaleDateString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="messages-thread">
        {selectedConv ? (
          <>
            <div className="thread-header">
              <h2>
                {selectedConvData?.photographer_id === userId
                  ? selectedConvData?.other_name
                  : selectedConvData?.photographer_name}
              </h2>
            </div>

            <div className="messages-list">
              {loading ? (
                <p className="loading">Carregando...</p>
              ) : messages.length === 0 ? (
                <p className="empty-state">Nenhuma mensagem nesta conversa</p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`message-bubble ${msg.sender_id === userId ? 'sent' : 'received'}`}
                  >
                    <p>{msg.content}</p>
                    <span className="message-time">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="message-input-area">
              <input
                type="text"
                placeholder="Digite sua mensagem..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={sending}
              />
              <button onClick={handleSendMessage} disabled={sending || !newMessage.trim()}>
                {sending ? '⏳' : '📤'}
              </button>
            </div>
          </>
        ) : (
          <div className="empty-thread">
            <p>Selecione uma conversa para começar</p>
          </div>
        )}
      </div>
    </div>
  );
}
