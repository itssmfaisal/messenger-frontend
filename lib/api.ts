import { AuthRequest, ConversationPageResponse, ConversationsResponse, LoginResponse, Message, OnlineUsersResponse, PresenceEvent, ProfileUpdateRequest, RegisterResponse, UserProfile } from "./types";

import { LinkPreview } from "./types";

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
  withUser: string,
  page: number = 0,
  size: number = 20
): Promise<ConversationPageResponse> {
  const res = await fetch(
    `${API_BASE}/messages/conversation/${encodeURIComponent(withUser)}?page=${page}&size=${size}`,
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

// URL detection and link preview utilities
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
  return text.match(urlRegex) || [];
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    // Use a CORS proxy or your backend to fetch link metadata
    // For now, we'll simulate the metadata extraction
    const domain = new URL(url).hostname.replace('www.', '');
    
    // Extract video ID for video platforms
    let videoThumbnail = null;
    let isVideo = false;
    
    // YouTube video detection and thumbnail extraction
    if (domain === 'youtube.com' || domain === 'youtu.be') {
      isVideo = true;
      let videoId = '';
      
      if (domain === 'youtu.be') {
        videoId = url.split('/').pop()?.split('?')[0] || '';
      } else {
        const urlParams = new URLSearchParams(new URL(url).search);
        videoId = urlParams.get('v') || '';
      }
      
      if (videoId) {
        videoThumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      }
    }
    
    // Vimeo video detection
    else if (domain === 'vimeo.com') {
      isVideo = true;
      const videoId = url.split('/').pop()?.split('?')[0];
      if (videoId) {
        // Vimeo thumbnail would require API call, using placeholder for demo
        videoThumbnail = `https://vumbnail.com/${videoId}.jpg`;
      }
    }
    
    // TikTok video detection
    else if (domain === 'tiktok.com') {
      isVideo = true;
      // TikTok thumbnails require API, using placeholder
      videoThumbnail = 'https://sf16-ies-music-va.tiktokcdn.com/obj/musically-maliva-obj/1634091461116934.jpeg';
    }
    
    // Enhanced mock data with video support
    const mockPreviews: Record<string, Omit<LinkPreview, 'url'>> = {
      'github.com': {
        title: 'GitHub Repository',
        description: 'A place where the world builds software',
        image: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
        domain: 'github.com',
        isVideo: false
      },
      'youtube.com': {
        title: 'YouTube Video',
        description: 'Watch this amazing video on YouTube',
        image: videoThumbnail || 'https://www.youtube.com/img/desktop/yt_1200.png',
        domain: 'youtube.com',
        isVideo: true,
        duration: '5:23'
      },
      'youtu.be': {
        title: 'YouTube Video',
        description: 'Watch this amazing video on YouTube', 
        image: videoThumbnail || 'https://www.youtube.com/img/desktop/yt_1200.png',
        domain: 'youtube.com',
        isVideo: true,
        duration: '3:45'
      },
      'vimeo.com': {
        title: 'Vimeo Video',
        description: 'Beautiful video content on Vimeo',
        image: videoThumbnail || 'https://vimeo.com/favicon.ico',
        domain: 'vimeo.com',
        isVideo: true,
        duration: '2:18'
      },
      'tiktok.com': {
        title: 'TikTok Video',
        description: 'Check out this TikTok!',
        image: videoThumbnail || 'https://sf16-ies-music-va.tiktokcdn.com/obj/musically-maliva-obj/1634091461116934.jpeg',
        domain: 'tiktok.com',
        isVideo: true,
        duration: '0:30'
      },
      'twitter.com': {
        title: 'Tweet',
        description: 'See what\'s happening on Twitter',
        image: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png',
        domain: 'twitter.com',
        isVideo: false
      },
      'instagram.com': {
        title: 'Instagram Post',
        description: 'View this post on Instagram',
        image: 'https://static.cdninstagram.com/rsrc.php/v3/yt/r/30PrGfR7ADI.png',
        domain: 'instagram.com',
        isVideo: false
      }
    };

    // Return enhanced data or generic preview
    const basePreview = mockPreviews[domain] || {
      title: `Link from ${domain}`,
      description: `Visit ${url}`,
      domain,
      isVideo: isVideo
    };
    
    // Add video thumbnail if detected
    if (isVideo && videoThumbnail && !basePreview.image) {
      basePreview.image = videoThumbnail;
    }
    
    return { ...basePreview, url };
  } catch (error) {
    console.error('Failed to fetch link preview:', error);
    return null;
  }
}
