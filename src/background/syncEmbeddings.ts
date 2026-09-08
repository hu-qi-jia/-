import { db } from "./db";
import { MODEL_NAME, EMBEDDING_VERSION } from "./embedding";
import { embedBatchViaOffscreen } from "./offscreen";

// 启动/导入后批量补嵌:把所有 hasEmbedding=0 的问答与金标准拉齐向量。
// 100 条/批 → 每次批处理一次 IPC 往返(原项目习惯保留)。

const BATCH_SIZE = 100;

let _isProcessing = false;

type PendingTarget = { id: string; text: string; kind: "qa" | "golden" };

async function embedPendingBatch(targets: PendingTarget[]): Promise<void> {
  // 一次 EMBED_BATCH 调用;offscreen 内串行推理(单线程约束)
  let embeddings: Array<Float32Array | null>;
  try {
    embeddings = await embedBatchViaOffscreen(targets.map((t) => t.text));
  } catch (err) {
    console.error("[PDD CS] EMBED_BATCH failed for batch:", err);
    // 整批标记失败,避免无限循环
    for (const t of targets) {
      await db.markEmbeddingFailed(t.kind, t.id);
    }
    return;
  }

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const embedding = embeddings[i];
    if (!embedding) {
      console.error(
        `[PDD CS] Embedding failed in offscreen (${target.kind}: ${target.id})`,
      );
      await db.markEmbeddingFailed(target.kind, target.id);
      continue;
    }
    try {
      if (target.kind === "qa") {
        await db.updateQaEmbedding(
          target.id,
          embedding,
          MODEL_NAME,
          EMBEDDING_VERSION,
        );
      } else {
        await db.updateGoldenEmbedding(
          target.id,
          embedding,
          MODEL_NAME,
          EMBEDDING_VERSION,
        );
      }
    } catch (err) {
      console.error(
        `[PDD CS] DB update failed (${target.kind}: ${target.id}):`,
        err,
      );
      await db.markEmbeddingFailed(target.kind, target.id);
    }
  }
}

export async function processPendingEmbeddings(): Promise<void> {
  if (_isProcessing) return;
  _isProcessing = true;

  try {
    for (;;) {
      // 两源交替补嵌:金标准(小表先清) → 问答记录
      const pendingGoldens = await db.getPendingGoldenEmbeddings(BATCH_SIZE);
      if (pendingGoldens.length > 0) {
        await embedPendingBatch(
          pendingGoldens.map((g) => ({
            kind: "golden" as const,
            id: g.id,
            text: g.question,
          })),
        );
        continue; // 同一批清完后再看问答
      }
      const pendingQas = await db.getPendingQaEmbeddings(BATCH_SIZE);
      if (pendingQas.length === 0) break;
      await embedPendingBatch(
        pendingQas.map((q) => ({
          kind: "qa" as const,
          id: q.id,
          text: q.question,
        })),
      );
    }
  } finally {
    _isProcessing = false;
  }
}
