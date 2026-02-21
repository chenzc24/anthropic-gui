import React, {
  ChangeEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import InputAdornment from '@mui/material/InputAdornment';
import classNames from 'classnames';
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
  renameChatTreeItem,
  updateChatContents,
  updateContentById,
  appendContentById,
  addStepToContent,
} from '@/redux/conversations/conversationsSlice';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { TreeItem, ChatContent, AgentStep } from '@/typings/common';
import { ButtonComponent } from '@/ui/ButtonComponent';
import { IconComponent } from '@/ui/IconComponent';
import { TextFieldComponent } from '@/ui/TextFieldComponent';

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

export const ChatSelected: React.FC = () => {
  const { id: chatId = '' } = useParams();

  const chat = useAppSelector(selectChatById(chatId));

  const navigate = useNavigate();

  const abortControllerRef = useRef<AbortController | null>(null);

  const { didNewChatNavigate, setDidNewChatNavigate } =
    useContext(NavigationContext);

  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [conversationName, setConversationName] = useState(chat?.name ?? '');

  const [updatingAiPromptId, setUpdatingAiPromptId] = useState('');

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

  useEffect(() => {
    if (chat?.name) {
      setConversationName(chat?.name);
    }
  }, [chatId, chat?.name]);

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
      setIsLoading(true);
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

      let promptTexts = chatContent?.length
        ? chatContent
            .map(prompt => {
              const type = prompt?.type;
              const promptText = prompt?.text.trim();

              return `\n\n${type}: ${promptText}`;
            })
            .join('')
        : '\n\nHuman: \n\nAssistant:';

      if (
        chatContent?.length &&
        (chatContent[chatContent?.length - 1]?.type === 'Human' ||
          chatContent[chatContent?.length - 1]?.text.trim().length)
      ) {
        promptTexts += '\n\nAssistant:';
      }

      if (chatContent?.length && chatContent[0]?.type === 'Assistant') {
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
          let pendingNewAssistantBlock = false; // Flag to create new block after input

          while (true) {
            const res = await reader?.read();
            if (res?.done) break;

            buffer += decoder.decode(res?.value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || ''; // Keep incomplete part

            for (const block of lines) {
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
                    [
                      'final_answer_delta',
                      'agent_thought',
                      'tool_call',
                    ].includes(type)
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
                  }

                  if (type === 'input_request') {
                    setIsWaitingForInput(true);
                    setInputPrompt(content.prompt);
                    setIsLoading(false);
                    setIsStreaming(false); // Pause streaming UI to show input box

                    // 1. Show the question in the chat
                    dispatch(
                      appendContentById({
                        chatId: chat?.id || '',
                        contentId: assistantContentId,
                        textDelta: `\n\n❓ **${content.prompt}**\n`,
                      }),
                    );

                    // 2. Automatically add a Human row for answer
                    addPromptRow('Human')();

                    // 3. Flag that next content should go to a NEW assistant block
                    pendingNewAssistantBlock = true;
                  } else if (type === 'final_answer_delta') {
                    // Update main text
                    dispatch(
                      appendContentById({
                        chatId: chat?.id || '',
                        contentId: assistantContentId,
                        textDelta: content,
                      }),
                    );
                  } else if (
                    [
                      'agent_thought',
                      'tool_call',
                      'tool_result',
                      'agent_error',
                      'files_generated',
                      'status',
                    ].includes(type)
                  ) {
                    if (type === 'files_generated') {
                      // Format files list as Markdown and append to main text
                      const files = content;
                      if (files && Array.isArray(files) && files.length > 0) {
                        dispatch(
                          appendContentById({
                            chatId: chat?.id || '',
                            contentId: assistantContentId,
                            textDelta: '\n\n**Generated Files:**\n',
                          }),
                        );

                        for (const file of files) {
                          const isImage = /\.(png|jpg|jpeg|gif)$/i.test(
                            file.name,
                          );
                          let fileMd = '';
                          if (isImage) {
                            fileMd = `\n![${file.name}](${file.path})\n`;
                          } else {
                            fileMd = `\n[${file.name}](${file.path})\n`;
                          }
                          dispatch(
                            appendContentById({
                              chatId: chat?.id || '',
                              contentId: assistantContentId,
                              textDelta: fileMd,
                            }),
                          );
                        }
                      }
                    }

                    // Dispatch structural step
                    const step: AgentStep = {
                      id: uuidv4(),
                      type: type as any,
                      content:
                        typeof content === 'string'
                          ? content
                          : JSON.stringify(content),
                      toolName: content?.name,
                      toolArgs: content?.arguments,
                      status: type === 'agent_error' ? 'error' : 'success',
                      files: type === 'files_generated' ? content : undefined,
                    };

                    dispatch(
                      addStepToContent({
                        chatId: chat?.id || '',
                        contentId: assistantContentId,
                        step,
                      }),
                    );
                  }
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.error('Error parsing SSE', e);
                }
              }
            }
          }

          // Legacy Loop Replacement End
          if (!isRegenerate) {
            addPromptRow('Human')();
          }
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
        setIsLoading(false);
        setIsStreaming(false);
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

  const onSuccessGhangeChatName = useCallback(() => {
    if (conversationName) {
      setConversationName(conversationName.trim());

      dispatch(
        renameChatTreeItem({
          chatTreeId: chat?.id || '',
          chatTreeName: conversationName.trim(),
        }),
      );
    }
  }, [dispatch, conversationName, chat?.id]);

  const onCancelGhangeChatName = useCallback(() => {
    setConversationName(chat?.name || '');
  }, [setConversationName, chat?.name]);

  const onGhangeConversationName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setConversationName(event.target.value);
    },
    [setConversationName],
  );

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

  return (
    <div className={styles.chatGeneralContainer} ref={containerRef}>
      <div className={styles.conversationName}>
        <TextFieldComponent
          value={conversationName}
          onChange={onGhangeConversationName}
          fullWidth
          autoComplete="off"
          InputProps={{
            endAdornment: (
              <div
                className={classNames(styles.confirmationRename, {
                  [styles.edited]: chat?.name !== conversationName,
                })}
              >
                <InputAdornment
                  position="end"
                  onClick={onSuccessGhangeChatName}
                >
                  <IconComponent type="confirm" />
                </InputAdornment>
                <InputAdornment position="end" onClick={onCancelGhangeChatName}>
                  <IconComponent type="cancel" />
                </InputAdornment>
              </div>
            ),
          }}
        />
      </div>
      {chat?.content?.map(({ text, type, id }) => (
        <div className={styles.chatPromptContainer} key={id}>
          <EditablePrompt
            id={id}
            text={text}
            deletePromptRow={deletePromptRow}
            type={type}
            handlePromptBlur={handlePromptBlur}
            readOnly={updatingAiPromptId === id && isStreaming}
            deleteDisabled={deleteDisabled}
          />
        </div>
      ))}
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
          </div>
        </div>
      </div>
    </div>
  );
};
