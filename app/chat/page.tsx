"use client";

import { useEffect, useRef, useState, FormEvent, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Client, IMessage } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useAuth } from "@/lib/client/auth-context";
import { getConversation, getConversations, getOnlineUsers, getProfile, uploadAttachment, extractUrls, fetchLinkPreview } from "@/lib/api";
import { Message, StatusUpdate, PresenceEvent, UserProfile, LinkPreview } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const WS_URL = (process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8080/ws")
  .replace(/^wss:/, "https:")
  .replace(/^ws:/, "http:");

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

export default function ChatPage() {
  const { token, username, logout, isInitialized } = useAuth();
  const router = useRouter();

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
  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [chatAttachments, setChatAttachments] = useState<Message[]>([]);
  const [linkPreviews, setLinkPreviews] = useState<Record<number, LinkPreview>>({});
  const [msgPage, setMsgPage] = useState(0);
  const [msgHasMore, setMsgHasMore] = useState(false);
  const [msgLoadingMore, setMsgLoadingMore] = useState(false);
  const [chatTab, setChatTab] = useState<"messages" | "media">("messages");
  const [showRightPanel, setShowRightPanel] = useState(true);

  const clientRef = useRef<Client | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const activeChatRef = useRef<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollToBottomOnNextRender = useRef(false);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  const fetchProfilePicture = useCallback(
    (user: string) => {
      if (!token) return;
      setProfilePictures((prev) => {
        if (user in prev) return prev;
        getProfile(token, user)
          .then((p) => setProfilePictures((curr) => ({ ...curr, [user]: p.profilePictureUrl })))
          .catch(() => setProfilePictures((curr) => ({ ...curr, [user]: null })));
        return { ...prev, [user]: null };
      });
    },
    [token]
  );

  useEffect(() => {
    console.log("[ChatPage] Auth state:", { token: token ? `${token.substring(0,20)}...` : null, username, isInitialized, timestamp: new Date().toISOString() });
    if (!isInitialized) {
      console.log("[ChatPage] Auth not initialized yet, waiting...");
      return;
    }
    console.log("[ChatPage] Auth initialized - checking token...");
    if (!token) {
      console.log("[ChatPage] No token found, redirecting to login");
      router.replace("/login");
      return;
    }
    console.log("[ChatPage] Token found, loading conversations...");
    getConversations(token)
      .then((r) => {
        console.log("[ChatPage] ✅ Conversations loaded:", r.content.length);
        const convos = r.content.map((c) => ({ ...c, lastMessage: "", unreadCount: 0 }));
        setConversations(convos);
        convos.forEach((c) => fetchProfilePicture(c.partner));
      })
      .catch((error: any) => {
        console.error("[ChatPage] ❌ Failed to load conversations:", error);
        if (error && error.status === 403) {
          // Token expired/unauthorized — clear auth and send to login
          logout().then(() => router.replace("/login"));
        }
      });
    getOnlineUsers(token).then((r) => setOnlineUsers(new Set(r.onlineUsers))).catch(() => {});
    if (username) {
      getProfile(token)
        .then((p) => setCurrentUserProfilePicture(p.profilePictureUrl))
        .catch(() => setCurrentUserProfilePicture(null));
    }
  }, [token, router, fetchProfilePicture, username, isInitialized]);

  const scrollBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  useEffect(() => {
    if (scrollToBottomOnNextRender.current) {
      scrollToBottomOnNextRender.current = false;
      scrollBottom();
    }
  }, [messages, scrollBottom]);

  useEffect(() => {
    if (!token || !username) {
      console.log("[ChatPage] Waiting for token and username before WebSocket...");
      return;
    }
    console.log("[ChatPage] 🔌 Setting up WebSocket connection...");
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      connectHeaders: { Authorization: `Bearer ${token}` },
      onConnect: () => {
        console.log("[ChatPage] ✅ WebSocket connected");
        client.subscribe("/user/queue/messages", (msg: IMessage) => {
          const m: Message = JSON.parse(msg.body);
          const fromOther = m.sender !== username;
          if (fromOther && m.status === "SENT") {
            client.publish({ destination: "/app/chat.delivered", body: JSON.stringify({ messageId: m.id }) });
          }
          const other = m.sender === username ? m.recipient : m.sender;
          const isActive = activeChatRef.current === other;
          if (isActive) scrollToBottomOnNextRender.current = true;
          setMessages((prev) => prev.some((p) => p.id === m.id) ? prev : [...prev, m]);
          fetchProfilePicture(other);
          if (fromOther && isActive) {
            client.publish({ destination: "/app/chat.seen", body: JSON.stringify({ messageId: m.id }) });
          }
          setConversations((prev) => {
            const existing = prev.find((c) => c.partner === other);
            const item: ConversationItem = existing
              ? { ...existing, lastMessageAt: m.sentAt, lastMessage: m.content, unreadCount: fromOther && !isActive ? existing.unreadCount + 1 : existing.unreadCount }
              : { partner: other, lastMessageAt: m.sentAt, lastMessage: m.content, unreadCount: fromOther && !isActive ? 1 : 0 };
            return [item, ...prev.filter((c) => c.partner !== other)];
          });
        });
        client.subscribe("/user/queue/status-updates", (msg: IMessage) => {
          const u: StatusUpdate = JSON.parse(msg.body);
          setMessages((prev) => prev.map((m) => m.id === u.messageId ? { ...m, status: u.status, deliveredAt: u.deliveredAt || m.deliveredAt, seenAt: u.seenAt || m.seenAt } : m));
        });
        client.subscribe("/user/queue/errors", (msg: IMessage) => {
          const e = JSON.parse(msg.body);
          setError(e.error || "An error occurred");
          setTimeout(() => setError(""), 5000);
        });
        client.subscribe("/topic/presence", (msg: IMessage) => {
          const ev: PresenceEvent = JSON.parse(msg.body);
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            if (ev.online) next.add(ev.username); else next.delete(ev.username);
            return next;
          });
        });
        client.publish({ destination: "/app/chat.join" });
      },
      onStompError: (f) => {
        console.error("[ChatPage] ❌ WebSocket error:", f.headers.message);
        setError(`Connection error: ${f.headers.message}`);
      },
      reconnectDelay: 5000,
    });
    console.log("[ChatPage] activating client...");
    client.activate();
    clientRef.current = client;
    return () => { 
      console.log("[ChatPage] 🔌 WebSocket disconnecting...");
      client.deactivate(); 
    };
  }, [token, username, fetchProfilePicture]);

  async function openChat(user: string) {
    if (!token || !user.trim()) return;
    const u = user.trim();
    setActiveChat(u);
    setDraft("");
    setError("");
    setSidebarOpen(false);
    setMsgPage(0);
    setMsgHasMore(false);
    setChatTab("messages");
    fetchProfilePicture(u);
    setConversations((prev) => {
      if (prev.some((c) => c.partner === u)) return prev.map((c) => c.partner === u ? { ...c, unreadCount: 0 } : c);
      return [{ partner: u, lastMessageAt: new Date().toISOString(), lastMessage: "", unreadCount: 0 }, ...prev];
    });
    try {
      const response = await getConversation(token, u, 0);
      const history = [...response.content].reverse();
      scrollToBottomOnNextRender.current = true;
      setMessages(history);
      setMsgHasMore(!response.last);
      const cl = clientRef.current;
      if (cl?.connected) {
        history.forEach((m) => {
          if (m.sender === u && m.status !== "SEEN") {
            cl.publish({ destination: "/app/chat.seen", body: JSON.stringify({ messageId: m.id }) });
          }
        });
      }
    } catch (error: any) {
      // If unauthorized, logout and redirect
      if (error && error.status === 403) {
        logout().then(() => router.replace("/login"));
        return;
      }
      setMessages([]);
      setMsgHasMore(false);
    }
  }

  function handleNewChat(e: FormEvent) {
    e.preventDefault();
    if (!newChatUser.trim()) return;
    openChat(newChatUser.trim());
    setNewChatUser("");
    setShowNewChat(false);
  }

  async function loadOlderMessages() {
    if (!token || !activeChat || msgLoadingMore || !msgHasMore) return;
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;
    setMsgLoadingMore(true);
    const nextPage = msgPage + 1;
    try {
      const response = await getConversation(token, activeChat, nextPage);
      const older = [...response.content].reverse();
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !existingIds.has(m.id)), ...prev];
      });
      setMsgPage(nextPage);
      setMsgHasMore(!response.last);
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevScrollHeight + prevScrollTop;
      });
    } catch { /* silent */ } finally { setMsgLoadingMore(false); }
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
    const payload: Record<string, string> = { recipient: activeChat, content: draft.trim() || (attachmentName ?? "Attachment") };
    if (attachmentUrl) payload.attachmentUrl = attachmentUrl;
    if (attachmentName) payload.attachmentName = attachmentName;
    if (attachmentType) payload.attachmentType = attachmentType;
    clientRef.current.publish({ destination: "/app/chat.send", body: JSON.stringify(payload) });
    setDraft("");
    setAttachmentFile(null);
    if (!attachmentUrl && draft.trim()) {
      const urls = extractUrls(draft.trim());
      if (urls.length > 0) {
        fetchLinkPreview(urls[0]).then((preview) => {
          if (preview) { const tempId = Date.now(); setLinkPreviews((prev) => ({ ...prev, [tempId]: { ...preview, url: urls[0] } })); }
        });
      }
    }
    requestAnimationFrame(() => { messageInputRef.current?.focus(); });
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
    logout().then(() => {
      console.log("[ChatPage] ✅ Logged out, redirecting to login...");
      router.push("/login");
    }).catch((err) => {
      console.error("[ChatPage] ❌ Logout error:", err);
      router.push("/login"); // Still redirect even if logout fails
    });
  }

  async function openProfileModal(user: string) {
    if (!token) return;
    setShowProfileModal(true);
    setProfileModalLoading(true);
    setProfileModalData(null);
    try {
      const profile = await getProfile(token, user);
      setProfileModalData(profile);
    } catch { /* silent */ } finally { setProfileModalLoading(false); }
  }

  function openAttachmentsModal() {
    if (!activeChat) return;
    setChatAttachments(chatMessages.filter((msg) => msg.attachmentUrl));
    setShowAttachmentsModal(true);
  }

  const chatMessages = messages.filter(
    (m) => (m.sender === username && m.recipient === activeChat) || (m.sender === activeChat && m.recipient === username)
  );

  const visibleConvos = conversations.filter((c) =>
    c.partner.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function renderMessageContent(content: string) {
    if (!content) return null;
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/g;
    const parts = content.split(urlRegex);
    const urls = content.match(urlRegex) || [];
    return (
      <span>
        {parts.map((part, index) => {
          const urlIndex = Math.floor(index / 3);
          if (index % 3 === 0) return part;
          if (urls[urlIndex]) {
            return <a key={index} href={urls[urlIndex]} target="_blank" rel="noopener noreferrer" className="underline break-all opacity-80 hover:opacity-100">{urls[urlIndex]}</a>;
          }
          return part;
        })}
      </span>
    );
  }

  function getLinkPreviewForMessage(msg: Message) {
    if (!msg.content || msg.attachmentUrl) return null;
    const urls = extractUrls(msg.content);
    if (urls.length === 0) return null;
    const url = urls[0];
    const preview = linkPreviews[msg.id];
    if (!preview) {
      fetchLinkPreview(url).then((data) => {
        if (data) setLinkPreviews((prev) => ({ ...prev, [msg.id]: { ...data, url } }));
      });
      return null;
    }
    return preview;
  }

  if (!token || !username) return null;

  // Right panel derived values
  const totalAttachments = chatMessages.filter((m) => m.attachmentUrl).length;
  const totalLinks = chatMessages.reduce((acc, m) => (!m.attachmentUrl && m.content && extractUrls(m.content).length > 0 ? acc + 1 : acc), 0);
  const docsCount = chatMessages.filter((m) => m.attachmentType && (m.attachmentType.includes("pdf") || m.attachmentType.includes("doc") || m.attachmentType.includes("text"))).length;
  const photosCount = chatMessages.filter((m) => m.attachmentType?.startsWith("image/")).length;
  const moviesCount = chatMessages.filter((m) => m.attachmentType?.startsWith("video/")).length;
  const otherCount = Math.max(0, totalAttachments - docsCount - photosCount - moviesCount);

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f0f2f5" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ================================================================ */}
      {/*  ICON SIDEBAR                                                   */}
      {/* ================================================================ */}
      <aside className="hidden md:flex w-[70px] bg-white border-r border-gray-100 flex-col items-center py-5 flex-shrink-0 z-10">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-6 flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #ef4444 0%, #13C9A0 100%)" }}
        >
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 7l-5 5 5 5V7z" />
          </svg>
        </div>
        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-2">
          {[
            { title: "History", path: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
            { title: "Tasks", path: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
            { title: "Browse", path: "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" },
          ].map(({ title, path }) => (
            <button key={title} className="w-full h-10 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition" title={title}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={path} />
              </svg>
            </button>
          ))}
          <button className="w-full h-10 rounded-xl flex items-center justify-center transition" style={{ background: "#e8faf5", color: "#13C9A0" }} title="Chats">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </button>
          {[
            { title: "Analytics", path: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
            { title: "Video", path: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
          ].map(({ title, path }) => (
            <button key={title} className="w-full h-10 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition" title={title}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={path} />
              </svg>
            </button>
          ))}
        </nav>
        <button onClick={() => router.push("/profile")} className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-[#13C9A0] transition" title="Profile">
          {currentUserProfilePicture ? (
            <Image src={`${API_BASE}${currentUserProfilePicture}`} alt={username} width={40} height={40} className="w-full h-full object-cover" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: avatarColor(username) }}>
              {username[0].toUpperCase()}
            </div>
          )}
        </button>
      </aside>

      {/* ================================================================ */}
      {/*  CONVERSATIONS PANEL                                            */}
      {/* ================================================================ */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 bg-white border-r border-gray-100 flex flex-col transform transition-transform duration-200 ease-in-out md:relative md:w-[290px] md:translate-x-0 md:z-0 ${!activeChat ? "relative z-0 w-full translate-x-0" : sidebarOpen ? "w-[290px] translate-x-0" : "w-[290px] -translate-x-full"} ${!activeChat ? "flex md:flex" : ""}`}
        style={{ height: "100dvh" } as React.CSSProperties}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-gray-400 hover:text-gray-600 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-900">Chat</h1>
          </div>
          <button onClick={() => router.push("/profile")} className="p-2 rounded-full hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition" title="Settings">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* User profile */}
        <div className="px-5 pb-3 md:pb-5 flex flex-col items-center flex-shrink-0 border-b border-gray-50">
          <div className="relative w-[56px] h-[56px] md:w-[72px] md:h-[72px] mb-2 md:mb-3">
            {currentUserProfilePicture ? (
              <Image src={`${API_BASE}${currentUserProfilePicture}`} alt={username} width={72} height={72} className="w-full h-full rounded-full object-cover" unoptimized />
            ) : (
              <div className="w-full h-full rounded-full flex items-center justify-center text-white text-xl md:text-2xl font-bold" style={{ backgroundColor: avatarColor(username) }}>
                {username[0].toUpperCase()}
              </div>
            )}
            <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 md:w-4 md:h-4 bg-green-400 rounded-full border-2 border-white" />
          </div>
          <h2 className="font-bold text-gray-900 text-sm md:text-base">{username}</h2>
          <button className="mt-1.5 md:mt-2 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-default" style={{ background: "#e8faf5", color: "#13C9A0" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#13C9A0" }} />
            available
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-4 mb-1 flex-shrink-0">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-100 text-sm text-gray-900 placeholder-gray-400 outline-none transition"
            />
          </div>
          {showNewChat && (
            <form onSubmit={handleNewChat} className="mt-2">
              <input
                type="text"
                value={newChatUser}
                onChange={(e) => setNewChatUser(e.target.value)}
                placeholder="Enter username..."
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl border text-sm text-gray-900 placeholder-gray-400 outline-none transition"
                style={{ borderColor: "#13C9A0", background: "#f0fdf9" }}
              />
            </form>
          )}
        </div>

        {/* Last chats header */}
        <div className="px-5 py-3 flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-semibold text-gray-500">Last chats</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowNewChat(!showNewChat); setNewChatUser(""); }}
              className="w-7 h-7 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex items-center justify-center text-xl leading-none transition cursor-pointer"
            >+</button>
            <button className="w-7 h-7 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex items-center justify-center transition cursor-pointer">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Conversations */}
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
                className={`w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition cursor-pointer border-l-[3px] ${activeChat === conv.partner ? "bg-gray-50 border-[#13C9A0]" : "border-transparent"}`}
              >
                <div className="relative flex-shrink-0">
                  {profilePictures[conv.partner] ? (
                    <Image src={`${API_BASE}${profilePictures[conv.partner]}`} alt={conv.partner} width={48} height={48} className="w-12 h-12 rounded-full object-cover" unoptimized />
                  ) : (
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm" style={{ backgroundColor: avatarColor(conv.partner) }}>
                      {conv.partner[0].toUpperCase()}
                    </div>
                  )}
                  {onlineUsers.has(conv.partner) && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-gray-900 truncate">{conv.partner}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-gray-400 truncate">{conv.lastMessage || ""}</p>
                    {conv.unreadCount > 0 && (
                      <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full text-white text-[11px] font-semibold px-1.5 flex-shrink-0" style={{ background: "#13C9A0" }}>
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Logout */}
        <div className="px-5 py-2 md:py-3 border-t border-gray-100 flex-shrink-0" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" } as React.CSSProperties}>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-red-50 text-gray-400 hover:text-red-500 transition text-sm cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ================================================================ */}
      {/*  MAIN CHAT AREA                                                */}
      {/* ================================================================ */}
      <main className={`flex-1 flex flex-col min-w-0 p-0 md:p-3 md:pl-0 ${!activeChat ? "hidden md:flex" : "flex"}`} style={{ minHeight: "100dvh" } as React.CSSProperties}>
        <div className="flex-1 bg-white md:rounded-2xl flex flex-col overflow-hidden shadow-sm min-h-0">
          {!activeChat ? (
            /* Empty state - only visible on desktop since mobile shows conversation list */
            <div className="flex-1 flex flex-col items-center justify-center relative p-4 sm:p-8">
              <div className="flex flex-col items-center text-center max-w-sm">
                <div className="relative mb-6">
                  <div className="w-24 h-24 rounded-full border-4 border-dashed flex items-center justify-center" style={{ borderColor: "#13C9A0", background: "#f0fdf9" }}>
                    <svg className="w-10 h-10" style={{ color: "#13C9A0" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="absolute w-1.5 h-1.5 rounded-full opacity-30" style={{ background: "#13C9A0", top: `${50 + 52 * Math.sin((i * Math.PI * 2) / 8)}%`, left: `${50 + 52 * Math.cos((i * Math.PI * 2) / 8)}%`, transform: "translate(-50%, -50%)" }} />
                  ))}
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Select a conversation</h2>
                <p className="text-gray-400 text-sm">
                  Choose from your existing conversations, or{" "}
                  <button onClick={() => setShowNewChat(true)} className="font-semibold hover:underline" style={{ color: "#13C9A0" }}>start a new one</button>
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-3 py-3 sm:px-6 sm:py-4 border-b border-gray-100 flex items-center gap-3 sm:gap-4 flex-shrink-0">
                <button onClick={() => { setActiveChat(null); setSidebarOpen(false); }} className="md:hidden p-1 -ml-1 text-gray-500 hover:text-gray-700 cursor-pointer flex-shrink-0">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5">
                    <button onClick={() => openProfileModal(activeChat)} className="relative flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer">
                      {profilePictures[activeChat] ? (
                        <Image src={`${API_BASE}${profilePictures[activeChat]}`} alt={activeChat} width={40} height={40} className="w-10 h-10 rounded-full object-cover" unoptimized />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: avatarColor(activeChat) }}>
                          {activeChat[0].toUpperCase()}
                        </div>
                      )}
                      {onlineUsers.has(activeChat) && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />}
                    </button>
                    <div className="min-w-0">
                      <h2 className="font-bold text-gray-900 truncate">{activeChat}</h2>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${onlineUsers.has(activeChat) ? "bg-green-400" : "bg-gray-300"}`} />
                        <span className={`text-xs font-medium ${onlineUsers.has(activeChat) ? "text-green-500" : "text-gray-400"}`}>
                          {onlineUsers.has(activeChat) ? "Active now" : "Offline"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setChatTab("messages")}
                      className="text-sm font-medium px-4 py-0.5 rounded-full transition cursor-pointer"
                      style={chatTab === "messages" ? { background: "#13C9A0", color: "#fff" } : { color: "#9CA3AF" }}
                    >Messages</button>
                    <button
                      onClick={() => setChatTab("media")}
                      className="text-sm font-medium transition cursor-pointer"
                      style={chatTab === "media" ? { color: "#13C9A0", fontWeight: 600 } : { color: "#9CA3AF" }}
                    >Media</button>
                  </div>
                </div>

                <button
                  onClick={() => setShowRightPanel(!showRightPanel)}
                  className="hidden lg:flex p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition cursor-pointer items-center justify-center"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={showRightPanel ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mx-6 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex-shrink-0">{error}</div>
              )}

              {/* Media tab */}
              {chatTab === "media" ? (
                <div className="flex-1 overflow-y-auto p-3 sm:p-6">
                  {chatMessages.filter((m) => m.attachmentUrl).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ background: "#f0fdf9" }}>
                        <svg className="w-8 h-8" style={{ color: "#13C9A0" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">No media yet</h3>
                      <p className="text-gray-400 text-sm">Files and images shared here will appear</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {chatMessages.filter((m) => m.attachmentUrl).map((msg) => (
                        <div key={msg.id} className="rounded-xl overflow-hidden bg-gray-50">
                          {msg.attachmentType?.startsWith("image/") ? (
                            <div className="aspect-square relative">
                              <Image src={`${API_BASE}${msg.attachmentUrl}`} alt={msg.attachmentName || "Image"} fill className="object-cover cursor-pointer" onClick={() => window.open(`${API_BASE}${msg.attachmentUrl}`, "_blank")} unoptimized />
                            </div>
                          ) : (
                            <a href={`${API_BASE}${msg.attachmentUrl}`} target="_blank" rel="noopener noreferrer" className="block p-4">
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-2" style={{ background: "#e8faf5" }}>
                                <svg className="w-5 h-5" style={{ color: "#13C9A0" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <p className="text-sm font-medium text-gray-900 truncate">{msg.attachmentName || "File"}</p>
                              <p className="text-xs text-gray-400">{new Date(msg.sentAt).toLocaleDateString()}</p>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Messages tab */
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4 space-y-3 min-h-0">
                  {msgHasMore && (
                    <div className="flex justify-center py-1">
                      <button onClick={loadOlderMessages} disabled={msgLoadingMore} className="px-4 py-1.5 text-sm rounded-full transition disabled:opacity-50 cursor-pointer hover:bg-gray-100" style={{ color: "#13C9A0" }}>
                        {msgLoadingMore ? "Loading…" : "Load older messages"}
                      </button>
                    </div>
                  )}
                  {chatMessages.length === 0 && <div className="text-center text-gray-400 text-sm mt-10">No messages yet. Say hello!</div>}

                  {chatMessages.map((msg) => {
                    const own = msg.sender === username;
                    const preview = getLinkPreviewForMessage(msg);
                    return (
                      <div key={msg.id} className={`flex ${own ? "justify-end" : "justify-start"} items-end gap-2`}>
                        {/* Avatar for received */}
                        {!own && (
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-white text-[10px] sm:text-xs font-bold mb-5" style={{ backgroundColor: avatarColor(msg.sender) }}>
                            {profilePictures[msg.sender] ? (
                              <Image src={`${API_BASE}${profilePictures[msg.sender]}`} alt={msg.sender} width={32} height={32} className="w-full h-full object-cover" unoptimized />
                            ) : msg.sender[0].toUpperCase()}
                          </div>
                        )}

                        <div className={`max-w-[85%] sm:max-w-[70%] flex flex-col gap-0.5 ${own ? "items-end" : "items-start"}`}>
                          {/* Header */}
                          <div className={`flex items-center gap-2 px-1 ${own ? "flex-row-reverse" : ""}`}>
                            {!own && <span className="text-xs font-semibold text-gray-600">{msg.sender}</span>}
                            {own && <span className="text-xs text-gray-400">You</span>}
                            <span className="text-xs text-gray-400">{new Date(msg.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>

                          {/* Bubble */}
                          <div
                            className={`px-4 py-3 rounded-2xl text-sm ${own ? "rounded-br-sm" : "rounded-bl-sm"}`}
                            style={own ? { background: "#EDE9FE", color: "#1f1735" } : { background: "#F3F4F6", color: "#111827" }}
                          >
                            {msg.attachmentUrl && (
                              <div className="mb-2">
                                {msg.attachmentType?.startsWith("image/") ? (
                                  <Image src={`${API_BASE}${msg.attachmentUrl}`} alt={msg.attachmentName || "Image"} width={300} height={200} className="max-w-full rounded-lg max-h-60 object-cover cursor-pointer" onClick={() => window.open(`${API_BASE}${msg.attachmentUrl}`, "_blank")} unoptimized />
                                ) : (
                                  <a href={`${API_BASE}${msg.attachmentUrl}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition">
                                    <svg className="w-5 h-5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-sm truncate">{msg.attachmentName || "File"}</span>
                                  </a>
                                )}
                              </div>
                            )}
                            {msg.content && !(msg.attachmentUrl && msg.content === msg.attachmentName) && (
                              <div className="whitespace-pre-wrap break-words">{renderMessageContent(msg.content)}</div>
                            )}
                            {preview && (
                              <div className="mt-2 border rounded-xl overflow-hidden border-gray-200 bg-white max-w-xs relative hover:opacity-90 transition-opacity">
                                {preview.image && <div className="aspect-video w-full overflow-hidden"><Image src={preview.image} alt={preview.title || "Preview"} width={300} height={200} className="w-full h-full object-cover" unoptimized /></div>}
                                <div className="p-2.5">
                                  {preview.domain && <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{preview.domain}</p>}
                                  {preview.title && <h4 className="font-medium text-sm text-gray-900 truncate">{preview.title}</h4>}
                                </div>
                                <a href={preview.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0" aria-label={preview.title || preview.url} />
                              </div>
                            )}
                          </div>

                          {/* Status ticks */}
                          {own && (
                            <div className="flex items-center gap-1 px-1">
                              {msg.status === "SEEN" && (
                                <svg width="14" height="10" viewBox="0 0 16 11">
                                  <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L6.044 6.58 3.614 3.776a.493.493 0 0 0-.381-.178.457.457 0 0 0-.304.102.505.505 0 0 0-.07.686l2.736 3.16a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L11.14 1.34a.505.505 0 0 0-.07-.686Z" fill="#13C9A0" />
                                  <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L10.044 6.58 9.2 5.612l-.543.627 1.736 2.01a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L15.14 1.34a.505.505 0 0 0-.07-.686Z" fill="#13C9A0" />
                                </svg>
                              )}
                              {msg.status === "DELIVERED" && (
                                <svg width="14" height="10" viewBox="0 0 16 11">
                                  <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L6.044 6.58 3.614 3.776a.493.493 0 0 0-.381-.178.457.457 0 0 0-.304.102.505.505 0 0 0-.07.686l2.736 3.16a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L11.14 1.34a.505.505 0 0 0-.07-.686Z" fill="#9CA3AF" />
                                  <path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L10.044 6.58 9.2 5.612l-.543.627 1.736 2.01a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L15.14 1.34a.505.505 0 0 0-.07-.686Z" fill="#9CA3AF" />
                                </svg>
                              )}
                              {msg.status === "SENT" && (
                                <svg width="14" height="10" viewBox="0 0 16 11">
                                  <path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178L6.044 6.58 3.614 3.776a.493.493 0 0 0-.381-.178.457.457 0 0 0-.304.102.505.505 0 0 0-.07.686l2.736 3.16a.493.493 0 0 0 .381.178.493.493 0 0 0 .381-.178L11.14 1.34a.505.505 0 0 0-.07-.686Z" fill="#D1D5DB" />
                                </svg>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              )}

              {/* Input */}
              <div className="px-3 py-2 sm:px-6 sm:py-4 border-t border-gray-100 flex-shrink-0" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" } as React.CSSProperties}>
                {attachmentFile && (
                  <div className="mb-2 sm:mb-3 flex items-center gap-2">
                    <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 bg-gray-100 rounded-lg text-sm text-gray-700 min-w-0 max-w-[calc(100%-2rem)]">
                      <svg className="w-4 h-4 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate">{attachmentFile.name}</span>
                      <button type="button" onClick={() => setAttachmentFile(null)} className="p-0.5 text-gray-400 hover:text-gray-600 transition cursor-pointer flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {attachmentUploading && <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#13C9A0", borderTopColor: "transparent" }} />}
                  </div>
                )}
                <form onSubmit={handleSend} className="flex items-center gap-1.5 sm:gap-2 bg-gray-50 rounded-2xl px-2.5 sm:px-4 py-2">
                  <input
                    ref={messageInputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write your message..."
                    className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="sentences"
                  />
                  <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                    <button type="button" className="hidden sm:flex text-gray-400 hover:text-gray-500 transition p-1 cursor-pointer">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    <input ref={attachmentInputRef} type="file" onChange={handleAttachmentSelect} className="hidden" />
                    <button type="button" onClick={() => attachmentInputRef.current?.click()} disabled={attachmentUploading} className="text-gray-400 hover:text-gray-500 transition p-1.5 disabled:opacity-50 cursor-pointer flex-shrink-0" title="Attach file">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </button>
                    <button type="submit" disabled={(!draft.trim() && !attachmentFile) || attachmentUploading} className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl text-white transition disabled:opacity-40 flex-shrink-0 cursor-pointer disabled:cursor-not-allowed" style={{ background: "#13C9A0" }}>
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 rotate-45" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </main>

      {/* ================================================================ */}
      {/*  SHARED FILES / INFO PANEL                                      */}
      {/* ================================================================ */}
      {showRightPanel && activeChat && (
        <aside className="hidden lg:flex w-[280px] bg-white rounded-2xl flex-col shadow-sm flex-shrink-0 m-3 ml-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
            <button onClick={() => setShowRightPanel(false)} className="text-gray-400 hover:text-gray-600 transition cursor-pointer">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <h2 className="font-bold text-gray-900">Shared files</h2>
          </div>

          <div className="flex flex-col items-center py-6 px-6 border-b border-gray-100 flex-shrink-0">
            {profilePictures[activeChat] ? (
              <Image src={`${API_BASE}${profilePictures[activeChat]}`} alt={activeChat} width={80} height={80} className="w-20 h-20 rounded-full object-cover mb-3" unoptimized />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3" style={{ backgroundColor: avatarColor(activeChat) }}>
                {activeChat[0].toUpperCase()}
              </div>
            )}
            <h3 className="font-bold text-gray-900 text-base">{activeChat}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${onlineUsers.has(activeChat) ? "bg-green-400" : "bg-gray-300"}`} />
              <span className="text-sm text-gray-400">{onlineUsers.has(activeChat) ? "Active now" : "Offline"}</span>
            </div>
          </div>

          <div className="px-4 py-4 flex gap-3 flex-shrink-0">
            <div className="flex-1 rounded-xl p-3" style={{ background: "#13C9A0" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <svg className="w-4 h-4 text-white opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-white/80 text-xs">All Files</span>
              </div>
              <span className="text-white text-2xl font-bold">{totalAttachments}</span>
            </div>
            <div className="flex-1 rounded-xl p-3 bg-gray-50">
              <div className="flex items-center gap-1.5 mb-1">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
                <span className="text-gray-400 text-xs">All Links</span>
              </div>
              <span className="text-gray-700 text-2xl font-bold">{totalLinks}</span>
            </div>
          </div>

          <div className="px-4 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between py-3 border-b border-gray-50">
              <span className="text-sm font-bold text-gray-900">File type</span>
              <button className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
                </svg>
              </button>
            </div>
            <div className="space-y-1 py-2">
              {[
                { label: "Documents", count: docsCount, bg: "#EEF2FF", color: "#6366F1", icon: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
                { label: "Photos", count: photosCount, bg: "#FFFBEB", color: "#F59E0B", icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
                { label: "Movies", count: moviesCount, bg: "#F0FDF4", color: "#22C55E", icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
                { label: "Other", count: otherCount, bg: "#FEF2F2", color: "#EF4444", icon: "M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13", onClick: openAttachmentsModal },
              ].map(({ label, count, bg, color, icon, onClick }) => (
                <button key={label} onClick={onClick} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition cursor-pointer">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bg }}>
                    <svg className="w-5 h-5" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-900">{label}</p>
                    <p className="text-xs text-gray-400">{count} files</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* Attachments Modal */}
      {showAttachmentsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xl font-bold text-gray-900">Media & Files</h3>
              <button onClick={() => setShowAttachmentsModal(false)} className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition cursor-pointer">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
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
                          <Image src={`${API_BASE}${msg.attachmentUrl}`} alt={msg.attachmentName || "Image"} fill className="object-cover cursor-pointer" onClick={() => window.open(`${API_BASE}${msg.attachmentUrl}`, "_blank")} unoptimized />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                            <p className="text-white text-xs truncate font-medium">{msg.attachmentName || "Image"}</p>
                            <p className="text-white/80 text-xs">{new Date(msg.sentAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ) : (
                        <a href={`${API_BASE}${msg.attachmentUrl}`} target="_blank" rel="noopener noreferrer" className="block p-4 hover:bg-gray-100 transition">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#e8faf5" }}>
                              <svg className="w-5 h-5" style={{ color: "#13C9A0" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{msg.attachmentName || "File"}</p>
                              <p className="text-xs text-gray-500">{new Date(msg.sentAt).toLocaleDateString()}</p>
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
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">Profile</h3>
              <button onClick={() => setShowProfileModal(false)} className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition cursor-pointer">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              {profileModalLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#13C9A0", borderTopColor: "transparent" }} />
                </div>
              ) : profileModalData ? (
                <div className="text-center">
                  <div className="mb-6">
                    {profileModalData.profilePictureUrl ? (
                      <Image src={`${API_BASE}${profileModalData.profilePictureUrl}`} alt={profileModalData.username} width={120} height={120} className="w-30 h-30 rounded-full object-cover mx-auto" unoptimized />
                    ) : (
                      <div className="w-30 h-30 rounded-full flex items-center justify-center text-white text-4xl font-bold mx-auto" style={{ backgroundColor: avatarColor(profileModalData.username), width: 120, height: 120 }}>
                        {profileModalData.username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-2xl font-bold text-gray-900">{profileModalData.displayName || profileModalData.username}</h4>
                      {profileModalData.displayName && <p className="text-gray-500 text-sm mt-1">@{profileModalData.username}</p>}
                    </div>
                    {profileModalData.bio && (
                      <div className="bg-gray-50 rounded-lg p-4 text-left">
                        <h5 className="text-sm font-semibold text-gray-700 mb-2">About</h5>
                        <p className="text-gray-600 text-sm whitespace-pre-wrap">{profileModalData.bio}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-2 text-sm">
                      {onlineUsers.has(profileModalData.username) ? (
                        <><span className="w-2 h-2 rounded-full bg-green-400" /><span className="font-medium" style={{ color: "#13C9A0" }}>Active now</span></>
                      ) : (
                        <><span className="w-2 h-2 rounded-full bg-gray-400" /><span className="text-gray-500">Offline</span></>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12"><p className="text-gray-500">Failed to load profile</p></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
