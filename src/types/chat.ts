export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  processId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatRequest {
  processId: string;
  messages: Array<{
    role: MessageRole;
    content: string;
  }>;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface ChatResponse {
  id: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatStreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
    };
    finish_reason: string | null;
  }>;
}
