import { v4 as uuidv4 } from 'uuid';

import { submitInput, submitPrompt } from '@/api/prompt.api';
import { ROUTES } from '@/app/router/constants/routes';
import {
  resetAgentStreamState,
  setAgentStreamState,
} from '@/redux/agentStream/agentStream.slice';
import {
  addAssetsToContent,
  addPromptToChat,
  appendContentById,
} from '@/redux/conversations/conversationsSlice';
import { store } from '@/redux/store';
import { ChatContent, ChatFile } from '@/typings/common';

const IO_EDITOR_PENDING_KEY = 'io_editor_pending_file';
const IO_EDITOR_RETURN_KEY = 'io_editor_return_path';

const NARRATIVE_DELTA_REGEX =
  /^(Thought:|Observation:|Action:|Final Answer:|\*\*Generated Files:\*\*|\[Download\s|Config loaded successfully\.|The JSON structure seems|Validation passed\.|Schematic generation result:|Layout generation result:)/;

const normalizeCodeTagsForFenceScan = (text: string): string =>
  text.replace(/<code>/g, '\n```text\n').replace(/<\/code>/g, '\n```\n');

const hasOpenFence = (text: string): boolean => {
  const normalized = normalizeCodeTagsForFenceScan(text);
  const lines = normalized.split(/\r?\n/);

  let openFence: { marker: '`' | '~'; size: number } | null = null;

  for (const line of lines) {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (!match) continue;

    const fence = match[1];
    const marker = fence[0] as '`' | '~';
    const size = fence.length;

    if (!openFence) {
      openFence = { marker, size };
      continue;
    }

    if (openFence.marker === marker && size >= openFence.size) {
      openFence = null;
    }
  }

  return openFence !== null;
};

const makeSafeMarkdownSectionPrefix = (currentText: string): string =>
  hasOpenFence(currentText) ? '\n```\n\n' : '\n\n';

const normalizeDeltaForFenceSafety = (
  currentText: string,
  delta: string,
): string => {
  if (!hasOpenFence(currentText)) return delta;

  const trimmedStart = delta.trimStart();
  if (!trimmedStart) return delta;

  if (NARRATIVE_DELTA_REGEX.test(trimmedStart)) {
    return '\n```\n' + delta;
  }

  return delta;
};

const stripKnownThoughtPrefix = (text: string): string =>
  text.replace(/^\s*(Thought:|\*\*Thought:\*\*)\s*/i, '');

const stripKnownExecutionPrefix = (text: string): string =>
  text.replace(/^\s*(Execution logs?:|\*\*Execution logs?:\*\*)\s*/i, '');

let abortController: AbortController | null = null;
let isGenerating = false;
let streamRunId = 0;
let navigateToEditor: (() => void) | null = null;

export const setEditorNavigationHandler = (handler: (() => void) | null) => {
  navigateToEditor = handler;
};

interface StartStreamParams {
  chatId: string;
  prompt: string;
  isRegenerate?: boolean;
  lastAssistantPromptId?: string;
}

export const startAgentStream = async ({
  chatId,
  prompt,
  isRegenerate,
  lastAssistantPromptId,
}: StartStreamParams) => {
  if (isGenerating) {
    return;
  }

  isGenerating = true;
  const runId = ++streamRunId;

  store.dispatch(
    setAgentStreamState({
      activeChatId: chatId,
      isLoading: true,
      isStreaming: false,
    }),
  );

  if (abortController) {
    abortController.abort();
  }

  abortController = new AbortController();
  const signal = abortController.signal;

  try {
    const response = await submitPrompt({
      prompt,
      signal,
      apiKey: '',
      model: '',
      maxTokens: 0,
      temperature: 0,
      topK: 0,
      topP: 0,
    });

    if (!response?.ok) {
      store.dispatch(
        setAgentStreamState({
          isStreaming: false,
          isLoading: false,
        }),
      );
      isGenerating = false;
      return;
    }

    store.dispatch(
      setAgentStreamState({
        isStreaming: true,
        isLoading: false,
      }),
    );

    const reader = response?.body?.getReader();
    const decoder = new TextDecoder('utf-8');

    let assistantContentId = '';
    let assistantTextBuffer = '';
    let pendingNewAssistantBlock = false;

    if (!isRegenerate) {
      assistantContentId = uuidv4();
      const newPrompt: ChatContent = {
        type: 'Assistant',
        text: '',
        id: assistantContentId,
        steps: [],
      };
      store.dispatch(addPromptToChat({ chatId, content: newPrompt }));
    } else {
      assistantContentId = lastAssistantPromptId || uuidv4();
      if (!lastAssistantPromptId) {
        const newPrompt: ChatContent = {
          type: 'Assistant',
          text: '',
          id: assistantContentId,
          steps: [],
        };
        store.dispatch(addPromptToChat({ chatId, content: newPrompt }));
      }
    }

    store.dispatch(
      setAgentStreamState({
        updatingAiPromptId: assistantContentId,
      }),
    );

    let buffer = '';
    while (true) {
      if (runId !== streamRunId) {
        break;
      }

      const res = await reader?.read();
      if (res?.done) break;

      buffer += decoder.decode(res?.value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const block of lines) {
        if (runId !== streamRunId) {
          break;
        }

        const dataLine = block.split('\n').find(l => l.startsWith('data: '));
        if (!dataLine) continue;

        try {
          const jsonStr = dataLine.substring(6);
          if (jsonStr.trim() === '[DONE]') continue;

          const eventData = JSON.parse(jsonStr);
          const { type, content } = eventData;

          if (
            pendingNewAssistantBlock &&
            ['final_answer_delta', 'agent_thought'].includes(type)
          ) {
            assistantContentId = uuidv4();
            const newAssistantPrompt: ChatContent = {
              type: 'Assistant',
              text: '',
              id: assistantContentId,
              steps: [],
            };

            store.dispatch(
              addPromptToChat({ chatId, content: newAssistantPrompt }),
            );
            store.dispatch(
              setAgentStreamState({
                updatingAiPromptId: assistantContentId,
              }),
            );
            pendingNewAssistantBlock = false;
            assistantTextBuffer = '';
          }

          if (type === 'input_request') {
            store.dispatch(
              setAgentStreamState({
                isWaitingForInput: true,
                inputPrompt: content.prompt,
                isLoading: false,
                isStreaming: false,
              }),
            );

            const promptDelta =
              makeSafeMarkdownSectionPrefix(assistantTextBuffer) +
              `❓ **${content.prompt}**\n`;

            store.dispatch(
              appendContentById({
                chatId,
                contentId: assistantContentId,
                textDelta: promptDelta,
              }),
            );
            assistantTextBuffer += promptDelta;

            const newHumanPrompt: ChatContent = {
              type: 'Human',
              text: '',
              id: uuidv4(),
            };
            store.dispatch(
              addPromptToChat({ chatId, content: newHumanPrompt }),
            );
            pendingNewAssistantBlock = true;
            continue;
          }

          if (type === 'final_answer_delta') {
            const safeDelta = normalizeDeltaForFenceSafety(
              assistantTextBuffer,
              content,
            );
            store.dispatch(
              appendContentById({
                chatId,
                contentId: assistantContentId,
                textDelta: safeDelta,
              }),
            );
            assistantTextBuffer += safeDelta;
            continue;
          }

          if (type === 'agent_thought') {
            const thoughtText =
              typeof content === 'string'
                ? stripKnownThoughtPrefix(content.trim())
                : '';

            if (thoughtText) {
              const thoughtDelta =
                makeSafeMarkdownSectionPrefix(assistantTextBuffer) +
                `**Thought:**\n${thoughtText}\n`;

              const safeThoughtDelta = normalizeDeltaForFenceSafety(
                assistantTextBuffer,
                thoughtDelta,
              );

              store.dispatch(
                appendContentById({
                  chatId,
                  contentId: assistantContentId,
                  textDelta: safeThoughtDelta,
                }),
              );
              assistantTextBuffer += safeThoughtDelta;
            }
            continue;
          }

          if (type === 'files_generated') {
            const files = content;
            if (files && Array.isArray(files) && files.length > 0) {
              const pendingEditorFile = files.find(
                file =>
                  typeof file?.name === 'string' &&
                  file.name.endsWith('_intermediate_editor.json'),
              );

              if (pendingEditorFile) {
                const pendingPayload = {
                  name: pendingEditorFile.name,
                  path: pendingEditorFile.path || '',
                  url: pendingEditorFile.url || pendingEditorFile.path || '',
                };

                localStorage.setItem(
                  IO_EDITOR_PENDING_KEY,
                  JSON.stringify(pendingPayload),
                );
                localStorage.setItem(IO_EDITOR_RETURN_KEY, `/chat/${chatId}`);

                const editorHint =
                  makeSafeMarkdownSectionPrefix(assistantTextBuffer) +
                  '🛠️ IO Editor file is ready. Auto-opening editor...\n';

                store.dispatch(
                  appendContentById({
                    chatId,
                    contentId: assistantContentId,
                    textDelta: editorHint,
                  }),
                );
                assistantTextBuffer += editorHint;

                if (
                  navigateToEditor &&
                  window.location.pathname !== ROUTES.Editor
                ) {
                  navigateToEditor();
                }
              }

              const prefix =
                makeSafeMarkdownSectionPrefix(assistantTextBuffer) +
                '**Generated Files:**\n';

              store.dispatch(
                appendContentById({
                  chatId,
                  contentId: assistantContentId,
                  textDelta: prefix,
                }),
              );
              assistantTextBuffer += prefix;

              const newAssets: ChatFile[] = [];
              for (const file of files) {
                const isImage = /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(
                  file.name,
                );
                const isCode =
                  /\.(txt|md|py|js|ts|tsx|c|cpp|h|hpp|java|go|rs|rb|php|html|css|sh|bat|ps1)$/i.test(
                    file.name,
                  );
                const isJson = /\.(json)$/i.test(file.name);
                const isConfig = /\.(yaml|yml|xml|ini|toml|conf)$/i.test(
                  file.name,
                );
                const isIl = /\.(il)$/i.test(file.name);

                const fileUrl = file.url || file.path;

                newAssets.push({
                  id: uuidv4(),
                  name: file.name,
                  url: fileUrl,
                  type: isImage
                    ? 'image'
                    : isJson
                    ? 'json'
                    : isIl
                    ? 'il'
                    : isConfig
                    ? 'config'
                    : isCode
                    ? 'code'
                    : 'unknown',
                  timestamp: Date.now(),
                });

                let fileMd = '';
                if (isImage) {
                  fileMd = `\n![${file.name}](${fileUrl})\n`;
                } else {
                  fileMd = `\n[Download ${file.name}](${fileUrl})\n`;
                }

                store.dispatch(
                  appendContentById({
                    chatId,
                    contentId: assistantContentId,
                    textDelta: fileMd,
                  }),
                );
                assistantTextBuffer += fileMd;
              }

              if (newAssets.length > 0) {
                store.dispatch(
                  addAssetsToContent({
                    chatId,
                    contentId: assistantContentId,
                    assets: newAssets,
                  }),
                );
              }
            }
            continue;
          }

          if (type === 'tool_result') {
            const resultText =
              typeof content === 'string'
                ? content
                : JSON.stringify(content, null, 2);

            const trimmedResult = resultText
              ? stripKnownExecutionPrefix(resultText.trim())
              : '';

            if (trimmedResult) {
              const resultDelta =
                makeSafeMarkdownSectionPrefix(assistantTextBuffer) +
                '**Execution logs:**\n' +
                `${trimmedResult}\n`;

              const safeResultDelta = normalizeDeltaForFenceSafety(
                assistantTextBuffer,
                resultDelta,
              );

              store.dispatch(
                appendContentById({
                  chatId,
                  contentId: assistantContentId,
                  textDelta: safeResultDelta,
                }),
              );
              assistantTextBuffer += safeResultDelta;
            }
            continue;
          }

          if (type === 'agent_error' && content) {
            const errorDelta =
              makeSafeMarkdownSectionPrefix(assistantTextBuffer) +
              `**Error:**\n${String(content)}\n`;

            store.dispatch(
              appendContentById({
                chatId,
                contentId: assistantContentId,
                textDelta: errorDelta,
              }),
            );
            assistantTextBuffer += errorDelta;
            continue;
          }

          if (type === 'status' && content) {
            const statusDelta =
              makeSafeMarkdownSectionPrefix(assistantTextBuffer) +
              `> ${String(content)}\n`;

            store.dispatch(
              appendContentById({
                chatId,
                contentId: assistantContentId,
                textDelta: statusDelta,
              }),
            );
            assistantTextBuffer += statusDelta;
          }
        } catch (error) {
          void error;
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }
    throw error;
  } finally {
    if (runId === streamRunId) {
      store.dispatch(
        setAgentStreamState({
          isLoading: false,
          isStreaming: false,
        }),
      );
      isGenerating = false;
    }
  }
};

export const submitAgentInput = async (value: string) => {
  await submitInput(value);
  store.dispatch(
    setAgentStreamState({
      isWaitingForInput: false,
      inputPrompt: '',
      isLoading: true,
      isStreaming: true,
    }),
  );
};

export const stopAgentStream = () => {
  streamRunId += 1;
  isGenerating = false;
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  store.dispatch(resetAgentStreamState());
};
