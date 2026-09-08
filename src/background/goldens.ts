/**
 * 金标准写入(P2 最小版:弹窗"设为金标准";P3 将扩展完整 CRUD/导入导出)。
 * 幂等:normalize + questionHash 查重,已存在直接返回,不重复建、不重嵌。
 */
import { db } from "./db";
import { queueEmbedding } from "./offscreen";
import { hashText, normalizeText } from "../utils/text";
import type { AddGoldenRequest } from "../types/messages";

export interface AddGoldenOutcome {
  id?: string;
  exists?: boolean;
  error?: string;
}

export async function addGoldenFromSuggestion(
  payload: AddGoldenRequest["payload"],
): Promise<AddGoldenOutcome> {
  const question = normalizeText(payload.question ?? "");
  const answer = normalizeText(payload.answer ?? "");
  if (!question || !answer) return { error: "问题或回复为空" };

  const questionHash = hashText(question);
  const dup = await db.findGoldenByQuestionHash(questionHash);
  if (dup) return { id: dup.id, exists: true };

  const now = Date.now();
  const id = `gd-${now}-${Math.random().toString(36).slice(2, 8)}`;
  await db.addGolden({
    id,
    folderId: null,
    question,
    answer,
    questionHash,
    hasEmbedding: 0,
    sourceRecordId: payload.sourceRecordId,
    sourceReplyId: payload.sourceReplyId,
    createdAt: now,
    updatedAt: now,
  });
  queueEmbedding("golden", id, question);
  return { id };
}
