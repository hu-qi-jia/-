/**
 * 检索编排(P2,设计文档 §6.2;P4-KB 扩第三源):
 *   查询向量(offscreen)→ 三源读库(问答/金标准/知识库)→ rankCandidates(阈值+RRF)
 *   → 展开回复 → assembleSuggestions(折叠/置顶)。
 * 纯逻辑在 retrieval.ts;此处只做 IO 与装配。
 */
import { db } from "./db";
import { embedViaOffscreen } from "./offscreen";
import {
  assembleSuggestions,
  rankCandidates,
  type RetReply,
  type RetSource,
  type Suggestion,
} from "./retrieval";
import { loadSettings } from "./settings";
import { normalizeText } from "../utils/text";
import { kbAnchorText } from "./kbAnchor";
import type { UiSettings } from "../types/messages";

export interface SearchOutcome {
  suggestions: Suggestion[];
  settings: UiSettings;
  error?: string;
}

/** 买家问题全文 → 折叠排序后的候选列表 */
export async function searchSuggestions(rawQuery: string): Promise<SearchOutcome> {
  const query = normalizeText(rawQuery);
  if (!query) {
    return {
      suggestions: [],
      settings: await uiSettingsSnapshot(),
    };
  }

  let qvec: Float32Array;
  const settings = await loadSettings();
  try {
    qvec = await embedViaOffscreen(query);
  } catch (err) {
    return {
      suggestions: [],
      settings: uiSettings(settings),
      error: `查询向量失败: ${String(err)}`,
    };
  }

  const now = Date.now();

  const [qas, goldens, kbs] = await Promise.all([
    db.getEmbeddedQaRecords(),
    db.getEmbeddedGoldens(),
    db.getEmbeddedKnowledge(),
  ]);

  const entries: Array<{ source: RetSource; vec: Float32Array }> = [
    ...qas.map((q) => ({
      source: {
        id: q.id,
        kind: "history" as const,
        question: q.question,
        questionTs: q.questionTs,
      },
      vec: q.embedding as Float32Array,
    })),
    ...goldens.map((g) => ({
      source: {
        id: g.id,
        kind: "golden" as const,
        question: g.question,
        questionTs: g.updatedAt,
      },
      vec: g.qEmbedding as Float32Array,
    })),
    ...kbs.map((k) => ({
      source: {
        id: k.id,
        kind: "knowledge" as const,
        // 锚文本统一走 kbAnchorText(嵌入/BM25/来源摘要同源,见 kbAnchor.ts 注释)
        question: kbAnchorText(k),
        questionTs: k.updatedAt,
      },
      vec: k.qEmbedding as Float32Array,
    })),
  ];

  const ranked = rankCandidates(
    entries,
    query,
    qvec,
    { golden: settings.goldenThreshold, history: settings.simThreshold },
    now,
  );

  // 只取过阈源的回复(减少 IO)
  const qaIds = ranked
    .filter((r) => r.source.kind === "history")
    .map((r) => r.source.id);
  const repliesByQa = new Map<string, RetReply[]>();
  if (qaIds.length > 0) {
    const replies = await db.getRepliesByQaIds(qaIds);
    for (const r of replies) {
      const list = repliesByQa.get(r.qaId) ?? [];
      list.push({ qaId: r.qaId, id: r.id, text: r.text, ts: r.ts });
      repliesByQa.set(r.qaId, list);
    }
  }
  const goldensById = new Map(goldens.map((g) => [g.id, g]));
  const kbById = new Map(kbs.map((k) => [k.id, k]));

  const suggestions = assembleSuggestions(ranked, {
    getReplies: (id) => repliesByQa.get(id) ?? [],
    getGoldenAnswer: (id) => goldensById.get(id)?.answer ?? "",
    getKbContent: (id) => kbById.get(id)?.content ?? "",
    goldenPriority: settings.goldenPriorityEnabled,
    now,
  });
  return { suggestions, settings: uiSettings(settings) };
}

function uiSettings(s: Awaited<ReturnType<typeof loadSettings>>): UiSettings {
  return {
    directFillEnabled: s.directFillEnabled,
    goldenPriorityEnabled: s.goldenPriorityEnabled,
  };
}

async function uiSettingsSnapshot(): Promise<UiSettings> {
  return uiSettings(await loadSettings());
}
