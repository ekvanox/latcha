import { OpenRouter } from '@openrouter/sdk';

let client: OpenRouter | null = null;

function getClient(): OpenRouter {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }

  if (!client) {
    client = new OpenRouter({ apiKey });
  }

  return client;
}

function extractTextResponse(response: unknown): string {
  const content = (response as { choices?: Array<{ message?: { content?: unknown } }> })
    .choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof (part as { text?: unknown }).text === 'string'
        ) {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

export async function evaluateWithModel(
  model: string,
  images: { base64: string; mimeType: string }[],
  prompt: string,
): Promise<{ answer: string; latencyMs: number; raw: string }> {
  const start = Date.now();
  const openRouter = getClient();

  const response = await openRouter.chat.send({
    chatGenerationParams: {
      model,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((img) => ({
              type: 'image_url' as const,
              imageUrl: { url: `data:${img.mimeType};base64,${img.base64}` },
            })),
            { type: 'text' as const, text: prompt },
          ],
        },
      ],
      temperature: 0,
      maxTokens: 32,
      stream: false,
    },
  });

  const raw = extractTextResponse(response);
  return { answer: raw, latencyMs: Date.now() - start, raw };
}
