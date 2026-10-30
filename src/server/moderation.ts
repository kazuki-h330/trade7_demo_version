/**
 * Dispute-message screening: (1) deterministic rules, then (2) Gemini.
 * Messages that hit a rule are blocked WITHOUT being sent to the AI, so gift codes and
 * contact details never leave our infrastructure.
 */

const RULES: { key: string; label: string; re: RegExp }[] = [
  { key: 'giftcode', label: 'ギフトコードらしき文字列', re: /(?:[A-Z0-9]{4}[\s\-]?){3}[A-Z0-9]{4}/i },
  { key: 'email', label: 'メールアドレス', re: /[\w.+-]+@[\w-]+\.[\w.-]+/ },
  { key: 'phone', label: '電話番号', re: /0\d{1,4}[\s\-]?\d{1,4}[\s\-]?\d{3,4}/ },
  { key: 'url', label: 'URL', re: /https?:\/\/|www\.|\.(?:com|jp|net|me|io|ly)\b/i },
  { key: 'sns', label: '外部SNS・連絡アプリ', re: /line|ライン|らいん|カカオ|kakao|telegram|テレグラム|discord|ディスコード|instagram|インスタ|twitter|ツイッター|whatsapp|signal|シグナル|wechat/i },
  { key: 'handle', label: 'ID・アカウント名', re: /@[a-z0-9_.]{3,}|\bID\s*[:：は]\s*[a-z0-9_.]{4,}/i },
];

export type AiVerdict = { model: string; verdict: 'ok' | 'warn' | 'block'; reasons: string[]; score: number; error?: string };
export type Inspection = { action: 'pass' | 'flag' | 'block'; ruleHits: string[]; ai: AiVerdict | null };

export function ruleCheck(text: string) {
  const norm = text.normalize('NFKC'); // full-width → half-width, ① → 1 …
  return RULES.filter(r => r.re.test(norm)).map(r => r.label);
}

const SYSTEM_PROMPT = `あなたはギフト券売買サイトの協議チャットを監視するモデレーターです。
次の行為を検出してください：
- サイト外取引・直接取引への誘導
- 連絡先（SNS、メッセンジャー、電話、メール等）の交換・示唆
- ギフトコードや口座情報の直接送付・要求（数字の言い換えや分割など回避表現を含む）
- 運営を通さない決済への誘導
verdict は ok / warn / block。明確な違反は block、疑わしい場合は warn。reasons は日本語の短い理由。score は 0〜1 の違反確度。`;

async function geminiJudge(text: string, key: string): Promise<AiVerdict> {
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: `判定対象メッセージ:\n"""${text}"""` }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            verdict: { type: 'STRING', enum: ['ok', 'warn', 'block'] },
            reasons: { type: 'ARRAY', items: { type: 'STRING' } },
            score: { type: 'NUMBER' },
          },
          required: ['verdict', 'reasons', 'score'],
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const j = await res.json();
  const out = JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}');
  if (!['ok', 'warn', 'block'].includes(out.verdict)) throw new Error('unexpected Gemini response');
  return { model, verdict: out.verdict, reasons: out.reasons ?? [], score: Number(out.score ?? 0) };
}

/** Used when no API key is configured, or as a fallback when Gemini is unreachable. */
export function heuristicJudge(text: string): AiVerdict {
  const t = text.normalize('NFKC');
  const signals: [RegExp, string][] = [
    [/直接|個別に|外で|別の(?:場所|アプリ|方法)|サイト外|運営を通さ/, 'サイト外取引への誘導'],
    [/連絡先|連絡(?:して|ください|取り|とり)|DM|メッセージ(?:送って|ください)/i, '連絡先交換の示唆'],
    [/コード(?:を)?(?:送|教え|書|貼)|番号(?:を)?(?:教え|送)/, 'コードの直接送付要求'],
    [/振り?込(?:んで|み先|ん)|口座(?:番号|を教え)|現金で|paypay|ペイペイ/i, '運営外での決済誘導'],
    [/(?:ゼロ|れい|いち|に|さん|よん|ご|ろく|なな|はち|きゅう){4,}/, '数字の言い換え（検知回避の疑い）'],
  ];
  const reasons = signals.filter(([re]) => re.test(t)).map(([, l]) => l);
  return { model: 'local-heuristic', verdict: reasons.length >= 2 ? 'block' : reasons.length ? 'warn' : 'ok', reasons, score: Math.min(0.99, 0.08 + reasons.length * 0.38) };
}

export async function inspectMessage(text: string, aiEnabled: boolean): Promise<Inspection> {
  const ruleHits = ruleCheck(text);
  if (ruleHits.length) return { action: 'block', ruleHits, ai: null };
  if (!aiEnabled) return { action: 'pass', ruleHits, ai: null };
  let ai: AiVerdict;
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    try { ai = await geminiJudge(text, key); }
    catch (e) { ai = { ...heuristicJudge(text), error: String(e).slice(0, 200) }; }
  } else ai = heuristicJudge(text);
  return { action: ai.verdict === 'block' ? 'block' : ai.verdict === 'warn' ? 'flag' : 'pass', ruleHits, ai };
}
