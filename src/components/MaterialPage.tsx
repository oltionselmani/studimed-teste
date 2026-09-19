'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n/provider';
import {
  analyseCourseAction,
  analysePreviousExamsAction,
  deleteMaterialAction,
  researchPreviousExamsAction,
} from '@/lib/actions/materials';
import type { ActionResult } from '@/lib/actions/errors';
import { MaterialUploader, kindLabel } from '@/components/MaterialUploader';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Notice,
  Pill,
  SectionTitle,
} from '@/components/ui/primitives';
import type { PreviousExamAnalysis } from '@/lib/ai/schemas';
import type { Material, PreviousExamRow, ResearchSource, Topic, TopicItem } from '@/lib/types';

interface Props {
  examId: string;
  aiReady: boolean;
  materials: Material[];
  topics: Topic[];
  topicItems: TopicItem[];
  previousExams: PreviousExamRow[];
  researchSources: ResearchSource[];
  analysisState: string;
  analysisError: string;
  previousExamAnalysis: PreviousExamAnalysis | null;
}

function PendingButton({
  label,
  pendingLabel,
  variant = 'primary',
  disabled,
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function MaterialPage(props: Props) {
  const { d, t } = useI18n();
  const readable = props.materials.filter((m) => m.extraction_state === 'ready');
  const papers = props.materials.filter(
    (m) => m.kind === 'previous_exam' || m.kind === 'practice_exam',
  );

  const [analysis, runAnalysis] = useActionState<ActionResult, FormData>(analyseCourseAction, {});
  const [prevAnalysis, runPrevAnalysis] = useActionState<ActionResult, FormData>(
    analysePreviousExamsAction,
    {},
  );
  const [research, runResearch] = useActionState<ActionResult, FormData>(
    researchPreviousExamsAction,
    {},
  );

  return (
    <div className="space-y-10">
      <section>
        <SectionTitle>{d.materials.title}</SectionTitle>
        <p className="mb-4 text-sm text-[var(--text-muted)]">{d.materials.subtitle}</p>
        <MaterialUploader examId={props.examId} />
      </section>

      {props.materials.length > 0 ? (
        <section>
          <Card className="divide-y">
            {props.materials.map((material) => (
              <MaterialRow key={material.id} material={material} />
            ))}
          </Card>
        </section>
      ) : null}

      <section>
        <SectionTitle>{d.materials.extractedTitle}</SectionTitle>
        <Card className="p-5">
          <p className="text-sm text-[var(--text-muted)]">{d.materials.analyzeHelp}</p>

          <form action={runAnalysis} className="mt-4 flex flex-wrap items-center gap-3">
            <input type="hidden" name="exam_id" value={props.examId} />
            <PendingButton
              label={props.topics.length > 0 ? d.materials.analyzeAgain : d.materials.analyze}
              pendingLabel={d.materials.analyzing}
              disabled={!props.aiReady || (readable.length === 0 && props.materials.length === 0)}
            />
            {!props.aiReady ? (
              <span className="text-sm text-[var(--text-muted)]">{d.errors.aiUnavailable}</span>
            ) : null}
          </form>

          {analysis.error ? (
            <Notice tone="danger" className="mt-4">
              {d.errors[analysis.error as keyof typeof d.errors] ?? d.errors.generic}
            </Notice>
          ) : null}
          {analysis.ok && analysis.detail ? (
            <Notice tone="success" className="mt-4">
              {analysis.detail}
            </Notice>
          ) : null}
          {props.analysisState === 'failed' && !analysis.error ? (
            <Notice tone="danger" className="mt-4">
              {d.errors[props.analysisError as keyof typeof d.errors] ?? d.errors.generic}
            </Notice>
          ) : null}
        </Card>

        {props.topics.length === 0 ? (
          <div className="mt-4">
            <EmptyState title={d.materials.noTopics} />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-[var(--text-muted)]">{d.materials.extractedSubtitle}</p>
            {props.topics.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                items={props.topicItems.filter((item) => item.topic_id === topic.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>{d.previousExams.title}</SectionTitle>
        <p className="mb-4 text-sm text-[var(--text-muted)]">{d.previousExams.subtitle}</p>

        {props.previousExams.length === 0 && props.researchSources.length === 0 ? (
          <Notice tone="info">
            <strong className="block">{d.previousExams.none}</strong>
            <span className="mt-1 block text-xs">{d.previousExams.noneHelp}</span>
          </Notice>
        ) : (
          <Card className="divide-y">
            {props.previousExams.map((paper) => (
              <div key={paper.id} className="flex flex-wrap items-center gap-3 p-4">
                <Pill tone={paper.source_type === 'user_upload' ? 'accent' : 'ok'}>
                  {paper.source_type === 'user_upload'
                    ? d.previousExams.uploaded
                    : d.previousExams.external}
                </Pill>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{paper.title}</span>
                {paper.source_url ? (
                  <a
                    href={paper.source_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="truncate text-xs text-[var(--accent-text)] hover:underline"
                  >
                    {paper.source_url}
                  </a>
                ) : null}
              </div>
            ))}
          </Card>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <h3 className="text-sm font-semibold">{d.previousExams.analyzePrevious}</h3>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              {d.previousExams.analysisCaveat}
            </p>
            <form action={runPrevAnalysis} className="mt-4">
              <input type="hidden" name="exam_id" value={props.examId} />
              <PendingButton
                label={d.previousExams.analyzePrevious}
                pendingLabel={d.materials.analyzing}
                variant="secondary"
                disabled={!props.aiReady || papers.length === 0}
              />
            </form>
            {papers.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--text-subtle)]">
                {d.generate.previousStyleUnavailable}
              </p>
            ) : null}
            {prevAnalysis.error ? (
              <Notice tone="danger" className="mt-3">
                {d.errors[prevAnalysis.error as keyof typeof d.errors] ?? d.errors.generic}
              </Notice>
            ) : null}
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold">{d.previousExams.research}</h3>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">{d.previousExams.researchHelp}</p>
            <form action={runResearch} className="mt-4">
              <input type="hidden" name="exam_id" value={props.examId} />
              <PendingButton
                label={d.previousExams.research}
                pendingLabel={d.previousExams.researching}
                variant="secondary"
                disabled={!props.aiReady}
              />
            </form>
            {!props.aiReady ? (
              <p className="mt-2 text-xs text-[var(--text-subtle)]">
                {d.previousExams.researchDisabled}
              </p>
            ) : null}
            {research.error ? (
              <Notice tone="danger" className="mt-3">
                {d.errors[research.error as keyof typeof d.errors] ?? d.errors.generic}
              </Notice>
            ) : null}
            {research.ok ? (
              <Notice tone={research.message ? 'warn' : 'success'} className="mt-3">
                {research.message ? d.previousExams.researchNoResults : null}
                {research.detail ? (
                  <span className="mt-1 block text-xs opacity-90">{research.detail}</span>
                ) : null}
              </Notice>
            ) : null}
          </Card>
        </div>

        {props.researchSources.length > 0 ? (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">
              {t(d.previousExams.sourcesFound, { count: props.researchSources.length })}
            </h3>
            <Card className="divide-y">
              {props.researchSources.map((source) => (
                <div key={source.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill
                      tone={
                        source.relevance === 'previous_exam'
                          ? 'ok'
                          : source.relevance === 'related'
                            ? 'accent'
                            : 'neutral'
                      }
                    >
                      {source.relevance === 'previous_exam'
                        ? d.evidence.verified
                        : source.relevance === 'related'
                          ? d.evidence.estimate
                          : d.evidence.unknown}
                    </Pill>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--accent-text)] hover:underline"
                    >
                      {source.title || source.url}
                    </a>
                  </div>
                  {source.note ? (
                    <p className="mt-1.5 text-xs text-[var(--text-muted)]">{source.note}</p>
                  ) : null}
                  <p className="mt-1 truncate text-[11px] text-[var(--text-subtle)]">{source.url}</p>
                </div>
              ))}
            </Card>
          </div>
        ) : null}

        {props.previousExamAnalysis ? (
          <PreviousExamAnalysisCard analysis={props.previousExamAnalysis} />
        ) : null}
      </section>
    </div>
  );
}

function MaterialRow({ material }: { material: Material }) {
  const { d, t } = useI18n();

  const status = (() => {
    switch (material.extraction_state) {
      case 'ready':
        return { tone: 'ok' as const, label: d.materials.extractionReady };
      case 'pending':
        return { tone: 'neutral' as const, label: d.materials.extractionPending };
      case 'unsupported':
        return { tone: 'warn' as const, label: d.materials.extractionUnsupported };
      default:
        return { tone: 'bad' as const, label: d.materials.extractionFailed };
    }
  })();

  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(material.filename);

  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{material.filename}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-subtle)]">
          <span>{kindLabel(material.kind, d)}</span>
          <span aria-hidden>·</span>
          <span className="tabular">{(material.size_bytes / 1024).toFixed(0)} KB</span>
          {material.extraction_state === 'ready' ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular">
                {t(d.materials.charsExtracted, { count: material.char_count })}
              </span>
            </>
          ) : null}
          {material.page_count > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular">
                {t(d.materials.pagesExtracted, { count: material.page_count })}
              </span>
            </>
          ) : null}
        </div>
        {isImage && material.extraction_state === 'unsupported' ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{d.materials.imageNote}</p>
        ) : null}
      </div>
      <Pill tone={status.tone}>{status.label}</Pill>
      <form action={deleteMaterialAction}>
        <input type="hidden" name="material_id" value={material.id} />
        <button
          type="submit"
          aria-label={`${d.common.delete}: ${material.filename}`}
          className="rounded-md p-1.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--bad-soft)] hover:text-[var(--bad)]"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}

function TopicCard({ topic, items }: { topic: Topic; items: TopicItem[] }) {
  const { d } = useI18n();
  const grouped = items.reduce<Record<string, TopicItem[]>>((acc, item) => {
    (acc[item.kind] ??= []).push(item);
    return acc;
  }, {});

  return (
    <Card as="article" className="avoid-break overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3.5">
        <h3 className="text-[15px] font-semibold">{topic.name}</h3>
        <div className="flex items-center gap-2">
          {topic.source_reference ? (
            <span className="truncate text-xs text-[var(--text-subtle)]">
              {d.evidence.sourceLabel}: {topic.source_reference}
            </span>
          ) : null}
          <Pill tone="neutral" title={d.evidence.userDataHelp}>
            {Math.round(topic.importance * 100)}%
          </Pill>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4">
        {topic.description ? (
          <p className="text-sm text-[var(--text-muted)]">{topic.description}</p>
        ) : null}
        {Object.entries(grouped).map(([kind, group]) => (
          <div key={kind}>
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
              {kind.replace('_', ' ')}
            </h4>
            <ul className="mt-1.5 space-y-1">
              {group.map((item) => (
                <li key={item.id} className="text-sm">
                  <span className="text-[var(--text-muted)]">{item.content}</span>
                  {item.source_reference ? (
                    <span className="ml-1.5 text-[11px] text-[var(--text-subtle)]">
                      ({item.source_reference})
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PreviousExamAnalysisCard({ analysis }: { analysis: PreviousExamAnalysis }) {
  const { d } = useI18n();
  return (
    <Card className="mt-4">
      <CardHeader title={d.previousExams.analysis} subtitle={d.previousExams.analysisCaveat} />
      <div className="grid gap-5 p-5 sm:grid-cols-2">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
            {d.previousExams.recurringTopics}
          </h4>
          <ul className="mt-2 space-y-1 text-sm">
            {analysis.recurring_topics.map((row) => (
              <li key={row.topic} className="flex justify-between gap-3">
                <span>{row.topic}</span>
                <span className="tabular text-[var(--text-muted)]">×{row.occurrences}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
            {d.previousExams.questionTypes}
          </h4>
          <ul className="mt-2 space-y-1 text-sm">
            {analysis.question_formats.map((row) => (
              <li key={row.format} className="flex justify-between gap-3">
                <span>{row.format}</span>
                <span className="tabular text-[var(--text-muted)]">
                  {Math.round(row.share_percent)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="sm:col-span-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
            {d.previousExams.structure}
          </h4>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">{analysis.structure_note}</p>
        </div>
        <div className="sm:col-span-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-subtle)]">
            {d.previousExams.difficultyNote}
          </h4>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">{analysis.difficulty_note}</p>
        </div>
      </div>
    </Card>
  );
}
