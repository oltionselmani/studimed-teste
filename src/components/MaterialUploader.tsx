'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n/provider';
import { uploadMaterialsAction } from '@/lib/actions/materials';
import type { ActionResult } from '@/lib/actions/errors';
import { Button, Notice, cx, inputClass } from '@/components/ui/primitives';
import type { MaterialKind } from '@/lib/types';

const KINDS: MaterialKind[] = [
  'lecture',
  'notes',
  'assignment',
  'textbook',
  'previous_exam',
  'practice_exam',
  'other',
];

const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif';

function UploadButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  const { d } = useI18n();
  return (
    <Button type="submit" disabled={pending || count === 0}>
      {pending ? d.materials.uploading : `${d.materials.upload}${count > 0 ? ` (${count})` : ''}`}
    </Button>
  );
}

export function MaterialUploader({ examId }: { examId: string }) {
  const { d } = useI18n();
  const [state, action] = useActionState<ActionResult, FormData>(uploadMaterialsAction, {});
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((existing) => [...existing, ...Array.from(list)]);
  }

  return (
    <form
      action={(formData) => {
        formData.delete('files');
        for (const file of files) formData.append('files', file);
        setFiles([]);
        if (inputRef.current) inputRef.current.value = '';
        return action(formData);
      }}
      className="space-y-4"
    >
      <input type="hidden" name="exam_id" value={examId} />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cx(
          'rounded-[var(--radius-card)] border-2 border-dashed px-5 py-8 text-center transition-colors',
          dragging ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mx-auto text-[var(--text-subtle)]"
          aria-hidden
        >
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
        <p className="mt-3 text-sm text-[var(--text-muted)]">{d.materials.dropHint}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            {d.materials.uploadFilesLabel}
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          aria-label={d.materials.upload}
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFiles((list) => list.filter((_, i) => i !== index))}
                className="shrink-0 text-xs text-[var(--text-muted)] hover:text-[var(--bad)]"
              >
                {d.common.remove}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label htmlFor="material-kind" className="mb-1.5 block text-sm font-medium">
            {d.materials.kind}
          </label>
          <select id="material-kind" name="kind" className={inputClass} defaultValue="lecture">
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kindLabel(kind, d)}
              </option>
            ))}
          </select>
        </div>
        <UploadButton count={files.length} />
      </div>

      {state.error ? (
        <Notice tone="danger">
          {d.errors[state.error as keyof typeof d.errors] ?? d.errors.generic}
          {state.detail ? (
            <span className="mt-1 block whitespace-pre-line text-xs opacity-80">{state.detail}</span>
          ) : null}
        </Notice>
      ) : null}
      {state.ok && state.detail ? (
        <Notice tone="warn">
          <span className="whitespace-pre-line">{state.detail}</span>
        </Notice>
      ) : null}
    </form>
  );
}

export function kindLabel(kind: string, d: ReturnType<typeof useI18n>['d']): string {
  switch (kind) {
    case 'lecture':
      return d.materials.kindLecture;
    case 'notes':
      return d.materials.kindNotes;
    case 'assignment':
      return d.materials.kindAssignment;
    case 'textbook':
      return d.materials.kindTextbook;
    case 'previous_exam':
      return d.materials.kindPreviousExam;
    case 'practice_exam':
      return d.materials.kindPracticeExam;
    default:
      return d.materials.kindOther;
  }
}
