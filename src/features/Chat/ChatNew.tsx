import React, {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import classNames from 'classnames';
import { Download, Paperclip, Upload, X as CloseIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import { injectStyle } from 'react-toastify/dist/inject-style';
import 'react-toastify/dist/ReactToastify.css';
import { v4 as uuidv4 } from 'uuid';

import {
  appendChatSessionMessages,
  createChatSession,
  mapChatContentToRecordMessage,
} from '@/api/chatSessions.api';
import { uploadFile } from '@/api/files.api';
import { NavigationContext } from '@/app/App';
import { ROUTES } from '@/app/router/constants/routes';
import {
  deleteChatTreeItem,
  saveChat,
} from '@/redux/conversations/conversationsSlice';
import { useAppDispatch } from '@/redux/hooks';
import { ChatAttachment } from '@/typings/common';
import { ButtonComponent } from '@/ui/ButtonComponent';
import { IconComponent } from '@/ui/IconComponent';

import { ChatFileDrawer } from './components/ChatFileDrawer';

import styles from './Chat.module.scss';

if (typeof window !== 'undefined') {
  injectStyle();
}

const hasMeaningfulText = (value?: string): boolean => {
  if (!value) return false;
  const normalized = value.trim();
  return !['', '{}', '[]', 'null', 'undefined', 'None'].includes(normalized);
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

const normalizeClientFileUrl = (rawUrl?: string): string => {
  const normalized = (rawUrl || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('/')) return normalized;
  if (normalized.startsWith('./')) return `/${normalized.slice(2)}`;
  return `/${normalized}`;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Submit failed. Please check backend status and retry.';
};

export const ChatNew: React.FC = () => {
  const [composerText, setComposerText] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<
    ChatAttachment[]
  >([]);
  const composerAttachmentsRef = useRef<ChatAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { setDidNewChatNavigate } = useContext(NavigationContext);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

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
      const downloadUrl = normalizeClientFileUrl(url);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [],
  );

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

    const composerValue = composerText.trim();
    const submittedAttachments = [...composerAttachmentsRef.current];

    if (
      !hasMeaningfulText(composerValue) &&
      submittedAttachments.length === 0
    ) {
      toast(
        <div className={styles.toasterDiv}>
          <span className={styles.toasterSpan}>Add content, please</span>
          <IconComponent type="heart" className={styles.iconHeart} />
        </div>,
        {
          closeButton: (
            <>
              <IconComponent type="close" className={styles.iconClose} />
            </>
          ),
        },
      );

      return;
    }

    const newChat = {
      id: uuidv4(),
      name: 'New Chat',
      content: [
        {
          id: uuidv4(),
          type: 'Human' as const,
          text: composerValue,
          humanAttachments: submittedAttachments,
        },
      ],
    };

    dispatch(saveChat(newChat));
    try {
      await createChatSession({
        id: newChat.id,
        name: newChat.name,
        createdAt: Date.now(),
      });

      await appendChatSessionMessages(newChat.id, [
        mapChatContentToRecordMessage(newChat.content[0], 0),
      ]);

      setComposerText('');
      setComposerAttachments([]);
      composerAttachmentsRef.current = [];
      setDidNewChatNavigate(true);
      navigate(`${ROUTES.Chat}/${newChat.id}`);
    } catch (error) {
      dispatch(deleteChatTreeItem({ chatTreeId: newChat.id }));
      toast.error(getErrorMessage(error));
    }
  }, [composerText, dispatch, isUploading, setDidNewChatNavigate, navigate]);

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

  return (
    <div className={styles.chatMainContainer}>
      <div
        className={classNames(
          styles.chatGeneralContainer,
          styles.chatGeneralContainerNew,
        )}
      >
        <div className={styles.chatFooter}>
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
                    <span className={styles.attachmentPillName}>
                      {item.name}
                    </span>
                  </a>
                  <div className={styles.attachmentPillActions}>
                    <button
                      type="button"
                      className={styles.attachmentPillActionBtn}
                      onClick={() =>
                        downloadComposerAttachment(item.url, item.name)
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
                      <CloseIcon size={14} />
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
                placeholder="Type your message..."
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
                  onClick={handlePromptSubmit}
                  disabled={isUploading}
                  title="Send"
                >
                  <IconComponent type="submit" />
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
      </div>

      <ChatFileDrawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />

      <ToastContainer
        hideProgressBar
        toastStyle={{ background: 'var(--bg-secondary)' }}
        style={{
          width: '100%',
          position: 'absolute',
        }}
        position="bottom-center"
      />
    </div>
  );
};
