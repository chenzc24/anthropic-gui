import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import classNames from 'classnames';
import { Download, Paperclip, Upload } from 'lucide-react';
import 'prismjs/themes/prism-funky.min.css';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import markdown from 'remark-parse';
import { remarkToSlate } from 'remark-slate-transformer';
import {
  Descendant,
  Editor,
  Node,
  Path,
  Point,
  Range,
  Text,
  Transforms,
  createEditor,
} from 'slate';
import { withHistory } from 'slate-history';
import {
  Editable,
  RenderElementProps,
  RenderLeafProps,
  Slate,
  withReact,
} from 'slate-react';
import { unified } from 'unified';
import { v4 as uuidv4 } from 'uuid';

import { uploadFile } from '@/api/files.api';
import { addHumanAttachmentsToContent } from '@/redux/conversations/conversationsSlice';
import { useAppDispatch } from '@/redux/hooks';
import { IconComponent } from '@/ui/IconComponent';

import { AgentSteps } from './AgentSteps';
import { MarkdownDisplay } from './MarkdownDisplay';
import { CodeLeaf, decorateCodeFunc } from './parsers/code';
import { transformResultParse } from './parsers/html';
import { serialize } from './parsers/slate2md';
import { CustomElement, CustomRange, IEditablePrompt } from './typings';

import styles from './Prompts.module.scss';

const normalizeClientFileUrl = (rawUrl?: string): string => {
  const normalized = (rawUrl || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('/')) return normalized;
  if (normalized.startsWith('./')) return `/${normalized.slice(2)}`;
  return `/${normalized}`;
};

export const EditablePrompt = memo(
  ({
    text = '',
    fullReasoningText,
    messageVersion,
    mainText,
    deletePromptRow,
    id,
    type,
    handlePromptBlur,
    readOnly,
    deleteDisabled,
    hideActions,
    hideHumanUpload,
    displayOnlyHuman,
    steps,
    humanAttachments,
  }: IEditablePrompt) => {
    const { id: chatId = '' } = useParams();
    const dispatch = useAppDispatch();
    const editor = useMemo(() => withHistory(withReact(createEditor())), []);

    const valueRef = useRef<Descendant[]>([
      {
        type: 'paragraph',
        children: [{ text: '' }],
      } as CustomElement,
    ]);

    const onCopyClick = (textToCopy: string) => (event: React.MouseEvent) => {
      event.stopPropagation();
      navigator.clipboard.writeText(textToCopy);
    };

    const [previewAttachment, setPreviewAttachment] = useState<{
      name: string;
      url: string;
      category?: string;
      path: string;
    } | null>(null);
    const [previewText, setPreviewText] = useState<string>('');

    const hasMeaningfulText = useCallback((value?: string) => {
      if (!value) return false;
      const normalized = value.trim();
      return !['', '{}', '[]', 'null', 'undefined', 'None'].includes(
        normalized,
      );
    }, []);

    const shouldUseStructuredAssistant =
      type === 'Assistant' && messageVersion === 2;

    const fileInputRef = useRef<HTMLInputElement>(null);

    const detectAttachmentCategory = useCallback(
      (name: string, mime?: string) => {
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
      },
      [],
    );

    const handleUploadClick = useCallback(() => {
      fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(
      async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        const uploadedAttachments: Array<{
          id: string;
          name: string;
          path: string;
          url: string;
          mimeType?: string;
          category?: 'image' | 'text' | 'code' | 'csv' | 'json' | 'other';
          size?: number;
          timestamp: number;
        }> = [];

        for (const file of files) {
          try {
            const placeholder = `\n[Uploading ${file.name}...]`;
            Transforms.insertText(editor, placeholder);

            const fileInfo = (await uploadFile(file)) as any;
            const fName = fileInfo.filename || file.name;
            const fPath = fileInfo.filepath || '';
            const fUrl = fileInfo.url || fPath;

            Transforms.insertText(
              editor,
              `\n[File: ${fName} (Path: ${fPath})]`,
            );

            uploadedAttachments.push({
              id: uuidv4(),
              name: fName,
              path: fPath,
              url: fUrl,
              mimeType: file.type || undefined,
              category: detectAttachmentCategory(fName, file.type) as
                | 'image'
                | 'text'
                | 'code'
                | 'csv'
                | 'json'
                | 'other',
              size: file.size,
              timestamp: Date.now(),
            });
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('File upload failed:', error);
            Transforms.insertText(
              editor,
              `\n[Error uploading ${file.name}: ${String(error)}]`,
            );
          }
        }

        if (uploadedAttachments.length > 0 && chatId && type === 'Human') {
          dispatch(
            addHumanAttachmentsToContent({
              chatId,
              contentId: id,
              attachments: uploadedAttachments,
            }),
          );
        }

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      [chatId, detectAttachmentCategory, dispatch, editor, id, type],
    );

    useEffect(() => {
      const fetchTextPreview = async () => {
        if (!previewAttachment) {
          setPreviewText('');
          return;
        }

        const isTextLike = ['text', 'code', 'csv', 'json'].includes(
          previewAttachment.category || '',
        );

        const previewUrl = normalizeClientFileUrl(previewAttachment.url);

        if (!isTextLike || !previewUrl) {
          setPreviewText('');
          return;
        }

        try {
          const response = await fetch(previewUrl);
          const textContent = await response.text();
          setPreviewText(textContent.slice(0, 50000));
        } catch (error) {
          setPreviewText(
            `Failed to load preview: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      };

      fetchTextPreview();
    }, [previewAttachment]);

    const renderLeaf = useCallback(
      (props: RenderLeafProps) => <CodeLeaf {...props} />,
      [],
    );

    const decorate = useCallback(
      ([node, path]: [Node, number[]]) => {
        const customNode = node as CustomElement;
        if (
          customNode.type === 'code' &&
          customNode.lang &&
          customNode.lang !== 'null'
        ) {
          let allRanges: CustomRange[] = [];
          for (const [child, childPath] of Node.children(editor, path)) {
            if (Text.isText(child)) {
              allRanges = allRanges.concat(
                decorateCodeFunc(editor, [child, childPath], customNode.lang),
              );
            }
          }
          return allRanges;
        }
        return [];
      },
      [editor],
    );

    const renderElement = useCallback(
      (props: RenderElementProps) => {
        const { element, children, attributes } = props;

        const customElement = element as CustomElement;

        switch (customElement.type) {
          case 'code':
            const language = customElement.lang || 'text';

            return (
              <div className={styles.codeWrapper}>
                <div className={styles.codeHeader} contentEditable={false}>
                  <span>{language}</span>
                  <IconComponent
                    type="copy"
                    onClick={onCopyClick(
                      element.children
                        .map(child => (child as { text: string }).text)
                        .join('\n'),
                    )}
                    className={classNames(styles.copyIcon, {
                      [styles.copyActive]: !readOnly,
                    })}
                  />
                </div>
                <pre {...attributes}>
                  <code>{children}</code>
                </pre>
              </div>
            );
          case 'blockQuote':
            return <blockquote {...attributes}>{children}</blockquote>;
          case 'headingOne':
            return <h1 {...attributes}>{children}</h1>;
          case 'headingTwo':
            return <h2 {...attributes}>{children}</h2>;
          case 'headingThree':
            return <h3 {...attributes}>{children}</h3>;
          case 'headingFour':
            return <h4 {...attributes}>{children}</h4>;
          case 'headingFive':
            return <h5 {...attributes}>{children}</h5>;
          case 'headingSix':
            return <h6 {...attributes}>{children}</h6>;
          case 'listItem':
            return <li {...attributes}>{children}</li>;
          case 'list':
            return customElement.ordered ? (
              <ol start={customElement.start} {...attributes}>
                {children}
              </ol>
            ) : (
              <ul {...attributes}>{children}</ul>
            );
          case 'html':
            return <div {...attributes}>{children}</div>;
          case 'link':
            return (
              <a
                {...attributes}
                href={customElement.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          case 'image':
            return (
              <div {...attributes} contentEditable={false}>
                <img
                  src={customElement.url}
                  alt={customElement.title || 'image'}
                  style={{ maxWidth: '100%', borderRadius: '4px' }}
                />
                {children}
              </div>
            );
          default:
            return <p {...attributes}>{children}</p>;
        }
      },
      [readOnly],
    );

    useEffect(() => {
      // If we are showing MarkdownDisplay, do not manipulate hidden editor state
      if (type === 'Assistant' || (type === 'Human' && displayOnlyHuman)) {
        return;
      }

      const processor = unified().use(markdown).use(remarkToSlate);

      const result = processor.processSync(text).result;

      const transformedResult = transformResultParse(result).flat();

      if (transformedResult.length) {
        Transforms.delete(editor, {
          at: {
            anchor: Editor.start(editor, []),
            focus: Editor.end(editor, []),
          },
        });

        Transforms.removeNodes(editor, {
          at: [0],
        });

        Transforms.insertNodes(editor, transformedResult as Descendant[]);
        valueRef.current = transformedResult as Descendant[];
      }
    }, [text, editor, type, displayOnlyHuman]);

    const persistCurrentPrompt = useCallback(() => {
      if (type !== 'Human' || displayOnlyHuman) {
        return;
      }

      const currentValue =
        Array.isArray(editor.children) && editor.children.length > 0
          ? (editor.children as Descendant[])
          : valueRef.current;

      if (!currentValue) {
        return;
      }

      const markdownText = serialize(currentValue);
      handlePromptBlur(id, markdownText);
    }, [editor, handlePromptBlur, id, type, displayOnlyHuman]);

    const onBlur = useCallback(() => {
      if (displayOnlyHuman) {
        return;
      }
      persistCurrentPrompt();
    }, [displayOnlyHuman, persistCurrentPrompt]);

    useEffect(
      () => () => {
        persistCurrentPrompt();
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [persistCurrentPrompt],
    );

    const onChange = (newValue: Descendant[]) => {
      valueRef.current = newValue;
    };

    const CustomEditor = useMemo(
      () => ({
        isCodeBlock: (editorArg: Editor) => {
          const [match] = Editor.nodes(editorArg, {
            match: (n: Node) => 'type' in n && n.type === 'code',
          });
          return !!match;
        },
        isListItem: (editorArg: Editor) => {
          const [match] = Editor.nodes(editorArg, {
            match: (n: Node) => 'type' in n && n.type === 'listItem',
          });
          return !!match;
        },
      }),
      [],
    );

    const onKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Tab' && CustomEditor.isCodeBlock(editor)) {
          event.preventDefault();
          Transforms.insertText(editor, '  ');
          return;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          const { selection } = editor;
          if (selection && Range.isCollapsed(selection)) {
            const [match] = Editor.nodes(editor, {
              match: (n: Node) => 'type' in n && n.type === 'code',
            });
            if (match) {
              const [node, path] = match;
              const start = Editor.start(editor, path);
              const isAtStart = Point.equals(selection.anchor, start);

              const nodeText = Node.string(node);

              if (nodeText.length === 0 && isAtStart) {
                event.preventDefault();
                Transforms.setNodes(
                  editor,
                  { type: 'paragraph', children: [{ text: '' }] },
                  { at: path },
                );
                return;
              }
            }
          }
        }
        if (event.key === 'Enter') {
          if (CustomEditor.isCodeBlock(editor)) {
            event.preventDefault();
            if (event.shiftKey === false) {
              Transforms.insertText(editor, '\n');
              return;
            }

            if (editor.selection) {
              Transforms.insertNodes(editor, {
                type: 'paragraph',
                children: [{ text: '' }],
              } as CustomElement);

              const point = Editor.end(editor, editor.selection.focus.path);
              const newPath = [
                ...point.path.slice(0, -1),
                point.path[point.path.length - 1] + 1,
              ];

              if (Editor.hasPath(editor, newPath)) {
                Transforms.select(editor, Editor.start(editor, newPath));
              }
            }

            return;
          }

          if (CustomEditor.isListItem(editor) && editor.selection) {
            event.preventDefault();

            if (event.shiftKey === false) {
              const [, currentListItemPath] = Editor.node(
                editor,
                editor.selection.focus.path,
              );

              const [, parentParagraphPath] = Editor.parent(
                editor,
                currentListItemPath,
              );
              const [, parentListPath] = Editor.parent(
                editor,
                parentParagraphPath,
              );

              const newPath = Path.next(parentListPath);

              const newItem = {
                type: 'listItem',
                children: [
                  {
                    type: 'paragraph',
                    children: [{ text: '' }],
                  } as CustomElement,
                ],
              } as CustomElement;

              Transforms.insertNodes(editor, newItem, { at: newPath });
              Transforms.select(editor, Editor.start(editor, newPath));

              return;
            }

            if (event.shiftKey === true) {
              event.preventDefault();

              const [, currentListItemPath] = Editor.node(
                editor,
                editor.selection.focus.path,
              );

              const [, parentParagraphPath] = Editor.parent(
                editor,
                currentListItemPath,
              );

              const [, parentListPath] = Editor.parent(
                editor,
                parentParagraphPath,
              );

              const [, grandParentListPath] = Editor.parent(
                editor,
                parentListPath,
              );

              const newPath = Path.next(
                grandParentListPath.length
                  ? grandParentListPath
                  : parentListPath,
              );

              const paragraph = { type: 'paragraph', children: [{ text: '' }] };

              Transforms.insertNodes(editor, paragraph, { at: newPath });

              Transforms.select(editor, Editor.start(editor, newPath));

              return;
            }
          }
          const { selection } = editor;

          if (selection && !Range.isCollapsed(selection)) return;

          const [match] = Editor.nodes(editor, {
            match: n => (n as CustomElement).type === 'paragraph',
          });

          if (!match) return;

          const [, path] = match;

          const prevText = Node.string(match[0]);
          const codeRegex = /^```(.+)?$/;

          const codeMatch = prevText.match(codeRegex);

          if (codeMatch) {
            const codeBlock = {
              type: 'code',
              lang: codeMatch[1] || 'clike',
              children: [{ text: '' }],
            } as CustomElement;

            Transforms.insertNodes(editor, codeBlock, { at: path });

            const nextPath = Path.next(path);
            if (Editor.hasPath(editor, nextPath)) {
              Transforms.delete(editor, { at: nextPath });
            }

            const codeBlockPath = path;

            Transforms.select(editor, Editor.start(editor, codeBlockPath));

            event.preventDefault();
            return;
          }
        }
      },
      [editor, CustomEditor],
    );

    const handlePaste = useCallback(
      (event: React.ClipboardEvent<HTMLDivElement>) => {
        if (CustomEditor.isCodeBlock(editor)) {
          event.preventDefault();
          const pastedText = event.clipboardData.getData('text/plain');
          const lines = pastedText.split('\n');

          Transforms.insertText(editor, lines[0]);

          for (let i = 1; i < lines.length; i++) {
            Transforms.insertText(editor, '\n' + lines[i]);
          }
        }
      },
      [editor, CustomEditor],
    );

    return (
      <div className={styles.promptContainer}>
        <div className={styles.promptMainRow}>
          {type === 'Human' ? (
            <div className={styles.promptAvatarColumn}>
              <IconComponent type="human" />
            </div>
          ) : (
            <div className={styles.promptAvatarColumn}>
              <IconComponent type="ai" />
            </div>
          )}
          <div className={styles.fieldContainer}>
            <div
              className={classNames(styles.promptContainerHeader, {
                [styles.promptContainerHeaderOverlay]: hideActions,
              })}
            >
              {type === 'Human' ? (
                <div className={styles.placeholderText}>You</div>
              ) : (
                <div className={styles.placeholderText}>AI</div>
              )}
              {!hideActions && (
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {type === 'Human' && !hideHumanUpload && (
                    <>
                      <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        multiple
                        accept=".csv,.png,.txt,.md,.json,.jpg,.jpeg,.gif,.webp,.py,.js,.ts,.tsx,.sh,.yaml,.yml"
                        onChange={handleFileChange}
                      />
                      <div
                        className={classNames(styles.iconDelete, {
                          [styles.iconDeleteDisabled]: readOnly,
                        })}
                        onClick={readOnly ? undefined : handleUploadClick}
                        title="Upload File"
                        style={{ cursor: readOnly ? 'not-allowed' : 'pointer' }}
                      >
                        <Upload size={18} />
                      </div>
                    </>
                  )}
                  <div
                    className={classNames(styles.iconDelete, {
                      [styles.iconDeleteDisabled]: readOnly || deleteDisabled,
                    })}
                    onClick={
                      readOnly || deleteDisabled
                        ? undefined
                        : deletePromptRow(id)
                    }
                  >
                    <IconComponent type="deleteIcon" />
                  </div>
                </div>
              )}
            </div>
            {valueRef.current ? (
              <>
                {steps && steps.length > 0 && <AgentSteps steps={steps} />}
                {type === 'Assistant' ? (
                  shouldUseStructuredAssistant ? (
                    <div className={styles.assistantStructuredContainer}>
                      <div className={styles.assistantPrimaryBlock}>
                        <div className={styles.assistantPrimaryContent}>
                          {hasMeaningfulText(mainText) ? (
                            <MarkdownDisplay content={mainText || ''} />
                          ) : (
                            <div className={styles.assistantPrimaryPlaceholder}>
                              Waiting for primary answer...
                            </div>
                          )}
                        </div>

                        {hasMeaningfulText(fullReasoningText || text) && (
                          <details className={styles.assistantDetailsCollapse}>
                            <summary className={styles.assistantDetailsSummary}>
                              <span>Full reasoning</span>
                              <span className={styles.assistantDetailsCount}>
                                streaming
                              </span>
                            </summary>
                            <div className={styles.assistantDetailsBody}>
                              <div className={styles.assistantStreamContainer}>
                                <MarkdownDisplay
                                  content={fullReasoningText || text}
                                />
                              </div>
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  ) : (
                    <MarkdownDisplay content={text} />
                  )
                ) : displayOnlyHuman ? (
                  <div className={styles.humanCardSections}>
                    {hasMeaningfulText(text) ? (
                      <div className={styles.humanCardBodySection}>
                        <MarkdownDisplay content={text} />
                      </div>
                    ) : null}

                    {!!humanAttachments?.length && (
                      <div className={styles.humanCardFooterSection}>
                        <details
                          className={styles.humanAttachmentsCollapse}
                          open
                        >
                          <summary className={styles.humanAttachmentsSummary}>
                            <span>Attachments</span>
                            <span className={styles.humanAttachmentsCount}>
                              {humanAttachments.length}
                            </span>
                          </summary>
                          <div className={styles.humanAttachmentsBody}>
                            <div className={styles.attachmentList}>
                              {humanAttachments.map(attachment => (
                                <div
                                  key={attachment.id}
                                  className={styles.attachmentItem}
                                >
                                  <button
                                    className={styles.attachmentPreviewBtn}
                                    type="button"
                                    onClick={() =>
                                      setPreviewAttachment({
                                        name: attachment.name,
                                        url: attachment.url,
                                        category: attachment.category,
                                        path: attachment.path,
                                      })
                                    }
                                  >
                                    <Paperclip size={14} />
                                    <span>{attachment.name}</span>
                                  </button>
                                  <a
                                    href={normalizeClientFileUrl(attachment.url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.attachmentDownloadLink}
                                  >
                                    <Download size={14} />
                                    <span>Download</span>
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                ) : (
                  <Slate
                    editor={editor}
                    initialValue={valueRef.current}
                    onChange={onChange}
                  >
                    <Editable
                      spellCheck={false}
                      renderElement={renderElement}
                      className={styles.promptField}
                      onBlur={onBlur}
                      renderLeaf={renderLeaf}
                      decorate={decorate}
                      onKeyDown={onKeyDown}
                      readOnly={readOnly}
                      onPaste={handlePaste}
                    />
                  </Slate>
                )}
              </>
            ) : null}
          </div>
        </div>

        {previewAttachment &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              className={styles.attachmentPreviewOverlay}
              onClick={() => setPreviewAttachment(null)}
            >
              <div
                className={styles.attachmentPreviewModal}
                onClick={event => event.stopPropagation()}
              >
                <div className={styles.attachmentPreviewHeader}>
                  <strong>{previewAttachment.name}</strong>
                  <button
                    className={styles.attachmentPreviewClose}
                    type="button"
                    onClick={() => setPreviewAttachment(null)}
                  >
                    ×
                  </button>
                </div>
                <div className={styles.attachmentPreviewBody}>
                  {previewAttachment.category === 'image' ? (
                    <img
                      src={normalizeClientFileUrl(previewAttachment.url)}
                      alt={previewAttachment.name}
                      className={styles.attachmentPreviewImage}
                    />
                  ) : previewText ? (
                    <pre className={styles.attachmentPreviewText}>
                      <code>{previewText}</code>
                    </pre>
                  ) : (
                    <div className={styles.attachmentPreviewFallback}>
                      Preview unavailable. Path: {previewAttachment.path}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    );
  },
);

EditablePrompt.displayName = 'EditablePrompt';
