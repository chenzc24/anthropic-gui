import React, { useMemo, useCallback } from 'react';

import 'prismjs/themes/prism-funky.min.css';
import markdown from 'remark-parse';
import { remarkToSlate } from 'remark-slate-transformer';
import { createEditor, Descendant, Node, Text } from 'slate';
import {
  Slate,
  Editable,
  withReact,
  RenderElementProps,
  RenderLeafProps,
} from 'slate-react';
import { unified } from 'unified';

import { IconComponent } from '@/ui/IconComponent';

import { CodeLeaf, decorateCodeFunc } from './parsers/code';
import { transformResultParse } from './parsers/html';
import { CustomElement, CustomRange } from './typings';

import styles from './Prompts.module.scss';

interface MarkdownDisplayProps {
  content: string;
}

const EMPTY_VALUE: Descendant[] = [
  { type: 'paragraph', children: [{ text: '' }] } as CustomElement,
];

const fallbackFromText = (text: string): Descendant[] => {
  const lines = text.split(/\r?\n/);
  if (!lines.length) return EMPTY_VALUE;

  return lines.map(line => ({
    type: 'paragraph',
    children: [{ text: line }],
  })) as Descendant[];
};

const normalizeCodeTags = (text: string): string =>
  text.replace(/<code>/g, '\n```text\n').replace(/<\/code>/g, '\n```\n');

const NARRATIVE_MARKER_REGEX =
  /^(Thought:|Observation:|Action:|Final Answer:|\*\*Generated Files:\*\*|\[Download\s|Config loaded successfully\.|The JSON structure seems|Validation passed\.|Schematic generation result:|Layout generation result:)/;

const recoverFencesWithNarrativeMarkers = (text: string): string => {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];
  let openFence: { marker: '`' | '~'; size: number } | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);

    if (!fenceMatch && openFence && NARRATIVE_MARKER_REGEX.test(line.trim())) {
      result.push(openFence.marker.repeat(openFence.size));
      openFence = null;
    }

    if (fenceMatch) {
      const fence = fenceMatch[1];
      const marker = fence[0] as '`' | '~';
      const size = fence.length;

      if (!openFence) {
        openFence = { marker, size };
      } else if (openFence.marker === marker && size >= openFence.size) {
        openFence = null;
      }
    }

    result.push(line);
  }

  return result.join('\n');
};

const closeOpenFences = (text: string): string => {
  const lines = text.split(/\r?\n/);
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

  if (!openFence) return text;

  const closingFence = openFence.marker.repeat(openFence.size);
  return `${text}\n${closingFence}\n`;
};

const buildSlateValueFromMarkdown = (rawContent: string): Descendant[] => {
  if (!rawContent) return EMPTY_VALUE;

  const normalized = closeOpenFences(
    recoverFencesWithNarrativeMarkers(normalizeCodeTags(rawContent)),
  );

  try {
    const processor = unified().use(markdown).use(remarkToSlate);
    const result = processor.processSync(normalized).result;
    const transformedResult = transformResultParse(result).flat();

    if (Array.isArray(transformedResult) && transformedResult.length > 0) {
      return transformedResult as Descendant[];
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Markdown parsing failed', e);
  }

  return fallbackFromText(rawContent);
};

const makeContentKey = (text: string): string => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return `${text.length}-${hash}`;
};

export const MarkdownDisplay: React.FC<MarkdownDisplayProps> = ({
  content,
}) => {
  const editor = useMemo(() => withReact(createEditor()), []);
  const value = useMemo(() => buildSlateValueFromMarkdown(content), [content]);
  const slateKey = useMemo(() => makeContentKey(content), [content]);

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

  const onCopyClick = (textToCopy: string) => (event: React.MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard.writeText(textToCopy);
  };

  const renderElement = useCallback((props: RenderElementProps) => {
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
                className={styles.copyIcon}
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
        // Fallback for HTML blocks that remark-slate might produce
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
  }, []);

  return (
    <Slate editor={editor} initialValue={value} key={slateKey}>
      <Editable
        readOnly
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        decorate={decorate}
        className={styles.promptField}
      />
    </Slate>
  );
};
