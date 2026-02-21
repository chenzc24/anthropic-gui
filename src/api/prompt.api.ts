import { ApiSettingOptions } from '@/typings/common';

export interface PromptRequest extends ApiSettingOptions {
  prompt: string;
  signal?: AbortSignal;
}

export const submitPrompt = async ({
  prompt,
  signal,
}: PromptRequest) => {
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

    return response;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
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
    return response.json();
  } catch (error) {
    console.error(error);
  }
};
