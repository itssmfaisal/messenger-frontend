import { AuthRequest, ConversationsResponse, LoginResponse, Message, OnlineUsersResponse, PresenceEvent, ProfileUpdateRequest, RegisterResponse, UserProfile } from "./types";

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

export async function getProfile(
  token: string,
  username?: string
): Promise<UserProfile> {
  const url = username
    ? `${API_BASE}/profile/${encodeURIComponent(username)}`
    : `${API_BASE}/profile`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error("Failed to load profile");
  }

  return res.json();
}

export async function updateProfile(
  token: string,
  data: ProfileUpdateRequest
): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update profile");
  }

  return res.json();
}

export async function uploadProfilePicture(
  token: string,
  file: File
): Promise<UserProfile> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/profile/picture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to upload profile picture");
  }

  return res.json();
}

export async function deleteProfilePicture(
  token: string
): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/profile/picture`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error("Failed to delete profile picture");
  }

  return res.json();
}

export async function uploadAttachment(
  token: string,
  file: File
): Promise<{ attachmentUrl: string; attachmentName: string; attachmentType: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/messages/attachment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to upload attachment");
  }

  return res.json();
}
