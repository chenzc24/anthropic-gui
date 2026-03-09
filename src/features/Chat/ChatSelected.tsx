import React, {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Download, Paperclip, Upload } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import { injectStyle } from 'react-toastify/dist/inject-style';
import 'react-toastify/dist/ReactToastify.css';
import { v4 as uuidv4 } from 'uuid';

import { uploadFile } from '@/api/files.api';
import { NavigationContext } from '@/app/App';
import { ROUTES } from '@/app/router/constants/routes';
import { selectAgentStreamState } from '@/redux/agentStream/agentStream.selectors';
import { selectChatById } from '@/redux/conversations/conversations.selectors';
import {
  addHumanAttachmentsToContent,
  addPromptToChat,
  updateContentById,
} from '@/redux/conversations/conversationsSlice';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { ChatAttachment, ChatContent, AgentStep } from '@/typings/common';
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
  if (contentItem.messageVersion === 2) {
    return contentItem.mainText || '';
  }

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

const detectAttachmentCategory = (name: string, mime?: string) => {
  if (mime?.startsWith('image/')) return 'image';
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.json')) return 'json';
  if (/(\.txt|\.md|\.log)$/i.test(lower)) return 'text';
  if (
    /(\.py|\.js|\.ts|\.tsx|\.jsx|\.c|\.cpp|\.h|\.java|\.go|\.rs|\.sh|\.css|\.html)$/i.test(
      lower,
    )
  ) {
    return 'code';
  }
  return 'other';
};

const buildAttachmentPromptText = (attachments?: ChatAttachment[]): string =>
  (attachments || [])
    .map(item => `[File: ${item.name} (Path: ${item.path})]`)
    .join('\n');

const buildPromptTextWithAttachments = (
  value: string,
  attachments?: ChatAttachment[],
): string => {
  const normalizedValue = value.trim();
  const attachmentText = buildAttachmentPromptText(attachments);

  if (normalizedValue && attachmentText) {
    return `${normalizedValue}\n\n${attachmentText}`;
  }

  return normalizedValue || attachmentText;
};

const normalizeClientFileUrl = (rawUrl?: string): string => {
  const normalized = (rawUrl || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('/')) return normalized;
  if (normalized.startsWith('./')) return `/${normalized.slice(2)}`;
  return `/${normalized}`;
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

  const [composerText, setComposerText] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<
    ChatAttachment[]
  >([]);
  const composerAttachmentsRef = useRef<ChatAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeComposerTextarea = useCallback(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 46), 180);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 180 ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    resizeComposerTextarea();
  }, [composerText, resizeComposerTextarea]);

  const generateResponse = useCallback(
    async (appendedHumanPrompt?: ChatContent) => {
      if (streamState.isStreaming || streamState.isLoading) {
        return;
      }

      const chatContent = chat?.content;

      const effectiveChatContent = appendedHumanPrompt
        ? [...(chatContent || []), appendedHumanPrompt]
        : chatContent;

      const normalizedChatContent =
        effectiveChatContent
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
          .filter(contentItem => {
            if (
              contentItem.type === 'Human' &&
              contentItem.humanAttachments?.length
            ) {
              return true;
            }

            return hasMeaningfulText(contentItem.text);
          }) || [];

      let promptTexts = normalizedChatContent.length
        ? normalizedChatContent
            .map(prompt => {
              const type = prompt?.type;
              const promptText =
                prompt.type === 'Human'
                  ? buildPromptTextWithAttachments(
                      prompt.text,
                      prompt.humanAttachments,
                    )
                  : prompt.text.trim();

              return `\n\n${type}: ${promptText}`;
            })
            .join('')
        : '\n\nHuman: \n\nAssistant:';

      if (
        normalizedChatContent.length &&
        (normalizedChatContent[normalizedChatContent.length - 1]?.type ===
          'Human' ||
          buildPromptTextWithAttachments(
            normalizedChatContent[normalizedChatContent.length - 1]?.text || '',
            normalizedChatContent[normalizedChatContent.length - 1]
              ?.humanAttachments,
          ).length)
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
      });
    },
    [chat?.id, chat?.content, streamState.isLoading, streamState.isStreaming],
  );

  const resetComposer = useCallback(() => {
    setComposerText('');
    setComposerAttachments([]);
    composerAttachmentsRef.current = [];
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const triggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const removeComposerAttachment = useCallback((attachmentId: string) => {
    setComposerAttachments(prev => {
      const next = prev.filter(item => item.id !== attachmentId);
      composerAttachmentsRef.current = next;
      return next;
    });
  }, []);

  const downloadComposerAttachment = useCallback(
    (url: string, name: string) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [],
  );

  const handleComposerUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;

      setIsUploading(true);
      try {
        const uploadedAttachments: ChatAttachment[] = [];

        for (const file of files) {
          const fileInfo = await uploadFile(file);
          const name = fileInfo.filename || file.name;
          const path = fileInfo.filepath || '';
          const url = normalizeClientFileUrl(fileInfo.url || path);

          uploadedAttachments.push({
            id: uuidv4(),
            name,
            path,
            url,
            mimeType: file.type || undefined,
            category: detectAttachmentCategory(name, file.type) as
              | 'image'
              | 'text'
              | 'code'
              | 'csv'
              | 'json'
              | 'other',
            size: file.size,
            timestamp: Date.now(),
          });
        }

        setComposerAttachments(prev => {
          const next = [...prev, ...uploadedAttachments];
          composerAttachmentsRef.current = next;
          return next;
        });
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  const handlePromptSubmit = useCallback(async () => {
    if (isUploading) {
      return;
    }

    if ((isLoading || isStreaming) && !isWaitingForInput) {
      return;
    }

    const composerValue = composerText.trim();
    const submittedAttachments = [...composerAttachmentsRef.current];
    const valueForAgent = buildPromptTextWithAttachments(
      composerValue,
      submittedAttachments,
    );

    if (
      !hasMeaningfulText(composerValue) &&
      submittedAttachments.length === 0
    ) {
      return;
    }

    try {
      if (isWaitingForInput) {
        const pendingPrompt = chat?.content?.[chat.content.length - 1];

        if (pendingPrompt?.id) {
          dispatch(
            updateContentById({
              chatId: chat?.id || '',
              contentId: pendingPrompt.id,
              text: composerValue,
            }),
          );

          if (submittedAttachments.length > 0) {
            dispatch(
              addHumanAttachmentsToContent({
                chatId: chat?.id || '',
                contentId: pendingPrompt.id,
                attachments: submittedAttachments,
              }),
            );
          }
        }

        resetComposer();
        await submitAgentInput(valueForAgent);
      } else {
        const newHumanPrompt: ChatContent = {
          type: 'Human',
          text: composerValue,
          id: uuidv4(),
          humanAttachments: submittedAttachments,
        };

        dispatch(
          addPromptToChat({
            chatId: chat?.id || '',
            content: newHumanPrompt,
          }),
        );

        resetComposer();
        await generateResponse(newHumanPrompt);
      }

      setHasSubmitted(true);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [
    chat?.content,
    chat?.id,
    composerText,
    dispatch,
    generateResponse,
    isUploading,
    isLoading,
    isStreaming,
    isWaitingForInput,
    resetComposer,
  ]);

  useEffect(() => {
    if (didNewChatNavigate && !hasSubmitted) {
      generateResponse();
      setHasSubmitted(true);
      setDidNewChatNavigate(false);
    }
  }, [
    didNewChatNavigate,
    generateResponse,
    setDidNewChatNavigate,
    hasSubmitted,
  ]);

  const handlePromptBlur = useCallback(() => {}, []);

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

  const onComposerKeyDown = useCallback(
    async (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        await handlePromptSubmit();
      }
    },
    [handlePromptSubmit],
  );

  const onComposerChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setComposerText(event.target.value);
  };

  const visibleContent = useMemo(
    () =>
      chat?.content?.filter((contentItem, index, allItems) => {
        const isLast = index === allItems.length - 1;

        if (contentItem.type !== 'Assistant') {
          const hasAttachments =
            Array.isArray(contentItem.humanAttachments) &&
            contentItem.humanAttachments.length > 0;
          return (
            hasMeaningfulText(contentItem.text) || hasAttachments || isLast
          );
        }

        if (
          contentItem.id === updatingAiPromptId &&
          (isStreaming || isLoading)
        ) {
          return true;
        }

        if (
          contentItem.messageVersion === 2 &&
          Array.isArray(contentItem.details) &&
          contentItem.details.length > 0
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
              fullReasoningText={
                contentItem.type === 'Assistant' ? contentItem.text : undefined
              }
              messageVersion={contentItem.messageVersion}
              mainText={contentItem.mainText}
              details={contentItem.details}
              humanAttachments={contentItem.humanAttachments}
              deletePromptRow={() => () => {}}
              type={contentItem.type}
              handlePromptBlur={handlePromptBlur}
              readOnly
              hideActions
              hideHumanUpload
              displayOnlyHuman={contentItem.type === 'Human'}
              deleteDisabled
            />
          </div>
        ))}
      </div>
      <div className={styles.chatFooter}>
        {isWaitingForInput && inputPrompt && (
          <div className={styles.waitingPrompt}>{inputPrompt}</div>
        )}

        {!!composerAttachments.length && (
          <div className={styles.attachmentPillRow}>
            {composerAttachments.map(item => (
              <div className={styles.attachmentPill} key={item.id}>
                <a
                  href={normalizeClientFileUrl(item.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.attachmentPillLink}
                  title={item.name}
                >
                  <Paperclip size={14} />
                  <span className={styles.attachmentPillName}>{item.name}</span>
                </a>
                <div className={styles.attachmentPillActions}>
                  <button
                    type="button"
                    className={styles.attachmentPillActionBtn}
                    onClick={() =>
                      downloadComposerAttachment(
                        normalizeClientFileUrl(item.url),
                        item.name,
                      )
                    }
                    title="Download"
                    aria-label={`Download ${item.name}`}
                  >
                    <Download size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.attachmentPillActionBtn}
                    onClick={() => removeComposerAttachment(item.id)}
                    title="Remove"
                    aria-label={`Remove ${item.name}`}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.composerRow}>
          <div className={styles.composerBar}>
            <textarea
              ref={composerTextareaRef}
              className={styles.composerInput}
              placeholder={
                isWaitingForInput
                  ? 'Type required input for the running task...'
                  : 'Type your message...'
              }
              value={composerText}
              onChange={onComposerChange}
              onKeyDown={onComposerKeyDown}
              disabled={isUploading}
            />
            <div className={styles.composerActions}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                multiple
                accept=".csv,.png,.txt,.md,.json,.jpg,.jpeg,.gif,.webp,.py,.js,.ts,.tsx,.sh,.yaml,.yml"
                onChange={handleComposerUpload}
              />
              <button
                type="button"
                className={styles.composerIconButton}
                onClick={triggerUpload}
                disabled={isUploading}
                title="Upload File"
              >
                <Upload size={18} />
              </button>
              <button
                type="button"
                className={styles.composerIconButton}
                onClick={isStreaming ? stopStream : handlePromptSubmit}
                disabled={isUploading || (isLoading && !isWaitingForInput)}
                title={isStreaming ? 'Stop' : 'Send'}
              >
                {isStreaming ? (
                  <IconComponent type="stop" />
                ) : (
                  <IconComponent type="submit" />
                )}
              </button>
            </div>
          </div>

          <ButtonComponent
            type="button"
            variant="outlined"
            onClick={() => setIsDrawerOpen(true)}
            className={styles.sideFilesButton}
            title="Generated Files"
          >
            <IconComponent type="newFolder" />
          </ButtonComponent>
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
