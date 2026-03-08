export interface Message {
  id: number;
  sender: string;
  recipient: string;
  content: string;
  status: "SENT" | "DELIVERED" | "SEEN";
  sentAt: string;
  deliveredAt: string | null;
  seenAt: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  attachmentSize: number | null;
  linkPreview?: LinkPreview | null;
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  domain?: string;
  isVideo?: boolean;
  duration?: string;
}

export interface UserProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  profilePictureUrl: string | null;
  createdAt: string;
}

export interface ProfileUpdateRequest {
  displayName?: string;
  bio?: string;
}

export interface StatusUpdate {
  messageId: number;
  status: "DELIVERED" | "SEEN";
  deliveredAt?: string;
  seenAt?: string;
}

export interface PresenceEvent {
  username: string;
  online: boolean;
}

export interface OnlineUsersResponse {
  onlineUsers: string[];
}

export interface ConversationDTO {
  partner: string;
  lastMessageAt: string;
}

export interface ConversationsResponse {
  content: ConversationDTO[];
  totalElements: number;
  totalPages: number;
  last: boolean;
  first: boolean;
  numberOfElements: number;
}

export interface ConversationPageResponse {
  content: Message[];
  pageable: {
    pageNumber: number;
    pageSize: number;
  };
  totalElements: number;
  totalPages: number;
  last: boolean;
  first: boolean;
  numberOfElements: number;
}

export interface AuthRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}

export interface RegisterResponse {
  username: string;
}

export interface ErrorResponse {
  error: string;
}
