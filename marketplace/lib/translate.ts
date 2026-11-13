import { VillageError, type Village } from "@ambasada/village";

export const LANGUAGES: Record<string, string> = { ro: "Romanian", en: "English", de: "German", fr: "French" };

/** The actual work, shared by the agent-facing offering and the human checkout. Paid from your wallet (LLM, metered in TON). */
export async function translate(ambasada: Village, text: unknown, to: unknown): Promise<string> {
  if (typeof text !== "string" || !text.trim()) throw new VillageError("INVALID_REQUEST", "text is required", 400);
  const language = typeof to === "string" ? LANGUAGES[to.toLowerCase()] : undefined;
  if (!language) throw new VillageError("INVALID_REQUEST", `to must be one of ${Object.keys(LANGUAGES).join(", ")}`, 400);
  if (text.length > 4000) throw new VillageError("INVALID_REQUEST", "text is limited to 4000 characters", 400);

  const res = await ambasada.llm.chat({
    messages: [
      {
        role: "system",
        content: `You are a professional translator. Translate the user's text into ${language}. Keep the tone, register and formatting. Reply with the translation only.`,
      },
      { role: "user", content: text },
    ],
    temperature: 0.2,
  });
  const translation = res.choices[0]?.message.content.trim();
  // Nothing back is not a translation: throw, and the buyer is refunded (never answer 200 with an empty result). A
  // rate limit or an outage of the model (CAP_TOOLS_RATE, TOOL_UNAVAILABLE) is thrown by llm.chat: let it through.
  if (!translation) throw new VillageError("UPSTREAM_ERROR", "the model returned no translation; try again", 502);
  return translation;
}
