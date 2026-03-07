"use client";

import { useEffect, useRef, useState, FormEvent, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Client, IMessage } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useAuth } from "@/lib/auth-context";
import { getConversation, getConversations, getOnlineUsers, getProfile, uploadAttachment, extractUrls, fetchLinkPreview } from "@/lib/api";
import { Message, StatusUpdate, PresenceEvent, UserProfile, LinkPreview } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8080/ws")
  .replace(/^wss:/, "https:")
  .replace(/^ws:/, "http:");

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

interface ConversationItem {
  partner: string;
  lastMessageAt: string;
  lastMessage: string;
  unreadCount: number;
}

const AVATAR_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#6366F1", "#14B8A6",
  "#F97316", "#06B6D4",
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60_000);
  const hrs = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(dateStr).toLocaleDateString([], { weekday: "long" });
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function ChatPage() {
  const { token, username, logout } = useAuth();
  const router = useRouter();

  /* --- state --- */
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatUser, setNewChatUser] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [profilePictures, setProfilePictures] = useState<Record<string, string | null>>({});
  const [currentUserProfilePicture, setCurrentUserProfilePicture] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileModalData, setProfileModalData] = useState<UserProfile | null>(null);
  const [profileModalLoading, setProfileModalLoading] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [chatAttachments, setChatAttachments] = useState<Message[]>([]);
  const [linkPreviews, setLinkPreviews] = useState<Record<number, LinkPreview>>({});

  const clientRef = useRef<Client | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const activeChatRef = useRef<string | null>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  /* --- profile pictures --- */

  const fetchProfilePicture = useCallback(
    (user: string) => {
      if (!token) return;
      setProfilePictures((prev) => {
        if (user in prev) return prev;
        getProfile(token, user)
          .then((p) =>
            setProfilePictures((curr) => ({ ...curr, [user]: p.profilePictureUrl }))
          )
          .catch(() =>
            setProfilePictures((curr) => ({ ...curr, [user]: null }))
          );
        return { ...prev, [user]: null };
      });
    },
    [token]
  );

  /* --- bootstrap --- */

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }
    getConversations(token)
      .then((r) => {
        const convos = r.content.map((c) => ({ ...c, lastMessage: "", unreadCount: 0 }));
        setConversations(convos);
        convos.forEach((c) => fetchProfilePicture(c.partner));
      })
      .catch(() => {});
    getOnlineUsers(token)
      .then((r) => setOnlineUsers(new Set(r.onlineUsers)))
      .catch(() => {});
    // Fetch current user's profile picture
    if (username) {
      getProfile(token)
        .then((profile) => setCurrentUserProfilePicture(profile.profilePictureUrl))
        .catch(() => setCurrentUserProfilePicture(null));
    }
  }, [token, router, fetchProfilePicture, username]);

  const scrollBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  useEffect(() => {
    scrollBottom();
  }, [messages, scrollBottom]);

  /* --- WebSocket --- */

  useEffect(() => {
    if (!token || !username) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      connectHeaders: { Authorization: `Bearer ${token}` },
      onConnect: () => {
        /* private messages */
        client.subscribe("/user/queue/messages", (msg: IMessage) => {
          const m: Message = JSON.parse(msg.body);
          setMessages((prev) =>
            prev.some((p) => p.id === m.id) ? prev : [...prev, m]
          );

          const fromOther = m.sender !== username;
          if (fromOther && m.status === "SENT") {
            client.publish({
              destination: "/app/chat.delivered",
              body: JSON.stringify({ messageId: m.id }),
            });
          }

          const other = m.sender === username ? m.recipient : m.sender;
          const isActive = activeChatRef.current === other;

          fetchProfilePicture(other);

          if (fromOther && isActive) {
            client.publish({
              destination: "/app/chat.seen",
              body: JSON.stringify({ messageId: m.id }),
            });
          }

          setConversations((prev) => {
            const existing = prev.find((c) => c.partner === other);
            const item: ConversationItem = existing
              ? {
                  ...existing,
                  lastMessageAt: m.sentAt,
                  lastMessage: m.content,
                  unreadCount:
                    fromOther && !isActive
                      ? existing.unreadCount + 1
                      : existing.unreadCount,
                }
              : {
                  partner: other,
                  lastMessageAt: m.sentAt,
                  lastMessage: m.content,
                  unreadCount: fromOther && !isActive ? 1 : 0,
                };
            return [item, ...prev.filter((c) => c.partner !== other)];
          });
        });

        /* status updates */
        client.subscribe("/user/queue/status-updates", (msg: IMessage) => {
          const u: StatusUpdate = JSON.parse(msg.body);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === u.messageId
                ? {
                    ...m,
                    status: u.status,
                    deliveredAt: u.deliveredAt || m.deliveredAt,
                    seenAt: u.seenAt || m.seenAt,
                  }
                : m
            )
          );
        });

        /* errors */
        client.subscribe("/user/queue/errors", (msg: IMessage) => {
          const e = JSON.parse(msg.body);
          setError(e.error || "An error occurred");
          setTimeout(() => setError(""), 5000);
        });

        /* presence */
        client.subscribe("/topic/presence", (msg: IMessage) => {
          const ev: PresenceEvent = JSON.parse(msg.body);
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            if (ev.online) {
              next.add(ev.username);
            } else {
              next.delete(ev.username);
            }
            return next;
          });
        });

        client.publish({ destination: "/app/chat.join" });
      },
      onStompError: (f) => setError(`Connection error: ${f.headers.message}`),
      reconnectDelay: 5000,
    });

    client.activate();
    clientRef.current = client;
    return () => {
      client.deactivate();
    };
  }, [token, username, fetchProfilePicture]);

  /* --- actions --- */

  async function openChat(user: string) {
    if (!token || !user.trim()) return;
    const u = user.trim();
    setActiveChat(u);
    setDraft("");
    setError("");
    setSidebarOpen(false);

    fetchProfilePicture(u);

    setConversations((prev) => {
      if (prev.some((c) => c.partner === u))
        return prev.map((c) =>
          c.partner === u ? { ...c, unreadCount: 0 } : c
        );
      return [
        { partner: u, lastMessageAt: new Date().toISOString(), lastMessage: "", unreadCount: 0 },
        ...prev,
      ];
    });

    try {
      const history = await getConversation(token, u);
      setMessages(history);
      const cl = clientRef.current;
      if (cl?.connected) {
        history.forEach((m) => {
          if (m.sender === u && m.status !== "SEEN") {
            cl.publish({
              destination: "/app/chat.seen",
              body: JSON.stringify({ messageId: m.id }),
            });
          }
        });
      }
    } catch {
      setMessages([]);
    }
  }

  function handleNewChat(e: FormEvent) {
    e.preventDefault();
    if (!newChatUser.trim()) return;
    openChat(newChatUser.trim());
    setNewChatUser("");
    setShowNewChat(false);
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if ((!draft.trim() && !attachmentFile) || !activeChat || !clientRef.current?.connected) return;

    let attachmentUrl: string | undefined;
    let attachmentName: string | undefined;
    let attachmentType: string | undefined;

    if (attachmentFile && token) {
      setAttachmentUploading(true);
      try {
        const result = await uploadAttachment(token, attachmentFile);
        attachmentUrl = result.attachmentUrl;
        attachmentName = result.attachmentName;
        attachmentType = result.attachmentType;
      } catch {
        setError("Failed to upload attachment");
        setTimeout(() => setError(""), 5000);
        setAttachmentUploading(false);
        return;
      }
      setAttachmentUploading(false);
    }

    const payload: Record<string, string> = {
      recipient: activeChat,
      content: draft.trim() || (attachmentName ?? "Attachment"),
    };
    if (attachmentUrl) payload.attachmentUrl = attachmentUrl;
    if (attachmentName) payload.attachmentName = attachmentName;
    if (attachmentType) payload.attachmentType = attachmentType;

    clientRef.current.publish({
      destination: "/app/chat.send",
      body: JSON.stringify(payload),
    });
    setDraft("");
    setAttachmentFile(null);
    
    // Check for URLs in the message and fetch link previews
    if (!attachmentUrl && draft.trim()) {
      const urls = extractUrls(draft.trim());
      if (urls.length > 0) {
        // Fetch preview for the first URL found
        fetchLinkPreview(urls[0]).then(preview => {
          if (preview) {
            // Store preview with a temporary ID (will be replaced when message is received)
            const tempId = Date.now();
            setLinkPreviews(prev => ({ ...prev, [tempId]: { url: urls[0], ...preview } }));
          }
        });
      }
    }
    
    // Keep input focused on mobile to maintain keyboard
    if (messageInputRef.current) {
      // Use requestAnimationFrame to ensure the focus happens after React updates
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    }
  }

  function handleAttachmentSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setError("File size must be less than 10MB");
      setTimeout(() => setError(""), 5000);
      return;
    }
    setAttachmentFile(file);
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }

  function handleLogout() {
    clientRef.current?.deactivate();
    logout();
    router.push("/login");
  }

  async function openProfileModal(username: string) {
    if (!token) return;
    setShowProfileModal(true);
    setProfileModalLoading(true);
    setProfileModalData(null);
    
    try {
      const profile = await getProfile(token, username);
      setProfileModalData(profile);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setProfileModalLoading(false);
    }
  }

  function openAttachmentsModal() {
    if (!activeChat) return;
    const attachments = chatMessages.filter(msg => msg.attachmentUrl);
    setChatAttachments(attachments);
    setShowAttachmentsModal(true);
    setShowChatMenu(false);
  }

  // Close chat menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target as Node)) {
        setShowChatMenu(false);
      }
    }

    if (showChatMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showChatMenu]);

  function openAttachmentsModal() {
    if (!activeChat) return;
    const attachments = chatMessages.filter(msg => msg.attachmentUrl);
    setChatAttachments(attachments);
    setShowAttachmentsModal(true);
    setShowChatMenu(false);
  }

  /* --- derived --- */

  const chatMessages = messages.filter(
    (m) =>
      (m.sender === username && m.recipient === activeChat) ||
      (m.sender === activeChat && m.recipient === username)
  );

  const visibleConvos = conversations.filter((c) =>
    c.partner.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Function to render text with clickable links
  function renderMessageContent(content: string) {
    if (!content) return null;
    
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    const parts = content.split(urlRegex);
    const urls = content.match(urlRegex) || [];
    
    return (
      <span>
        {parts.map((part, index) => {
          const urlIndex = Math.floor(index / 3);
          if (index % 3 === 0) {
            return part;
          } else if (urls[urlIndex]) {
            return (
              <a
                key={index}
                href={urls[urlIndex]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline break-all"
              >
                {urls[urlIndex]}
              </a>
            );
          }
          return part;
        })}
      </span>
    );
  }

  // Function to get and display link preview for a message
  function getLinkPreviewForMessage(msg: Message) {
    if (!msg.content || msg.attachmentUrl) return null;
    
    const urls = extractUrls(msg.content);
    if (urls.length === 0) return null;
    
    const url = urls[0];
    const preview = linkPreviews[msg.id];
    
    if (!preview) {
      // Fetch preview if not already cached
      fetchLinkPreview(url).then(data => {
        if (data) {
          setLinkPreviews(prev => ({ ...prev, [msg.id]: { url, ...data } }));
        }
      });
      return null;
    }
    
    return preview;
  }

  if (!token || !username) return null;

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-screen bg-white overflow-hidden" style={{ height: '100vh', minHeight: '-webkit-fill-available' }}>
      {/* -------- mobile overlay -------- */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ================================================================ */}
      {/*  SIDEBAR                                                        */}
      {/* ================================================================ */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-[340px] bg-white border-r border-gray-200
          flex flex-col transform transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0 md:z-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{ height: '100vh', minHeight: '-webkit-fill-available' }}
      >
        {/* header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {/* mobile close */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1 -ml-1 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
            </div>

            <button
              onClick={() => { setShowNewChat(!showNewChat); setNewChatUser(""); }}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition cursor-pointer"
              title="New conversation"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
          </div>

          {/* search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-100 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          {/* new chat form */}
          {showNewChat && (
            <form onSubmit={handleNewChat} className="mt-3">
              <input
                type="text"
                value={newChatUser}
                onChange={(e) => setNewChatUser(e.target.value)}
                placeholder="Enter username to chat..."
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl border border-blue-300 bg-blue-50 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </form>
          )}
        </div>

        {/* conversations */}
        <div className="flex-1 overflow-y-auto">
          {visibleConvos.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              {searchQuery ? "No conversations found" : "No conversations yet"}
            </div>
          ) : (
            visibleConvos.map((conv) => (
              <button
                key={conv.partner}
                onClick={() => openChat(conv.partner)}
                className={`w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition cursor-pointer ${
                  activeChat === conv.partner ? "bg-blue-50" : ""
                }`}
              >
                {/* avatar */}
                <div className="relative flex-shrink-0">
                  {profilePictures[conv.partner] ? (
                    <Image
                      src={`${API_BASE}${profilePictures[conv.partner]}`}
                      alt={conv.partner}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                      style={{ backgroundColor: avatarColor(conv.partner) }}
                    >
                      {conv.partner[0].toUpperCase()}
                    </div>
                  )}
                  {onlineUsers.has(conv.partner) && (
                    <div className="absolute bottom-0 left-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                  )}
                </div>

                {/* info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-900 truncate">
                      {conv.partner}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-xs text-gray-400">
                        {relativeTime(conv.lastMessageAt)}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-blue-500 text-white text-[11px] font-semibold px-1.5">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {conv.lastMessage && (
                    <p className="text-sm text-gray-500 truncate mt-0.5">
                      {conv.lastMessage}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* user footer */}
        <div className="px-5 py-3 border-t border-gray-200 flex items-center gap-3">
          <button
            onClick={() => router.push("/profile")}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-blue-400 transition overflow-hidden"
            style={currentUserProfilePicture ? {} : { backgroundColor: avatarColor(username) }}
            title="View profile"
          >
            {currentUserProfilePicture ? (
              <Image
                src={`${API_BASE}${currentUserProfilePicture}`}
                alt={username}
                width={36}
                height={36}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              username[0].toUpperCase()
            )}
          </button>
          <button
            onClick={() => router.push("/profile")}
            className="flex-1 text-left cursor-pointer"
            title="View profile"
          >
            <span className="text-sm font-medium text-gray-900 truncate block">
              {username}
            </span>
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-red-500 transition cursor-pointer"
            title="Logout"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ================================================================ */}
      {/*  CHAT AREA                                                      */}
      {/* ================================================================ */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        {!activeChat ? (
          /* ---------- empty state ---------- */
          <div className="flex-1 flex items-center justify-center relative">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden absolute top-4 left-4 p-2 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="text-center px-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-5">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                Select a conversation
              </h2>
              <p className="text-gray-500 text-sm">
                Choose from your existing conversations or start a new one
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ---------- chat header ---------- */}
            <div className="px-4 md:px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-shrink-0">
              {/* mobile hamburger */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-1 -ml-1 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* avatar */}
              <button 
                onClick={() => openProfileModal(activeChat)}
                className="relative flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
              >
                {profilePictures[activeChat] ? (
                  <Image
                    src={`${API_BASE}${profilePictures[activeChat]}`}
                    alt={activeChat}
                    width={40}
                    height={40}
                    className="w-10 h-10 rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: avatarColor(activeChat) }}
                  >
                    {activeChat[0].toUpperCase()}
                  </div>
                )}
                {onlineUsers.has(activeChat) && (
                  <div className="absolute bottom-0 left-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                )}
              </button>

              {/* name / status */}
              <button 
                onClick={() => openProfileModal(activeChat)}
                className="flex-1 min-w-0 text-left cursor-pointer hover:opacity-80 transition-opacity"
              >
                <h2 className="font-semibold text-gray-900 text-sm leading-tight">
                  {activeChat}
                </h2>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  {onlineUsers.has(activeChat) && (
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  )}
                  {onlineUsers.has(activeChat) ? "Active now" : "Offline"}
                </p>
              </button>

              {/* action icons */}
              <div className="flex items-center gap-0.5">
                <button className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition cursor-pointer" title="Voice call">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </button>
                <button className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition cursor-pointer" title="Video call">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                
                {/* More options menu */}
                <div className="relative" ref={chatMenuRef}>
                  <button 
                    onClick={() => setShowChatMenu(!showChatMenu)}
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition cursor-pointer" 
                    title="More options"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {showChatMenu && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-40">
                      <button
                        onClick={() => {
                          openProfileModal(activeChat);
                          setShowChatMenu(false);
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700 transition"
                      >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <div>
                          <div className="font-medium text-sm">View profile</div>
                          <div className="text-xs text-gray-500">See {activeChat}'s info</div>
                        </div>
                      </button>
                      
                      <button
                        onClick={openAttachmentsModal}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700 transition"
                      >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <div>
                          <div className="font-medium text-sm">Media & files</div>
                          <div className="text-xs text-gray-500">{chatMessages.filter(m => m.attachmentUrl).length} items</div>
                        </div>
                      </button>
                      
                      <div className="border-t border-gray-100 my-2"></div>
                      
                      <button
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700 transition"
                      >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <div>
                          <div className="font-medium text-sm">Report conversation</div>
                          <div className="text-xs text-gray-500">Report this chat</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ---------- error ---------- */}
            {error && (
              <div className="mx-4 md:mx-6 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* ---------- messages ---------- */}
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4 min-h-0">
              {chatMessages.length === 0 && (
                <div className="text-center text-gray-400 text-sm mt-10">
                  No messages yet. Say hello!
                </div>
              )}

              {chatMessages.map((msg) => {
                const own = msg.sender === username;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${own ? "justify-end" : "justify-start"}`}
                  >
                    <div className="max-w-[75%] md:max-w-[60%]">
                      <div
                        className={`px-4 pt-3 pb-2 rounded-2xl ${
                          own
                            ? "bg-blue-500 text-white rounded-br-md"
                            : "bg-gray-100 text-gray-900 rounded-bl-md"
                        }`}
                      >
                        {/* Attachment */}
                        {msg.attachmentUrl && (
                          <div className="mb-2">
                            {msg.attachmentType?.startsWith("image/") ? (
                              <Image
                                src={`${API_BASE}${msg.attachmentUrl}`}
                                alt={msg.attachmentName || "Image"}
                                width={400}
                                height={240}
                                className="max-w-full rounded-lg max-h-60 object-cover cursor-pointer"
                                onClick={() => window.open(`${API_BASE}${msg.attachmentUrl}`, "_blank")}
                                unoptimized
                              />
                            ) : (
                              <a
                                href={`${API_BASE}${msg.attachmentUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 p-2.5 rounded-lg border ${
                                  own
                                    ? "border-blue-400 hover:bg-blue-600"
                                    : "border-gray-300 hover:bg-gray-200"
                                } transition`}
                              >
                                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className="text-sm truncate">{msg.attachmentName || "File"}</span>
                              </a>
                            )}
                          </div>
                        )}

                        {/* Content text (hide if it's just the auto-filled attachment name) */}
                        {msg.content && !(msg.attachmentUrl && msg.content === msg.attachmentName) && (
                          <div className="text-sm whitespace-pre-wrap break-words">
                            {renderMessageContent(msg.content)}
                          </div>
                        )}

                        {/* Link Preview */}
                        {(() => {
                          const preview = getLinkPreviewForMessage(msg);
                          if (!preview) return null;
                          
                          return (
                            <div className={`mt-2 border rounded-lg overflow-hidden relative ${own ? 'border-blue-400 bg-white/10' : 'border-gray-200 bg-white'} max-w-sm cursor-pointer hover:opacity-90 transition-opacity`}>
                              {preview.image && (
                                <div className="aspect-video w-full overflow-hidden relative">
                                  <Image
                                    src={preview.image}
                                    alt={preview.title || 'Link preview'}
                                    width={300}
                                    height={200}
                                    className="w-full h-full object-cover"
                                    unoptimized
                                  />
                                  
                                  {/* Video Play Button Overlay */}
                                  {preview.isVideo && (
                                    <>
                                      {/* Play Button */}
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-16 h-16 bg-black/60 rounded-full flex items-center justify-center backdrop-blur-sm">
                                          <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z"/>
                                          </svg>
                                        </div>
                                      </div>
                                      
                                      {/* Duration Badge */}
                                      {preview.duration && (
                                        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded font-medium">
                                          {preview.duration}
                                        </div>
                                      )}
                                      
                                      {/* Video Icon Badge */}
                                      <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-1 rounded font-medium flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
                                        </svg>
                                        VIDEO
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                              <div className="p-3">
                                {preview.domain && (
                                  <p className={`text-xs ${own ? 'text-blue-200' : 'text-gray-500'} mb-1 uppercase tracking-wide font-medium flex items-center gap-1`}>
                                    {preview.isVideo && (
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
                                      </svg>
                                    )}
                                    {preview.domain}
                                  </p>
                                )}
                                {preview.title && (
                                  <h4 className={`font-medium text-sm ${own ? 'text-white' : 'text-gray-900'} mb-1 truncate`}>
                                    {preview.title}
                                  </h4>
                                )}
                                {preview.description && (
                                  <p className={`text-xs ${own ? 'text-blue-100' : 'text-gray-600'} truncate`}>
                                    {preview.description}
                                  </p>
                                )}
                              </div>
                              <a
                                href={preview.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute inset-0"
                                aria-label={`Open ${preview.title || preview.url}`}
                              />
                            </div>
                          );
                        })()}

                        {/* time + status inside bubble */}
                        <div className={`flex items-center gap-1 mt-1.5 ${own ? "justify-end" : ""}`}>
                          <span className={`text-[11px] ${own ? "text-blue-100" : "text-gray-400"}`}>
                            {new Date(msg.sentAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>

                          {own && (
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
                                <svg width="14" height="10" viewBox="0 0 16 11">
                                  <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L6.044 6.58 3.614 3.776a.493.493 0 0 0-.381-.178.457.457 0 0 0-.304.102.505.505 0 0 0-.07.686l2.736 3.16a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L11.14 1.34a.505.505 0 0 0-.07-.686Z" fill="rgba(255,255,255,0.6)" />
                                </svg>
                              )}
                              {msg.status === "DELIVERED" && (
                                <svg width="14" height="10" viewBox="0 0 16 11">
                                  <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L6.044 6.58 3.614 3.776a.493.493 0 0 0-.381-.178.457.457 0 0 0-.304.102.505.505 0 0 0-.07.686l2.736 3.16a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L11.14 1.34a.505.505 0 0 0-.07-.686Z" fill="rgba(255,255,255,0.8)" />
                                  <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L10.044 6.58 9.2 5.612l-.543.627 1.736 2.01a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L15.14 1.34a.505.505 0 0 0-.07-.686Z" fill="rgba(255,255,255,0.8)" />
                                </svg>
                              )}
                              {msg.status === "SEEN" && (
                                <svg width="14" height="10" viewBox="0 0 16 11">
                                  <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L6.044 6.58 3.614 3.776a.493.493 0 0 0-.381-.178.457.457 0 0 0-.304.102.505.505 0 0 0-.07.686l2.736 3.16a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L11.14 1.34a.505.505 0 0 0-.07-.686Z" fill="#ffffff" />
                                  <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L10.044 6.58 9.2 5.612l-.543.627 1.736 2.01a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L15.14 1.34a.505.505 0 0 0-.07-.686Z" fill="#ffffff" />
                                </svg>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* ---------- input ---------- */}
            <div className="px-4 md:px-6 py-3 border-t border-gray-200 bg-white flex-shrink-0">
              <form onSubmit={handleSend} className="flex items-center gap-3">
                {/* attachment */}
                <input
                  ref={attachmentInputRef}
                  type="file"
                  onChange={handleAttachmentSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={attachmentUploading}
                  className="p-2 text-gray-400 hover:text-gray-600 transition flex-shrink-0 cursor-pointer disabled:opacity-50"
                  title="Attach file"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>

                {/* input + emoji */}
                <div className="flex-1 relative">
                  <input
                    ref={messageInputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message..."
                    className="w-full px-4 py-2.5 pr-10 rounded-full border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="sentences"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition cursor-pointer"
                    title="Emoji"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>

                {/* send */}
                <button
                  type="submit"
                  disabled={(!draft.trim() && !attachmentFile) || attachmentUploading}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 text-white disabled:text-gray-400 transition cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>

              {/* Attachment preview */}
              {attachmentFile && (
                <div className="mt-2 flex items-center gap-2 px-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-sm text-gray-700 max-w-xs">
                    <svg className="w-4 h-4 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="truncate">{attachmentFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachmentFile(null)}
                      className="p-0.5 text-gray-400 hover:text-gray-600 transition cursor-pointer flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {attachmentUploading && (
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Attachments Modal */}
      {showAttachmentsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xl font-bold text-gray-900">Media & Files</h3>
              <button
                onClick={() => setShowAttachmentsModal(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {chatAttachments.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">No shared media</h4>
                  <p className="text-gray-500">Files and images shared in this conversation will appear here</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {chatAttachments.map((msg) => (
                    <div key={msg.id} className="bg-gray-50 rounded-lg overflow-hidden hover:bg-gray-100 transition">
                      {msg.attachmentType?.startsWith("image/") ? (
                        <div className="aspect-square relative">
                          <Image
                            src={`${API_BASE}${msg.attachmentUrl}`}
                            alt={msg.attachmentName || "Image"}
                            fill
                            className="object-cover cursor-pointer"
                            onClick={() => window.open(`${API_BASE}${msg.attachmentUrl}`, "_blank")}
                            unoptimized
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                            <p className="text-white text-xs truncate font-medium">
                              {msg.attachmentName || "Image"}
                            </p>
                            <p className="text-white/80 text-xs">
                              {new Date(msg.sentAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <a
                          href={`${API_BASE}${msg.attachmentUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-4 hover:bg-gray-100 transition"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {msg.attachmentName || "File"}
                              </p>
                              <p className="text-xs text-gray-500">
                                {new Date(msg.sentAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Profile</h3>
              <button
                onClick={() => setShowProfileModal(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {profileModalLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : profileModalData ? (
                <div className="text-center">
                  {/* Profile Picture */}
                  <div className="mb-6">
                    {profileModalData.profilePictureUrl ? (
                      <Image
                        src={`${API_BASE}${profileModalData.profilePictureUrl}`}
                        alt={profileModalData.username}
                        width={120}
                        height={120}
                        className="w-30 h-30 rounded-full object-cover mx-auto"
                        unoptimized
                      />
                    ) : (
                      <div
                        className="w-30 h-30 rounded-full flex items-center justify-center text-white text-4xl font-bold mx-auto"
                        style={{ backgroundColor: avatarColor(profileModalData.username) }}
                      >
                        {profileModalData.username[0].toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Profile Info */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-2xl font-bold text-gray-900">
                        {profileModalData.displayName || profileModalData.username}
                      </h4>
                      {profileModalData.displayName && (
                        <p className="text-gray-500 text-sm mt-1">@{profileModalData.username}</p>
                      )}
                    </div>

                    {profileModalData.bio && (
                      <div className="bg-gray-50 rounded-lg p-4 text-left">
                        <h5 className="text-sm font-semibold text-gray-700 mb-2">About</h5>
                        <p className="text-gray-600 text-sm whitespace-pre-wrap">{profileModalData.bio}</p>
                      </div>
                    )}

                    {/* Online Status */}
                    <div className="flex items-center justify-center gap-2 text-sm">
                      {onlineUsers.has(profileModalData.username) ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-green-600 font-medium">Active now</span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-gray-400" />
                          <span className="text-gray-500">Offline</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500">Failed to load profile</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}