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
  type: 'agent_thought' | 'tool_call' | 'tool_result' | 'agent_error' | 'status' | 'files_generated';
  content: string; // The text content or JSON string
  toolName?: string;
  toolArgs?: any;
  status?: 'success' | 'error' | 'running';
  files?: Array<{ name: string; path: string; url: string }>;
}

export interface ChatContent {
  id: string;
  type: PromptType;
  text: string;
  steps?: AgentStep[];
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
