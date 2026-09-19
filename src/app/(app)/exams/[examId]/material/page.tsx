import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getExam, listTopicItems, listTopics } from '@/lib/data/exams';
import { listMaterials, listPreviousExams, listResearchSources } from '@/lib/data/materials';
import { aiAvailable } from '@/lib/ai/client';
import { MaterialPage } from '@/components/MaterialPage';
import type { PreviousExamAnalysis } from '@/lib/ai/schemas';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ examId: string }> }) {
  const user = await requireUser();
  const { examId } = await params;
  const exam = await getExam(user.id, examId);
  if (!exam) notFound();

  const [materials, topics, topicItems, previousExams, researchSources, aiReady] = await Promise.all([
    listMaterials(examId),
    listTopics(examId),
    listTopicItems(examId),
    listPreviousExams(examId),
    listResearchSources(examId),
    aiAvailable(),
  ]);

  const analysed = previousExams.find((paper) => paper.analysis_json);
  let previousExamAnalysis: PreviousExamAnalysis | null = null;
  if (analysed) {
    try {
      previousExamAnalysis = JSON.parse(analysed.analysis_json) as PreviousExamAnalysis;
    } catch {
      previousExamAnalysis = null;
    }
  }

  return (
    <MaterialPage
      examId={examId}
      aiReady={aiReady}
      materials={materials}
      topics={topics}
      topicItems={topicItems}
      previousExams={previousExams}
      researchSources={researchSources}
      analysisState={exam.analysis_state}
      analysisError={exam.analysis_error}
      previousExamAnalysis={previousExamAnalysis}
    />
  );
}
