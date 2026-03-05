import { AuthRequest, ConversationsResponse, LoginResponse, Message, OnlineUsersResponse, PresenceEvent, RegisterResponse } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function login(data: AuthRequest): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Login failed");
  }

  return res.json();
}

export async function register(data: AuthRequest): Promise<RegisterResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Registration failed");
  }

  return res.json();
}

export async function getConversation(
  token: string,
  withUser: string
): Promise<Message[]> {
  const res = await fetch(
    `${API_BASE}/messages/conversation/${encodeURIComponent(withUser)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    throw new Error("Failed to load conversation");
  }

  return res.json();
}

export async function getConversations(
  token: string,
  page: number = 0,
  size: number = 20
): Promise<ConversationsResponse> {
  const res = await fetch(
    `${API_BASE}/messages/conversations?page=${page}&size=${size}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    throw new Error("Failed to load conversations");
  }

  return res.json();
}

export async function getUserPresence(
  token: string,
  username: string
): Promise<PresenceEvent> {
  const res = await fetch(
    `${API_BASE}/presence/${encodeURIComponent(username)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    throw new Error("Failed to check presence");
  }

  return res.json();
}

export async function getOnlineUsers(
  token: string
): Promise<OnlineUsersResponse> {
  const res = await fetch(`${API_BASE}/presence`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error("Failed to load online users");
  }

  return res.json();
}
