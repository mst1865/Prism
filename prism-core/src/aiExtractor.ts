import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

export interface KnowledgeExtractor {
  extract(markdown: string, sourceName: string): Promise<string>;
}

export class AnthropicKnowledgeExtractor implements KnowledgeExtractor {
  private readonly client: Anthropic;

  constructor(client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  })) {
    this.client = client;
  }

  async extract(markdown: string, sourceName: string): Promise<string> {
    const response = await this.client.messages.create({
      model: process.env.LLM_MODEL_NAME || "claude-3-haiku-20240307",
      max_tokens: 2048,
      temperature: 0.1,
      system: [
        "You are a precise knowledge management assistant.",
        "Return a clean Markdown knowledge card.",
        "Start with YAML frontmatter containing tags.",
        "Then include a title, concise summary, key points, and important facts.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: `Source file: ${sourceName}\n\nExtract a clean knowledge card from this converted Markdown:\n\n${markdown.slice(0, 50000)}`,
        },
      ],
    });

    const text = response.content.find((block) => block.type === "text");
    return text?.text ?? "---\ntags: [ai_extract_empty]\n---\n\n# Empty AI Response";
  }
}

export async function retryExtract(
  extractor: KnowledgeExtractor,
  markdown: string,
  sourceName: string,
  attempts = 3,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await extractor.extract(markdown, sourceName);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
