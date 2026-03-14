import type { MutableRefObject } from 'react';

export type ApiErrorDetails = {
  fields?: Record<string, string>;
  message?: string;
  code: string | number;
};

export interface ApiSettingOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topK: number;
  topP: number;
}

export type PromptType = 'Human' | 'Assistant';

export interface ConversationCommon {
  id: string;
  name: string;
  createdAt: Date;
  children: ConversationCommon[];
  type: 'folder' | 'chat';
}

export interface AgentStep {
  id?: string; // Unique ID for React rendering
  type:
    | 'agent_thought'
    | 'tool_call'
    | 'tool_result'
    | 'agent_error'
    | 'status'
    | 'files_generated';
  content: string; // The text content or JSON string
  toolName?: string;
  toolArgs?: any;
  status?: 'success' | 'error' | 'running';
  files?: Array<{ name: string; path: string; url: string }>;
}

export interface ChatAttachment {
  id: string;
  name: string;
  path: string;
  url: string;
  mimeType?: string;
  category?: 'image' | 'text' | 'code' | 'csv' | 'json' | 'other';
  size?: number;
  timestamp: number;
}

export interface AssistantDetailBlock {
  id: string;
  type:
    | 'agent_thought'
    | 'tool_result'
    | 'status'
    | 'files_generated'
    | 'agent_error'
    | 'input_request';
  content: string;
  files?: Array<{ name: string; path: string; url: string }>;
  timestamp: number;
}

export interface ChatFile {
  id: string; // Unique ID
  name: string; // File name (e.g. layout.json)
  url: string; // Download URL or path
  type: 'image' | 'code' | 'json' | 'config' | 'il' | 'unknown'; // Derived type
  timestamp: number; // Creation time
}

export interface ChatContent {
  id: string;
  type: PromptType;
  text: string;
  steps?: AgentStep[];
  assets?: ChatFile[]; // Structured generated files
  messageVersion?: 1 | 2;
  mainText?: string;
  details?: AssistantDetailBlock[];
  isComplete?: boolean;
  humanAttachments?: ChatAttachment[];
}

export interface TreeItem {
  id: string;
  name: string;
  type: string;
  content?: ChatContent[];
  children: TreeItem[];
  createdAt?: Date;
  collapsed?: boolean;
}

export type TreeItems = TreeItem[];

export interface FlattenedItem extends TreeItem {
  parentId: null | string;
  parentType: null | string;
  depth: number;
  index: number;
}

export type SensorContext = MutableRefObject<{
  items: FlattenedItem[];
  offset: number;
}>;

// Phase 0 chat-record contract (backend loading migration)
export interface ChatRecordFileRef {
  name: string;
  path: string;
  url: string;
}

export interface ChatRecordAttachment {
  id: string;
  name: string;
  path: string;
  url: string;
  mimeType?: string;
  category?: 'image' | 'text' | 'code' | 'csv' | 'json' | 'other';
  size?: number;
  timestamp: number;
}

export interface ChatRecordDetailBlock {
  id: string;
  type:
    | 'agent_thought'
    | 'tool_result'
    | 'status'
    | 'files_generated'
    | 'agent_error'
    | 'input_request';
  content: string;
  files?: ChatRecordFileRef[];
  timestamp: number;
}

export interface ChatRecordAsset {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'code' | 'json' | 'config' | 'il' | 'unknown';
  timestamp: number;
}

export interface ChatRecordMessage {
  id: string;
  role: PromptType;
  text: string;
  mainText?: string;
  isComplete?: boolean;
  createdAt: number;
  sequence: number;
  details?: ChatRecordDetailBlock[];
  assets?: ChatRecordAsset[];
  attachments?: ChatRecordAttachment[];
}

export interface ChatSessionSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface ChatSessionDetail {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatRecordMessage[];
}
