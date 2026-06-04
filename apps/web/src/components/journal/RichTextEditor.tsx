'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Image as TiptapImage } from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { useRef } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './RichTextEditor.module.css';

interface Props {
  content: object;
  onChange: (json: object) => void;
}

export default function RichTextEditor({ content, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadImage = async (file: File) => {
    const res = await apiFetch(
      `/api/uploads/presigned?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`
    );
    const { uploadUrl, publicUrl } = await res.json();
    await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    editor?.chain().focus().setImage({ src: publicUrl }).run();
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapImage.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((item) => item.type.startsWith('image/'));
        if (imageItem) {
          const file = imageItem.getAsFile();
          if (file) { uploadImage(file); return true; }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        const imageFile = files.find((f) => f.type.startsWith('image/'));
        if (imageFile) { uploadImage(imageFile); return true; }
        return false;
      },
    },
  });

  if (!editor) return null;

  const btn = (label: string, action: () => void, active: boolean) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); action(); }}
      className={`${styles.toolbarBtn} ${active ? styles.active : ''}`}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
        {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
        <div className={styles.divider} />
        {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
        {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
        {btn('H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }))}
        <div className={styles.divider} />
        {btn('• —', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
        {btn('1.', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
        <div className={styles.divider} />
        {btn('" "', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
        {btn('{ }', () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
        <div className={styles.divider} />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
          className={styles.toolbarBtn}
        >
          IMG
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadImage(file);
            e.target.value = '';
          }}
        />
      </div>
      <EditorContent editor={editor} className={styles.editor} />
    </div>
  );
}
