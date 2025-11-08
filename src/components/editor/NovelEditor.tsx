"use client";

import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  EditorRoot,
  EditorContent,
  type JSONContent,
  EditorCommand,
  EditorCommandList,
  EditorCommandItem,
  EditorCommandEmpty,
  createSuggestionItems,
  Command,
  renderItems,
  handleCommandNavigation,
  StarterKit,
  Placeholder,
} from "novel";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import css from "highlight.js/lib/languages/css";
import html from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import php from "highlight.js/lib/languages/php";
import ruby from "highlight.js/lib/languages/ruby";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import swift from "highlight.js/lib/languages/swift";
import {
  Text,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
} from "lucide-react";
import type { DisplayUser } from "@/lib/types";

// Create lowlight instance and register languages
const lowlight = createLowlight();
lowlight.register("javascript", javascript);
lowlight.register("typescript", typescript);
lowlight.register("python", python);
lowlight.register("css", css);
lowlight.register("html", html);
lowlight.register("json", json);
lowlight.register("bash", bash);
lowlight.register("sql", sql);
lowlight.register("java", java);
lowlight.register("cpp", cpp);
lowlight.register("csharp", csharp);
lowlight.register("php", php);
lowlight.register("ruby", ruby);
lowlight.register("go", go);
lowlight.register("rust", rust);
lowlight.register("swift", swift);

interface NovelEditorProps {
  content?: JSONContent;
  onChange?: (content: JSONContent) => void;
  placeholder?: string;
  readOnly?: boolean;
  mentions?: DisplayUser[];
}

export interface NovelEditorRef {
  getContent: () => JSONContent | null;
  setContent: (content: JSONContent) => void;
  focus: () => void;
  clear: () => void;
}

const suggestionItems = createSuggestionItems([
  {
    title: "Text",
    description: "Just start typing with plain text.",
    searchTerms: ["p", "paragraph"],
    icon: <Text size={18} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleNode("paragraph", "paragraph")
        .run();
    },
  },
  {
    title: "Heading 1",
    description: "Big section heading.",
    searchTerms: ["title", "big", "large", "h1", "head", "heading"],
    icon: <Heading1 size={18} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading.",
    searchTerms: ["subtitle", "medium", "h2", "head", "heading"],
    icon: <Heading2 size={18} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading.",
    searchTerms: ["subtitle", "small", "h3", "head", "heading"],
    icon: <Heading3 size={18} />,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run();
    },
  },
  {
    title: "Bullet List",
    description: "Create a simple bullet list.",
    searchTerms: ["unordered", "point", "bullet", "list", "ul"],
    icon: <List size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Create a list with numbering.",
    searchTerms: ["ordered", "numbered", "list", "ol"],
    icon: <ListOrdered size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Quote",
    description: "Capture a quote.",
    searchTerms: ["blockquote", "quote", "citation"],
    icon: <Quote size={18} />,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleNode("paragraph", "paragraph")
        .toggleBlockquote()
        .run(),
  },
  {
    title: "Code",
    description: "Capture a code snippet.",
    searchTerms: ["codeblock", "code", "snippet", "pre"],
    icon: <Code size={18} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
]);

const slashCommand = Command.configure({
  suggestion: {
    items: () => suggestionItems,
    render: renderItems,
  },
});

const NovelEditor = forwardRef<NovelEditorRef, NovelEditorProps>(
  (
    {
      content,
      onChange,
      placeholder = "Start typing...",
      readOnly = false,
      mentions = [],
    },
    ref
  ) => {
    const [editorContent, setEditorContent] = useState<JSONContent | undefined>(
      content
    );

    // Update content when prop changes
    useEffect(() => {
      if (content !== editorContent) {
        setEditorContent(content);
      }
    }, [content, editorContent]);

    // Handle content changes
    const handleContentChange = useCallback(
      (newContent: JSONContent) => {
        setEditorContent(newContent);
        onChange?.(newContent);
      },
      [onChange]
    );

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      getContent: () => editorContent || null,
      setContent: (newContent: JSONContent) => {
        setEditorContent(newContent);
      },
      focus: () => {
        const editorElement = document.querySelector("[data-novel-editor]");
        if (editorElement) {
          (editorElement as HTMLElement).focus();
        }
      },
      clear: () => {
        const emptyContent = { type: "doc", content: [] };
        setEditorContent(emptyContent);
        onChange?.(emptyContent);
      },
    }));

    return (
      <div className="w-full">
        <style jsx global>{`
          .ProseMirror pre {
            background: #1e1e1e;
            color: #d4d4d4;
            font-family:
              "JetBrains Mono", "Monaco", "Cascadia Code", "Ubuntu Mono",
              monospace;
            padding: 0.75rem 1rem;
            border-radius: 0.5rem;
            overflow-x: auto;
            margin: 1rem 0;
            border: 1px solid #374151;
            position: relative;
          }

          .ProseMirror pre code {
            color: inherit;
            padding: 0;
            background: none;
            font-size: 0.875rem;
            line-height: 1.5;
          }

          /* Light mode code blocks */
          .light .ProseMirror pre {
            background: #f8f8f8;
            color: #24292e;
            border-color: #e1e4e8;
          }

          /* Dark mode code blocks */
          .dark .ProseMirror pre {
            background: #0d1117;
            color: #c9d1d9;
            border-color: #30363d;
          }

          /* Language indicator */
          .ProseMirror pre[class*="language-"]::before {
            content: attr(class);
            content: attr(class) / "";
            position: absolute;
            top: 8px;
            right: 12px;
            font-size: 0.75rem;
            color: #858585;
            background: rgba(0, 0, 0, 0.3);
            padding: 2px 6px;
            border-radius: 3px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-family: inherit;
          }

          .light .ProseMirror pre[class*="language-"]::before {
            background: rgba(255, 255, 255, 0.8);
            color: #586069;
          }

          /* VS Code Dark Theme syntax highlighting */
          .ProseMirror .hljs {
            display: block;
            overflow-x: auto;
            background: #1e1e1e;
            color: #d4d4d4;
          }

          /* Keywords (if, else, function, class, etc.) */
          .ProseMirror .hljs-keyword,
          .ProseMirror .hljs-built_in {
            color: #569cd6;
          }

          /* Strings */
          .ProseMirror .hljs-string {
            color: #ce9178;
          }

          /* Numbers */
          .ProseMirror .hljs-number {
            color: #b5cea8;
          }

          /* Comments */
          .ProseMirror .hljs-comment {
            color: #6a9955;
            font-style: italic;
          }

          /* Function names */
          .ProseMirror .hljs-function,
          .ProseMirror .hljs-title {
            color: #dcdcaa;
          }

          /* Variables and identifiers */
          .ProseMirror .hljs-variable,
          .ProseMirror .hljs-name {
            color: #9cdcfe;
          }

          /* Types and classes */
          .ProseMirror .hljs-type,
          .ProseMirror .hljs-class {
            color: #4ec9b0;
          }

          /* HTML/XML tags */
          .ProseMirror .hljs-tag {
            color: #569cd6;
          }

          /* HTML/XML attributes */
          .ProseMirror .hljs-attr,
          .ProseMirror .hljs-attribute {
            color: #9cdcfe;
          }

          /* Operators and punctuation */
          .ProseMirror .hljs-operator,
          .ProseMirror .hljs-punctuation {
            color: #d4d4d4;
          }

          /* Preprocessor directives */
          .ProseMirror .hljs-meta,
          .ProseMirror .hljs-meta-keyword {
            color: #569cd6;
          }

          /* Constants and boolean values */
          .ProseMirror .hljs-literal,
          .ProseMirror .hljs-built_in {
            color: #569cd6;
          }

          /* VS Code Light Theme syntax highlighting */
          .light .ProseMirror .hljs {
            background: #f8f8f8;
            color: #24292e;
          }

          .light .ProseMirror .hljs-keyword,
          .light .ProseMirror .hljs-built_in {
            color: #0000ff;
          }

          .light .ProseMirror .hljs-string {
            color: #a31515;
          }

          .light .ProseMirror .hljs-number {
            color: #098658;
          }

          .light .ProseMirror .hljs-comment {
            color: #008000;
            font-style: italic;
          }

          .light .ProseMirror .hljs-function,
          .light .ProseMirror .hljs-title {
            color: #795e26;
          }

          .light .ProseMirror .hljs-variable,
          .light .ProseMirror .hljs-name {
            color: #001080;
          }

          .light .ProseMirror .hljs-type,
          .light .ProseMirror .hljs-class {
            color: #267f99;
          }

          .light .ProseMirror .hljs-tag {
            color: #800000;
          }

          .light .ProseMirror .hljs-attr,
          .light .ProseMirror .hljs-attribute {
            color: #ff0000;
          }

          .light .ProseMirror .hljs-operator,
          .light .ProseMirror .hljs-punctuation {
            color: #24292e;
          }

          .light .ProseMirror .hljs-meta,
          .light .ProseMirror .hljs-meta-keyword {
            color: #0000ff;
          }

          .light .ProseMirror .hljs-literal {
            color: #0000ff;
          }

          .ProseMirror blockquote {
            border-left: 4px solid #e5e7eb;
            margin: 1.5rem 0;
            padding-left: 1rem;
            font-style: italic;
            color: #6b7280;
          }

          .dark .ProseMirror blockquote {
            border-left-color: #374151;
            color: #9ca3af;
          }

          .ProseMirror h1 {
            font-size: 2rem;
            font-weight: bold;
            margin: 1.5rem 0 1rem 0;
          }

          .ProseMirror h2 {
            font-size: 1.5rem;
            font-weight: bold;
            margin: 1.25rem 0 0.75rem 0;
          }

          .ProseMirror h3 {
            font-size: 1.25rem;
            font-weight: bold;
            margin: 1rem 0 0.5rem 0;
          }

          .ProseMirror ul {
            list-style-type: disc;
            margin: 1rem 0;
            padding-left: 1.5rem;
          }

          .ProseMirror ol {
            list-style-type: decimal;
            margin: 1rem 0;
            padding-left: 1.5rem;
          }

          .ProseMirror li {
            margin: 0.25rem 0;
          }
        `}</style>
        <EditorRoot>
          <EditorContent
            initialContent={editorContent}
            onUpdate={({ editor }) => {
              const json = editor.getJSON();
              handleContentChange(json);
            }}
            className="prose prose-lg dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full"
            editorProps={{
              handleDOMEvents: {
                keydown: (_view, event) => handleCommandNavigation(event),
              },
              attributes: {
                class:
                  "prose prose-lg dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full min-h-32 p-4 border-0 rounded-md",
                "data-novel-editor": "true",
              },
            }}
            immediatelyRender={false}
            editable={!readOnly}
            extensions={[
              StarterKit.configure({
                bulletList: {
                  keepMarks: true,
                  keepAttributes: false,
                },
                orderedList: {
                  keepMarks: true,
                  keepAttributes: false,
                },
                codeBlock: false, // Disable default code block
              }),
              CodeBlockLowlight.configure({
                lowlight,
                defaultLanguage: "plaintext",
                HTMLAttributes: {
                  class: "rounded-sm bg-muted border p-5 font-mono font-medium",
                },
                languageClassPrefix: "language-",
              }),
              Placeholder.configure({
                placeholder: placeholder,
              }),
              Command.configure({
                suggestion: {
                  items: () => suggestionItems,
                  render: renderItems,
                },
              }),
            ]}
          >
            <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border border-muted bg-background px-1 py-2 shadow-md transition-all">
              <EditorCommandEmpty className="px-2 text-muted-foreground">
                No results
              </EditorCommandEmpty>
              <EditorCommandList>
                {suggestionItems.map((item) => (
                  <EditorCommandItem
                    value={item.title}
                    keywords={item.searchTerms}
                    onCommand={(val) => item.command?.(val)}
                    className="flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent aria-selected:bg-accent"
                    key={item.title}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-muted bg-background">
                      {item.icon}
                    </div>
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </EditorCommandItem>
                ))}
              </EditorCommandList>
            </EditorCommand>
          </EditorContent>
        </EditorRoot>
      </div>
    );
  }
);

NovelEditor.displayName = "NovelEditor";

export default NovelEditor;
export { type JSONContent };
