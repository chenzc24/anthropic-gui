import { ApiSettingOptions } from '@/typings/common';

export interface PromptRequest extends ApiSettingOptions {
  prompt: string;
  signal?: AbortSignal;
}

export const submitPrompt = async ({ prompt, signal }: PromptRequest) => {
  // [MODIFIED] Use new agent endpoint for normal chat
  const requestBody = {
    prompt,
    stream: true,
  };

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'text/event-stream', // Expect SSE
    },
    signal: signal,
    body: JSON.stringify(requestBody),
  };

  try {
    const response = await fetch(`/api/agent/chat`, requestOptions);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        text || `Chat request failed with status ${response.status}`,
      );
    }

    return response;
  } catch (error) {
    throw error;
  }
};

export const submitInput = async (value: string) => {
  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value }),
  };

  try {
    const response = await fetch(`/api/agent/submit_input`, requestOptions);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        text || `Input submit failed with status ${response.status}`,
      );
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
};

export const submitEditorConfirm = async (sourcePath: string, data: any) => {
  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_path: sourcePath,
      data,
    }),
  };

  const response = await fetch(`/api/agent/editor/confirm`, requestOptions);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Confirm failed with status ${response.status}`);
  }

  return response.json();
};
