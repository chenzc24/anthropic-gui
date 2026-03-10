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
  appendMainTextById,
  addDetailBlockToContent,
} from '@/redux/conversations/conversationsSlice';
import { store } from '@/redux/store';
import { ChatContent, ChatFile, AssistantDetailBlock } from '@/typings/common';

const IO_EDITOR_PENDING_KEY = 'io_editor_pending_file';
const IO_EDITOR_RETURN_KEY = 'io_editor_return_path';
const IO_EDITOR_PENDING_UPDATED_EVENT = 'io-editor-pending-updated';
const TOOL_EVENT_START_MARKER = '<<<AMS_TOOL_EVENT_V1>>>';
const TOOL_EVENT_END_MARKER = '<<<AMS_TOOL_EVENT_END>>>';

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

const selectPreferredIntermediateFile = (files: any[]) => {
  const candidates = files.filter(
    file =>
      typeof file?.name === 'string' &&
      file.name.endsWith('_intermediate_editor.json'),
  );

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    const aCurrent = a?.is_current_turn === true ? 1 : 0;
    const bCurrent = b?.is_current_turn === true ? 1 : 0;
    if (aCurrent !== bCurrent) {
      return bCurrent - aCurrent;
    }

    const aNs = Number(a?.mtime_ns || 0);
    const bNs = Number(b?.mtime_ns || 0);
    if (aNs !== bNs) {
      return bNs - aNs;
    }

    const aTime = Number(a?.mtime || 0);
    const bTime = Number(b?.mtime || 0);
    return bTime - aTime;
  });

  return candidates[0];
};

interface StructuredToolEventPayload {
  marker?: string;
  tool?: string;
  event_type?: string;
  status?: string;
  summary?: string;
  extra?: Record<string, unknown>;
}

const getPayloadRawOutput = (payload: StructuredToolEventPayload): string => {
  const hideRawOutputInMain = payload.extra?.hide_raw_output_in_main === true;
  if (hideRawOutputInMain) {
    return '';
  }

  const maybeRawOutput = payload.extra?.raw_output;
  if (typeof maybeRawOutput !== 'string') {
    return '';
  }
  return maybeRawOutput.trim();
};

const getPayloadMainInfoLines = (
  payload: StructuredToolEventPayload,
): string[] => {
  const maybeLines = payload.extra?.main_info_lines;
  if (!Array.isArray(maybeLines)) {
    return [];
  }

  return maybeLines
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
};

const parseStructuredToolEvent = (
  rawText: string,
): {
  cleanedText: string;
  payload: StructuredToolEventPayload | null;
} => {
  if (!rawText) {
    return { cleanedText: '', payload: null };
  }

  const startIndex = rawText.indexOf(TOOL_EVENT_START_MARKER);
  const endIndex = rawText.indexOf(TOOL_EVENT_END_MARKER);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return { cleanedText: rawText, payload: null };
  }

  const jsonStart = startIndex + TOOL_EVENT_START_MARKER.length;
  const jsonRaw = rawText.slice(jsonStart, endIndex).trim();

  const cleanedText = (
    rawText.slice(0, startIndex) +
    rawText.slice(endIndex + TOOL_EVENT_END_MARKER.length)
  ).trim();

  try {
    const payload = JSON.parse(jsonRaw) as StructuredToolEventPayload;
    if (payload && payload.marker === 'AMS_TOOL_EVENT_V1') {
      return { cleanedText, payload };
    }
    return { cleanedText, payload: null };
  } catch {
    return { cleanedText, payload: null };
  }
};

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
  let assistantContentId = '';
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

    let assistantTextBuffer = '';
    let pendingNewAssistantBlock = false;
    let stepCounter = 1;
    let lastMainStepKey = '';
    let mainTitleAdded = false;

    const appendDetailBlock = (detail: Omit<AssistantDetailBlock, 'id'>) => {
      store.dispatch(
        addDetailBlockToContent({
          chatId,
          contentId: assistantContentId,
          detail: {
            ...detail,
            id: uuidv4(),
          },
        }),
      );
    };

    const appendMainToolEvent = (payload: StructuredToolEventPayload) => {
      const toolLabel = payload.tool || 'Tool';
      const status = payload.status || 'completed';
      const summary = payload.summary || 'Step completed.';
      const eventType = payload.event_type || 'tool_result';
      const rawOutput = getPayloadRawOutput(payload);
      const mainInfoLines = getPayloadMainInfoLines(payload);

      const dedupeKey = `${toolLabel}:${status}:${eventType}:${summary}:${rawOutput}:${mainInfoLines.join(
        '|',
      )}`;
      if (dedupeKey === lastMainStepKey) {
        return;
      }
      lastMainStepKey = dedupeKey;

      const statusIcon = status === 'failed' ? '❌' : '✅';

      let section = '';
      if (!mainTitleAdded) {
        section += '\n## Agent Workflow Highlights\n';
        mainTitleAdded = true;
      }

      section += `\n### ${statusIcon} Step ${stepCounter} · ${toolLabel}\n`;
      if (rawOutput) {
        section += '> ```text\n';
        for (const line of rawOutput.split(/\r?\n/)) {
          section += `> ${line}\n`;
        }
        section += '> ```\n';
      } else if (mainInfoLines.length > 0) {
        section += '> ```text\n';
        for (const line of mainInfoLines) {
          section += `> ${line}\n`;
        }
        section += '> ```\n';
      } else {
        section += `> **Type:** ${eventType}\n`;
        section += `> **Summary:** ${summary}\n`;
      }
      stepCounter += 1;

      store.dispatch(
        appendMainTextById({
          chatId,
          contentId: assistantContentId,
          textDelta: section,
        }),
      );
    };

    if (!isRegenerate) {
      assistantContentId = uuidv4();
      const newPrompt: ChatContent = {
        type: 'Assistant',
        text: '',
        id: assistantContentId,
        steps: [],
        messageVersion: 2,
        mainText: '',
        details: [],
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
          messageVersion: 2,
          mainText: '',
          details: [],
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
              messageVersion: 2,
              mainText: '',
              details: [],
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
            store.dispatch(
              appendMainTextById({
                chatId,
                contentId: assistantContentId,
                textDelta: promptDelta,
              }),
            );
            assistantTextBuffer += promptDelta;
            appendDetailBlock({
              type: 'input_request',
              content: String(content.prompt || ''),
              timestamp: Date.now(),
            });

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
              appendDetailBlock({
                type: 'agent_thought',
                content: thoughtText,
                timestamp: Date.now(),
              });
              assistantTextBuffer += safeThoughtDelta;
            }
            continue;
          }

          if (type === 'files_generated') {
            const files = content;
            if (files && Array.isArray(files) && files.length > 0) {
              appendDetailBlock({
                type: 'files_generated',
                content: '',
                files,
                timestamp: Date.now(),
              });

              const pendingEditorFile = selectPreferredIntermediateFile(files);

              if (pendingEditorFile) {
                const pendingPayload = {
                  name: pendingEditorFile.name,
                  path: pendingEditorFile.path || '',
                  url: pendingEditorFile.url || pendingEditorFile.path || '',
                  process_node:
                    pendingEditorFile.process_node ||
                    pendingEditorFile?.metadata?.process_node ||
                    null,
                };

                localStorage.setItem(
                  IO_EDITOR_PENDING_KEY,
                  JSON.stringify(pendingPayload),
                );
                localStorage.setItem(IO_EDITOR_RETURN_KEY, `/chat/${chatId}`);
                window.dispatchEvent(
                  new Event(IO_EDITOR_PENDING_UPDATED_EVENT),
                );

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
            const { cleanedText, payload } =
              parseStructuredToolEvent(resultText);

            const trimmedResult = cleanedText
              ? stripKnownExecutionPrefix(cleanedText.trim())
              : '';

            if (payload) {
              appendMainToolEvent(payload);
            }

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
              appendDetailBlock({
                type: 'tool_result',
                content: trimmedResult,
                timestamp: Date.now(),
              });
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
            appendDetailBlock({
              type: 'agent_error',
              content: String(content),
              timestamp: Date.now(),
            });
            assistantTextBuffer += errorDelta;
            continue;
          }

          if (type === 'status' && content) {
            continue;
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
