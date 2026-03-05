export interface Message {
  id: number;
  sender: string;
  recipient: string;
  content: string;
  sentAt: string;
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
