"use client";

import { useEffect, useRef, useState, FormEvent, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Client, IMessage } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useAuth } from "@/lib/auth-context";
import { getConversation, getConversations, getOnlineUsers } from "@/lib/api";
import { Message, ConversationDTO, StatusUpdate, PresenceEvent } from "@/lib/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8080/ws";

export default function ChatPage() {
  const { token, username, logout } = useAuth();
  const router = useRouter();
  const [recipient, setRecipient] = useState("");
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const clientRef = useRef<Client | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChatRef = useRef<string | null>(null);

  // Keep activeChatRef in sync
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    // Load existing conversations on login
    getConversations(token).then((res) => {
      setConversations(res.content);
    }).catch(() => {});
    // Load online users
    getOnlineUsers(token).then((res) => {
      setOnlineUsers(new Set(res.onlineUsers));
    }).catch(() => {});
  }, [token, router]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // WebSocket connection
  useEffect(() => {
    if (!token || !username) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      connectHeaders: { Authorization: `Bearer ${token}` },
      onConnect: () => {
        // Subscribe to private messages
        client.subscribe("/user/queue/messages", (msg: IMessage) => {
          const message: Message = JSON.parse(msg.body);
          setMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) return prev;
            return [...prev, message];
          });

          // Auto-mark as delivered if message is from someone else
          if (message.sender !== username && message.status === "SENT") {
            client.publish({
              destination: "/app/chat.delivered",
              body: JSON.stringify({ messageId: message.id }),
            });
          }

          // Update conversation list
          const otherUser =
            message.sender === username ? message.recipient : message.sender;
          setConversations((prev) => {
            const exists = prev.find((c) => c.partner === otherUser);
            if (exists) {
              return prev
                .map((c) =>
                  c.partner === otherUser
                    ? { ...c, lastMessageAt: message.sentAt }
                    : c
                )
                .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
            }
            return [
              { partner: otherUser, lastMessageAt: message.sentAt },
              ...prev,
            ];
          });
        });

        // Subscribe to delivery/seen status updates
        client.subscribe("/user/queue/status-updates", (msg: IMessage) => {
          const update: StatusUpdate = JSON.parse(msg.body);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === update.messageId
                ? {
                    ...m,
                    status: update.status,
                    deliveredAt: update.deliveredAt || m.deliveredAt,
                    seenAt: update.seenAt || m.seenAt,
                  }
                : m
            )
          );
        });

        // Subscribe to errors
        client.subscribe("/user/queue/errors", (msg: IMessage) => {
          const err = JSON.parse(msg.body);
          setError(err.error || "An error occurred");
          setTimeout(() => setError(""), 5000);
        });

        // Subscribe to status updates
        client.subscribe("/topic/status", (msg: IMessage) => {
          setStatus((prev) => [...prev.slice(-49), msg.body]);
        });

        // Subscribe to presence events
        client.subscribe("/topic/presence", (msg: IMessage) => {
          const event: PresenceEvent = JSON.parse(msg.body);
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            if (event.online) {
              next.add(event.username);
            } else {
              next.delete(event.username);
            }
            return next;
          });
        });

        // Announce join
        client.publish({ destination: "/app/chat.join" });
      },
      onStompError: (frame) => {
        setError(`Connection error: ${frame.headers.message}`);
      },
      reconnectDelay: 5000,
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
    };
  }, [token, username]);

  async function startChat(user: string) {
    if (!token || !user.trim()) return;
    const trimmed = user.trim();
    setActiveChat(trimmed);
    setDraft("");
    setError("");

    // Add to conversations if not already present
    setConversations((prev) => {
      if (prev.some((c) => c.partner === trimmed)) return prev;
      return [{ partner: trimmed, lastMessageAt: new Date().toISOString() }, ...prev];
    });

    try {
      const history = await getConversation(token, trimmed);
      setMessages(history);

      // Mark unread messages from the other user as seen
      const client = clientRef.current;
      if (client?.connected) {
        history.forEach((msg) => {
          if (msg.sender === trimmed && msg.status !== "SEEN") {
            client.publish({
              destination: "/app/chat.seen",
              body: JSON.stringify({ messageId: msg.id }),
            });
          }
        });
      }
    } catch {
      setMessages([]);
    }
  }

  function handleStartChat(e: FormEvent) {
    e.preventDefault();
    if (recipient.trim()) {
      startChat(recipient.trim());
      setRecipient("");
    }
  }

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !activeChat || !clientRef.current?.connected) return;

    clientRef.current.publish({
      destination: "/app/chat.send",
      body: JSON.stringify({ recipient: activeChat, content: draft.trim() }),
    });

    setDraft("");
  }

  function handleLogout() {
    clientRef.current?.deactivate();
    logout();
    router.push("/login");
  }

  const filteredMessages = messages.filter(
    (m) =>
      (m.sender === username && m.recipient === activeChat) ||
      (m.sender === activeChat && m.recipient === username)
  );

  if (!token || !username) return null;

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950">
      {/* Sidebar */}
      <div className="w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                {username[0].toUpperCase()}
              </div>
              <span className="font-semibold text-gray-900 dark:text-white text-sm">
                {username}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-red-500 transition cursor-pointer"
            >
              Logout
            </button>
          </div>

          {/* New chat input */}
          <form onSubmit={handleStartChat} className="flex gap-2">
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Start chat with..."
              className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition cursor-pointer"
            >
              Chat
            </button>
          </form>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">
              No conversations yet. Start chatting!
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.partner}
                onClick={() => startChat(conv.partner)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition cursor-pointer ${
                  activeChat === conv.partner
                    ? "bg-indigo-50 dark:bg-indigo-900/20 border-r-2 border-indigo-600"
                    : ""
                }`}
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 font-semibold">
                    {conv.partner[0].toUpperCase()}
                  </div>
                  {onlineUsers.has(conv.partner) && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white text-sm">
                    {conv.partner}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {new Date(conv.lastMessageAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Status feed */}
        {status.length > 0 && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-800 max-h-24 overflow-y-auto">
            <div className="text-xs text-gray-400 mb-1 font-medium">Activity</div>
            {status.slice(-3).map((s, i) => (
              <div key={i} className="text-xs text-gray-500 dark:text-gray-400">
                {s}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {!activeChat ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-800 mb-4">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                Your messages
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Select a conversation or start a new one
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                  {activeChat[0].toUpperCase()}
                </div>
                {onlineUsers.has(activeChat) && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                )}
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  {activeChat}
                </h2>
                <p className={`text-xs ${onlineUsers.has(activeChat) ? "text-green-500" : "text-gray-400"}`}>
                  {onlineUsers.has(activeChat) ? "Online" : "Offline"}
                </p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mx-6 mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {filteredMessages.length === 0 && (
                <div className="text-center text-gray-400 text-sm mt-10">
                  No messages yet. Say hello!
                </div>
              )}
              {filteredMessages.map((msg) => {
                const isOwn = msg.sender === username;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${
                        isOwn
                          ? "bg-indigo-600 text-white rounded-br-md"
                          : "bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-700"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                        <p
                          className={`text-[10px] ${
                            isOwn
                              ? "text-indigo-200"
                              : "text-gray-400 dark:text-gray-500"
                          }`}
                        >
                          {new Date(msg.sentAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {isOwn && (
                          <span
                            className="inline-flex items-center ml-0.5"
                            title={
                              msg.status === "SEEN" && msg.seenAt
                                ? `Seen at ${new Date(msg.seenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                : msg.status === "DELIVERED" && msg.deliveredAt
                                ? `Delivered at ${new Date(msg.deliveredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                : "Sent"
                            }
                          >
                            {msg.status === "SENT" && (
                              <svg width="16" height="11" viewBox="0 0 16 11">
                                <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L6.044 6.58 3.614 3.776a.493.493 0 0 0-.381-.178.457.457 0 0 0-.304.102.505.505 0 0 0-.07.686l2.736 3.16a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L11.14 1.34a.505.505 0 0 0-.07-.686Z" fill="rgba(255,255,255,0.5)"/>
                              </svg>
                            )}
                            {msg.status === "DELIVERED" && (
                              <svg width="16" height="11" viewBox="0 0 16 11">
                                <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L6.044 6.58 3.614 3.776a.493.493 0 0 0-.381-.178.457.457 0 0 0-.304.102.505.505 0 0 0-.07.686l2.736 3.16a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L11.14 1.34a.505.505 0 0 0-.07-.686Z" fill="rgba(255,255,255,0.8)"/>
                                <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L10.044 6.58 9.2 5.612l-.543.627 1.736 2.01a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L15.14 1.34a.505.505 0 0 0-.07-.686Z" fill="rgba(255,255,255,0.8)"/>
                              </svg>
                            )}
                            {msg.status === "SEEN" && (
                              <svg width="16" height="11" viewBox="0 0 16 11">
                                <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L6.044 6.58 3.614 3.776a.493.493 0 0 0-.381-.178.457.457 0 0 0-.304.102.505.505 0 0 0-.07.686l2.736 3.16a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L11.14 1.34a.505.505 0 0 0-.07-.686Z" fill="#FBBF24"/>
                                <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L10.044 6.58 9.2 5.612l-.543.627 1.736 2.01a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L15.14 1.34a.505.505 0 0 0-.07-.686Z" fill="#FBBF24"/>
                              </svg>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
              <form onSubmit={handleSend} className="flex gap-3">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl font-medium transition cursor-pointer disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
