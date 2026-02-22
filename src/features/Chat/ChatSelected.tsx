import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

import { submitPrompt, submitInput } from '@/api/prompt.api';
import { NavigationContext } from '@/app/App';
import { ROUTES } from '@/app/router/constants/routes';
import {
  selectApiKey,
  selectApiMaxTokens,
  selectApiModel,
  selectApiTemperature,
  selectApiTopK,
  selectApiTopP,
} from '@/redux/apiSettings/apiSettings.selectors';
import { selectChatById } from '@/redux/conversations/conversations.selectors';
import {
  addPromptToChat,
  updateChatContents,
  updateContentById,
  appendContentById,
  addAssetsToContent,
} from '@/redux/conversations/conversationsSlice';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { TreeItem, ChatContent, AgentStep, ChatFile } from '@/typings/common';
import { ButtonComponent } from '@/ui/ButtonComponent';
import { IconComponent } from '@/ui/IconComponent';

import { ChatFileDrawer } from './components/ChatFileDrawer';
import { EditablePrompt } from './components/EditablePrompt';

import styles from './Chat.module.scss';

const findLastAssistantContent = (chat?: TreeItem): ChatContent | null => {
  if (!chat || !chat?.content) {
    return null;
  }

  for (let i = chat.content.length - 1; i >= 0; i--) {
    const content = chat.content[i];
    if (content.type === 'Assistant' && content.text.replace(/\n/g, '')) {
      return content;
    }
  }
  return null;
};

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

const hasMeaningfulText = (value?: string): boolean => {
  if (!value) return false;
  const normalized = value.trim();
  return !['', '{}', '[]', 'null', 'undefined', 'None'].includes(normalized);
};

const NARRATIVE_DELTA_REGEX =
  /^(Thought:|Observation:|Action:|Final Answer:|\*\*Generated Files:\*\*|\[Download\s|Config loaded successfully\.|The JSON structure seems|Validation passed\.|Schematic generation result:|Layout generation result:)/;

const stripKnownThoughtPrefix = (text: string): string =>
  text.replace(/^\s*(Thought:|\*\*Thought:\*\*)\s*/i, '');

const stripKnownExecutionPrefix = (text: string): string =>
  text.replace(/^\s*(Execution logs?:|\*\*Execution logs?:\*\*)\s*/i, '');

const parseFilesFromStep = (step: AgentStep): Array<any> => {
  if (Array.isArray(step.files)) {
    return step.files;
  }

  if (typeof step.files === 'string') {
    try {
      const parsed = JSON.parse(step.files);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {
      return [];
    }
  }

  return [];
};

const buildLegacyAssistantText = (steps?: AgentStep[]): string => {
  if (!steps || steps.length === 0) return '';

  const segments: string[] = [];

  for (const step of steps) {
    const content = typeof step.content === 'string' ? step.content.trim() : '';

    if (step.type === 'agent_thought' && content) {
      segments.push(`**Thought:**\n${stripKnownThoughtPrefix(content)}`);
    } else if (step.type === 'tool_result' && content) {
      segments.push(
        `**Execution logs:**\n${stripKnownExecutionPrefix(content)}`,
      );
    } else if (step.type === 'agent_error' && content) {
      segments.push(`**Error:**\n${content}`);
    } else if (step.type === 'status' && content) {
      segments.push(`> ${content}`);
    } else if (step.type === 'files_generated') {
      const files = parseFilesFromStep(step);
      if (files.length > 0) {
        const lines = files
          .map(file => {
            const name = file?.name || 'file';
            const url = file?.url || file?.path || '';
            return url ? `[Download ${name}](${url})` : '';
          })
          .filter(Boolean);

        if (lines.length > 0) {
          segments.push(`**Generated Files:**\n${lines.join('\n')}`);
        }
      }
    }
  }

  return segments.join('\n\n').trim();
};

const getRenderableAssistantText = (contentItem: ChatContent): string => {
  if (hasMeaningfulText(contentItem.text)) {
    return contentItem.text;
  }

  return buildLegacyAssistantText(contentItem.steps);
};

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

export const ChatSelected: React.FC = () => {
  const { id: chatId = '' } = useParams();

  const chat = useAppSelector(selectChatById(chatId));

  const navigate = useNavigate();

  const abortControllerRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef(false);
  const streamRunIdRef = useRef(0);

  const { didNewChatNavigate, setDidNewChatNavigate } =
    useContext(NavigationContext);

  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [updatingAiPromptId, setUpdatingAiPromptId] = useState('');

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaitingForInput, setIsWaitingForInput] = useState(false);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const apiKey = useSelector(selectApiKey);
  const model = useSelector(selectApiModel);
  const temperature = useSelector(selectApiTemperature);
  const maxTokens = useSelector(selectApiMaxTokens);
  const topK = useSelector(selectApiTopK);
  const topP = useSelector(selectApiTopP);

  const dispatch = useAppDispatch();

  const lastAssistantPrompt = useMemo(
    () => findLastAssistantContent(chat),
    [chat],
  );

  useEffect(() => {
    if (!chat) {
      return navigate(ROUTES.Home);
    }
  }, [chat, navigate]);

  const addPromptRow = useCallback(
    (promptType = '') =>
      () => {
        const newPromptType =
          promptType ||
          (chat?.content?.[chat.content.length - 1]?.type === 'Human'
            ? 'Assistant'
            : 'Human');

        const newPrompt: ChatContent = {
          type: newPromptType as 'Human' | 'Assistant',
          text: '',
          id: uuidv4(),
        };

        dispatch(
          addPromptToChat({ chatId: chat?.id || '', content: newPrompt }),
        );
      },
    [chat?.content, chat?.id, dispatch],
  );

  const deletePromptRow = useCallback(
    (id: string) => () => {
      if (chat?.content?.length === 1) {
        return;
      }

      if (chat?.content) {
        const index = chat?.content?.findIndex(prompt => prompt.id === id);

        if (index !== -1) {
          const newPrompts = [...chat.content];
          newPrompts.splice(index, 1);

          dispatch(
            updateChatContents({
              chatId: chat?.id || '',
              contents: newPrompts,
            }),
          );
        }
      }
    },
    [chat?.content, chat?.id, dispatch],
  );

  const generateResponse = useCallback(
    async (isRegenerate?: boolean) => {
      if (isGeneratingRef.current) {
        return;
      }

      isGeneratingRef.current = true;
      const runId = ++streamRunIdRef.current;

      setIsLoading(true);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const newAbortController = new AbortController();
      const signal = newAbortController.signal;
      abortControllerRef.current = newAbortController;

      const chatContent =
        isRegenerate &&
        chat?.content?.length &&
        lastAssistantPrompt?.id !== undefined
          ? chat.content.slice(
              0,
              chat.content.findIndex(
                content => content.id === lastAssistantPrompt.id,
              ),
            )
          : chat?.content;

      const normalizedChatContent =
        chatContent
          ?.map(contentItem => {
            if (contentItem.type !== 'Assistant') {
              return contentItem;
            }

            const fallbackText = getRenderableAssistantText(contentItem);
            return {
              ...contentItem,
              text: fallbackText || contentItem.text,
            };
          })
          .filter(contentItem => hasMeaningfulText(contentItem.text)) || [];

      let promptTexts = normalizedChatContent.length
        ? normalizedChatContent
            .map(prompt => {
              const type = prompt?.type;
              const promptText = prompt?.text.trim();

              return `\n\n${type}: ${promptText}`;
            })
            .join('')
        : '\n\nHuman: \n\nAssistant:';

      if (
        normalizedChatContent.length &&
        (normalizedChatContent[normalizedChatContent.length - 1]?.type ===
          'Human' ||
          normalizedChatContent[normalizedChatContent.length - 1]?.text.trim()
            .length)
      ) {
        promptTexts += '\n\nAssistant:';
      }

      if (
        normalizedChatContent.length &&
        normalizedChatContent[0]?.type === 'Assistant'
      ) {
        promptTexts = '\n\nHuman: ' + promptTexts;
      }

      const requestBody = {
        model,
        temperature,
        topK,
        topP,
        apiKey,
        maxTokens,
        prompt: promptTexts.replace(/\s+$/, ''),
        signal,
      };

      try {
        const response = await submitPrompt(requestBody);
        if (response?.ok) {
          setIsStreaming(true);
          const reader = response?.body?.getReader();
          const decoder = new TextDecoder('utf-8');

          let newPrompt: ChatContent | undefined;
          let assistantContentId = '';

          // Initialize Assistant Message
          if (!isRegenerate) {
            assistantContentId = uuidv4();
            newPrompt = {
              type: 'Assistant',
              text: '',
              id: assistantContentId,
              steps: [],
            };
            dispatch(
              addPromptToChat({ chatId: chat?.id || '', content: newPrompt }),
            );
          } else {
            assistantContentId = lastAssistantPrompt?.id || '';
          }

          setUpdatingAiPromptId(assistantContentId);

          let buffer = '';
          let assistantTextBuffer = '';
          let pendingNewAssistantBlock = false; // Flag to create new block after input

          while (true) {
            if (runId !== streamRunIdRef.current) {
              break;
            }

            const res = await reader?.read();
            if (res?.done) break;

            buffer += decoder.decode(res?.value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || ''; // Keep incomplete part

            for (const block of lines) {
              if (runId !== streamRunIdRef.current) {
                break;
              }

              const dataLine = block
                .split('\n')
                .find(l => l.startsWith('data: '));

              if (dataLine) {
                try {
                  const jsonStr = dataLine.substring(6);
                  if (jsonStr.trim() === '[DONE]') continue;

                  const eventData = JSON.parse(jsonStr);
                  const { type, content } = eventData;

                  // If we need a new block and we are receiving content (not just status/ping)
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
                    dispatch(
                      addPromptToChat({
                        chatId: chat?.id || '',
                        content: newAssistantPrompt,
                      }),
                    );
                    setUpdatingAiPromptId(assistantContentId);
                    pendingNewAssistantBlock = false;
                    assistantTextBuffer = ''; // Reset tracking for new message bubble
                  }

                  if (type === 'input_request') {
                    setIsWaitingForInput(true);
                    setInputPrompt(content.prompt);
                    setIsLoading(false);
                    setIsStreaming(false); // Pause streaming UI to show input box

                    const safePrefix =
                      makeSafeMarkdownSectionPrefix(assistantTextBuffer);
                    const promptDelta = `${safePrefix}❓ **${content.prompt}**\n`;

                    // 1. Show the question in the chat
                    dispatch(
                      appendContentById({
                        chatId: chat?.id || '',
                        contentId: assistantContentId,
                        textDelta: promptDelta,
                      }),
                    );
                    assistantTextBuffer += promptDelta;

                    // 2. Automatically add a Human row for answer
                    addPromptRow('Human')();

                    // 3. Flag that next content should go to a NEW assistant block
                    pendingNewAssistantBlock = true;
                  } else if (type === 'final_answer_delta') {
                    // Update main text
                    const safeDelta = normalizeDeltaForFenceSafety(
                      assistantTextBuffer,
                      content,
                    );

                    dispatch(
                      appendContentById({
                        chatId: chat?.id || '',
                        contentId: assistantContentId,
                        textDelta: safeDelta,
                      }),
                    );
                    assistantTextBuffer += safeDelta;
                  } else if (
                    [
                      'agent_thought',
                      'tool_call',
                      'tool_result',
                      'agent_error',
                      'files_generated',
                      'status',
                      'final_answer_done',
                    ].includes(type)
                  ) {
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

                        dispatch(
                          appendContentById({
                            chatId: chat?.id || '',
                            contentId: assistantContentId,
                            textDelta: safeThoughtDelta,
                          }),
                        );
                        assistantTextBuffer += safeThoughtDelta;
                      }
                    }

                    if (type === 'files_generated') {
                      // Format files list as Markdown and append to main text
                      const files = content;
                      if (files && Array.isArray(files) && files.length > 0) {
                        const prefix =
                          makeSafeMarkdownSectionPrefix(assistantTextBuffer) +
                          '**Generated Files:**\n';

                        dispatch(
                          appendContentById({
                            chatId: chat?.id || '',
                            contentId: assistantContentId,
                            textDelta: prefix,
                          }),
                        );
                        assistantTextBuffer += prefix;

                        const newAssets: ChatFile[] = [];

                        for (const file of files) {
                          const isImage =
                            /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file.name);
                          const isCode =
                            /\.(txt|md|py|js|ts|tsx|c|cpp|h|hpp|java|go|rs|rb|php|html|css|sh|bat|ps1)$/i.test(
                              file.name,
                            );
                          const isJson = /\.(json)$/i.test(file.name);
                          const isConfig =
                            /\.(yaml|yml|xml|ini|toml|conf)$/i.test(file.name);
                          const isIl = /\.(il)$/i.test(file.name);

                          const fileUrl = file.url || file.path;

                          // Push to assets list
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
                            // Changed structure to be more explicit and robust
                            fileMd = `\n[Download ${file.name}](${fileUrl})\n`;
                          }
                          dispatch(
                            appendContentById({
                              chatId: chat?.id || '',
                              contentId: assistantContentId,
                              textDelta: fileMd,
                            }),
                          );
                          assistantTextBuffer += fileMd;
                        }

                        if (newAssets.length > 0) {
                          dispatch(
                            addAssetsToContent({
                              chatId: chat?.id || '',
                              contentId: assistantContentId,
                              assets: newAssets,
                            }),
                          );
                        }
                      }
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

                        dispatch(
                          appendContentById({
                            chatId: chat?.id || '',
                            contentId: assistantContentId,
                            textDelta: safeResultDelta,
                          }),
                        );
                        assistantTextBuffer += safeResultDelta;
                      }
                    }

                    if (type === 'status' && typeof content === 'string') {
                      const trimmedStatus = content.trim();
                      if (trimmedStatus) {
                        const statusDelta =
                          makeSafeMarkdownSectionPrefix(assistantTextBuffer) +
                          `> ${trimmedStatus}\n`;

                        const safeStatusDelta = normalizeDeltaForFenceSafety(
                          assistantTextBuffer,
                          statusDelta,
                        );

                        dispatch(
                          appendContentById({
                            chatId: chat?.id || '',
                            contentId: assistantContentId,
                            textDelta: safeStatusDelta,
                          }),
                        );
                        assistantTextBuffer += safeStatusDelta;
                      }
                    }

                    if (
                      type === 'final_answer_done' &&
                      typeof content === 'string'
                    ) {
                      const doneText = content.trim();
                      if (doneText) {
                        const doneDelta = normalizeDeltaForFenceSafety(
                          assistantTextBuffer,
                          makeSafeMarkdownSectionPrefix(assistantTextBuffer) +
                            doneText +
                            '\n',
                        );

                        dispatch(
                          appendContentById({
                            chatId: chat?.id || '',
                            contentId: assistantContentId,
                            textDelta: doneDelta,
                          }),
                        );
                        assistantTextBuffer += doneDelta;
                      }
                    }
                  }
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.error('Error parsing SSE', e);
                }
              }
            }
          }

          // Legacy Loop Replacement End
        } else {
          // eslint-disable-next-line no-console
          console.error('Error: ' + response?.statusText);
          setIsStreaming(false);
          setIsLoading(false);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('error', error);
      } finally {
        if (runId === streamRunIdRef.current) {
          setIsLoading(false);
          setIsStreaming(false);
          isGeneratingRef.current = false;
        }
      }
    },
    [
      addPromptRow,
      apiKey,
      chat?.id,
      dispatch,
      maxTokens,
      model,
      temperature,
      topK,
      topP,
      chat?.content,
      lastAssistantPrompt?.id,
    ],
  );

  const handleRegenerate = useCallback(async () => {
    if (lastAssistantPrompt) {
      await generateResponse(true);
    }
  }, [generateResponse, lastAssistantPrompt]);

  const handlePromptSubmit = useCallback(async () => {
    if (isGeneratingRef.current && !isWaitingForInput) {
      return;
    }

    if (isWaitingForInput) {
      // Find the pending user prompt content
      const pendingPrompt = chat?.content?.[chat.content.length - 1];
      const inputValue = pendingPrompt?.text || '';

      await submitInput(inputValue);

      // Reset state
      setIsWaitingForInput(false);
      setInputPrompt('');

      // Resume streaming UI
      setIsLoading(true);
      setIsStreaming(true);

      // Re-connect to SSE stream isn't needed as backend keeps it open?
      // Actually backend thread blocks, but frontend connection might have closed if fetch finished?
      // Wait, in `generateResponse`, the fetch only finishes when reader is done.
      // If backend blocks on `input_event.wait()`, it doesn't close the stream.
      // So the `reader.read()` loop is still active, just waiting for data.
      // So we don't need to do anything here except sending the input!
      // But wait, user needs to type into the prompt box.
      // The prompt box updates Redux/State `chat.content`.
    } else {
      await generateResponse();
    }
    setHasSubmitted(true);
  }, [generateResponse, isWaitingForInput, chat?.content]);

  useEffect(() => {
    if (didNewChatNavigate && !hasSubmitted) {
      handlePromptSubmit();
      setDidNewChatNavigate(false);
    }
  }, [
    didNewChatNavigate,
    handlePromptSubmit,
    setDidNewChatNavigate,
    hasSubmitted,
  ]);

  const handlePromptBlur = (id: string, text: string) => {
    dispatch(
      updateContentById({
        chatId: chat?.id || '',
        contentId: id,
        text,
      }),
    );
  };

  const stopStream = useCallback(() => {
    setIsStreaming(false);
    isGeneratingRef.current = false;
    streamRunIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      stopStream();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => stopStream, [chatId]);

  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    const containerElement = containerRef.current;

    const handleScroll = () => {
      if (!containerElement) return;

      const { scrollTop, scrollHeight, clientHeight } = containerElement;
      const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight;
      setIsScrolledToBottom(isAtBottom);
    };

    if (containerElement) {
      containerElement.addEventListener('scroll', handleScroll);
    }

    return () => {
      if (containerElement) {
        containerElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (container) {
      const scrollToBottom = () => {
        container.scrollTop = container.scrollHeight;
      };

      observerRef.current = new MutationObserver(() => {
        if (isScrolledToBottom) {
          scrollToBottom();
        }
      });

      observerRef.current.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    return () => observerRef.current?.disconnect();
  }, [isScrolledToBottom]);

  const deleteDisabled = useMemo(
    () => chat?.content?.length === 1,
    [chat?.content],
  );

  const visibleContent = useMemo(
    () =>
      chat?.content?.filter((contentItem, index, allItems) => {
        const isLast = index === allItems.length - 1;

        if (contentItem.type !== 'Assistant') {
          return hasMeaningfulText(contentItem.text) || isLast;
        }

        if (
          contentItem.id === updatingAiPromptId &&
          (isStreaming || isLoading)
        ) {
          return true;
        }

        return hasMeaningfulText(getRenderableAssistantText(contentItem));
      }) || [],
    [chat?.content, updatingAiPromptId, isStreaming, isLoading],
  );

  return (
    <div className={styles.chatGeneralContainer}>
      <div className={styles.messagesScrollable} ref={containerRef}>
        {visibleContent.map(contentItem => (
          <div className={styles.chatPromptContainer} key={contentItem.id}>
            <EditablePrompt
              id={contentItem.id}
              text={
                contentItem.type === 'Assistant'
                  ? getRenderableAssistantText(contentItem)
                  : contentItem.text
              }
              deletePromptRow={deletePromptRow}
              type={contentItem.type}
              handlePromptBlur={handlePromptBlur}
              readOnly={updatingAiPromptId === contentItem.id && isStreaming}
              deleteDisabled={deleteDisabled}
            />
          </div>
        ))}
      </div>
      <div className={styles.chatButtonsContainer}>
        <div>
          <div className={styles.buttonsColumn}>
            {isWaitingForInput && inputPrompt && (
              <div
                style={{
                  marginBottom: '8px',
                  fontStyle: 'italic',
                  maxWidth: '300px',
                }}
              >
                {inputPrompt}
              </div>
            )}
            <button
              onClick={addPromptRow()}
              className={styles.buttonAddChat}
              disabled={isStreaming || isLoading}
            >
              <IconComponent type="plus" className={styles.iconPlus} />
            </button>
            {!isStreaming ? (
              <ButtonComponent
                type="submit"
                variant={isWaitingForInput ? 'outlined' : 'contained'}
                onClick={handlePromptSubmit}
                disabled={isLoading}
              >
                <span>{isWaitingForInput ? 'Submit Input' : 'Submit'}</span>
                {isWaitingForInput ? (
                  <IconComponent type="confirm" />
                ) : (
                  <IconComponent type="submit" />
                )}
              </ButtonComponent>
            ) : (
              <ButtonComponent variant="outlined" onClick={stopStream}>
                <span>Stop</span>
                <IconComponent className={styles.iconRegenerate} type="stop" />
              </ButtonComponent>
            )}
          </div>
          <div className={styles.buttonsColumn}>
            <ButtonComponent
              type="submit"
              variant="outlined"
              onClick={handleRegenerate}
              disabled={isStreaming || !lastAssistantPrompt || isLoading}
            >
              <span>Regenerate</span>
              <IconComponent
                className={styles.iconRegenerate}
                type="regenerate"
              />
            </ButtonComponent>

            <ButtonComponent
              type="button"
              variant="outlined"
              onClick={() => setIsDrawerOpen(true)}
              style={{ marginLeft: 8 }}
            >
              <span>Files</span>
              <IconComponent
                className={styles.iconRegenerate}
                type="newFolder"
              />
            </ButtonComponent>
          </div>
        </div>
      </div>
      <ChatFileDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        chatContent={chat?.content}
      />
    </div>
  );
};
