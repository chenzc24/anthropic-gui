import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useNavigate, useParams } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import { injectStyle } from 'react-toastify/dist/inject-style';
import 'react-toastify/dist/ReactToastify.css';
import { v4 as uuidv4 } from 'uuid';

import { NavigationContext } from '@/app/App';
import { ROUTES } from '@/app/router/constants/routes';
import { selectAgentStreamState } from '@/redux/agentStream/agentStream.selectors';
import { selectChatById } from '@/redux/conversations/conversations.selectors';
import {
  addPromptToChat,
  updateChatContents,
  updateContentById,
} from '@/redux/conversations/conversationsSlice';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { TreeItem, ChatContent, AgentStep } from '@/typings/common';
import { ButtonComponent } from '@/ui/ButtonComponent';
import { IconComponent } from '@/ui/IconComponent';

import { ChatFileDrawer } from './components/ChatFileDrawer';
import { EditablePrompt } from './components/EditablePrompt';
import {
  setEditorNavigationHandler,
  startAgentStream,
  stopAgentStream,
  submitAgentInput,
} from './services/agentStreamService';

import styles from './Chat.module.scss';

if (typeof window !== 'undefined') {
  injectStyle();
}

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

const hasMeaningfulText = (value?: string): boolean => {
  if (!value) return false;
  const normalized = value.trim();
  return !['', '{}', '[]', 'null', 'undefined', 'None'].includes(normalized);
};

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

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Submit failed. Please check backend status and retry.';
};

export const ChatSelected: React.FC = () => {
  const { id: chatId = '' } = useParams();

  const chat = useAppSelector(selectChatById(chatId));
  const streamState = useAppSelector(selectAgentStreamState);

  const navigate = useNavigate();

  const { didNewChatNavigate, setDidNewChatNavigate } =
    useContext(NavigationContext);

  const [hasSubmitted, setHasSubmitted] = useState(false);

  const updatingAiPromptId =
    streamState.activeChatId === chatId ? streamState.updatingAiPromptId : '';

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isActiveStream = streamState.activeChatId === chatId;
  const isStreaming = isActiveStream && streamState.isStreaming;
  const isWaitingForInput = isActiveStream && streamState.isWaitingForInput;
  const inputPrompt = isActiveStream ? streamState.inputPrompt : '';
  const isLoading = isActiveStream && streamState.isLoading;

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
    setEditorNavigationHandler(() => navigate(ROUTES.Editor));
    return () => {
      setEditorNavigationHandler(null);
    };
  }, [navigate]);

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
      if (streamState.isStreaming || streamState.isLoading) {
        return;
      }

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

      await startAgentStream({
        chatId: chat?.id || '',
        prompt: promptTexts.replace(/\s+$/, ''),
        isRegenerate,
        lastAssistantPromptId: lastAssistantPrompt?.id,
      });
    },
    [
      chat?.id,
      chat?.content,
      lastAssistantPrompt?.id,
      streamState.isLoading,
      streamState.isStreaming,
    ],
  );

  const handleRegenerate = useCallback(async () => {
    if (lastAssistantPrompt) {
      await generateResponse(true);
    }
  }, [generateResponse, lastAssistantPrompt]);

  const handlePromptSubmit = useCallback(async () => {
    if ((isLoading || isStreaming) && !isWaitingForInput) {
      return;
    }

    try {
      if (isWaitingForInput) {
        const pendingPrompt = chat?.content?.[chat.content.length - 1];
        const inputValue = pendingPrompt?.text || '';

        await submitAgentInput(inputValue);
      } else {
        await generateResponse();
      }
      setHasSubmitted(true);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [
    chat?.content,
    generateResponse,
    isLoading,
    isStreaming,
    isWaitingForInput,
  ]);

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
    stopAgentStream();
  }, []);

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
      <ToastContainer hideProgressBar position="bottom-center" />
    </div>
  );
};
