import { ApiSettingOptions } from '@/typings/common';

export interface PromptRequest extends ApiSettingOptions {
  prompt: string;
  signal?: AbortSignal;
  runId?: string;
}

export const submitPrompt = async ({
  prompt,
  signal,
  runId,
}: PromptRequest) => {
  // [MODIFIED] Use new agent endpoint for normal chat
  const requestBody = {
    prompt,
    stream: true,
    run_id: runId,
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
  const payload = {
    value,
    input: value,
    text: value,
  };

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };

  const endpointCandidates = [
    '/api/agent/submit_input',
    '/api/agent/input',
    '/api/agent/chat/input',
  ];

  const sleep = (ms: number) =>
    new Promise(resolve => {
      setTimeout(resolve, ms);
    });

  let lastError = '';

  for (const endpoint of endpointCandidates) {
    let waitingRetry = 0;

    while (waitingRetry < 5) {
      const response = await fetch(endpoint, requestOptions);

      if (response.ok) {
        const responseText = await response.text();
        try {
          return responseText
            ? JSON.parse(responseText)
            : { status: 'success' };
        } catch {
          return { status: 'success', raw: responseText };
        }
      }

      const text = await response.text();
      const normalized = (text || '').toLowerCase();

      if (response.status === 404) {
        lastError =
          text || `Input submit failed at ${endpoint} with status 404`;
        break;
      }

      if (
        response.status === 400 &&
        (normalized.includes('not waiting') ||
          normalized.includes('waiting for input'))
      ) {
        waitingRetry += 1;
        await sleep(200);
        continue;
      }

      throw new Error(
        text ||
          `Input submit failed at ${endpoint} with status ${response.status}`,
      );
    }
  }

  throw new Error(lastError || 'Input submit failed on all known endpoints');
};

export const pauseRun = async (runId: string) => {
  const response = await fetch(
    `/api/agent/runs/${encodeURIComponent(runId)}/pause`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Pause failed with status ${response.status}`);
  }

  return response.json();
};

export const resumeRun = async (runId: string, value: string) => {
  const response = await fetch(
    `/api/agent/runs/${encodeURIComponent(runId)}/resume`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Resume failed with status ${response.status}`);
  }

  return response.json();
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
