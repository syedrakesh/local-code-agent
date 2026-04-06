// src/providers/llm/OllamaApiProvider.ts
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { LLMProvider, LLMMessage, LLMOptions, HealthStatus } from '../../models';
import { logger } from '../../utils/logger';

interface OllamaChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
  keep_alive?: string;
}

interface OllamaChunkDelta {
  role?: string;
  content: string;
}

interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: OllamaChunkDelta;
  done: boolean;
}

interface OllamaTagsResponse {
  models: { name: string }[];
}

export class OllamaApiProvider implements LLMProvider {
  constructor(
    private baseUrl: string,
    private model: string
  ) {}

  /** Generic fetch that works with Node's built-in http/https. */
  private request(
    urlStr: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const payload = JSON.stringify(body);
      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const transport = url.protocol === 'https:' ? https : http;
      const req = transport.request(options, resolve);
      req.on('error', reject);

      if (signal) {
        signal.addEventListener('abort', () => {
          req.destroy(new Error('AbortError'));
          reject(new Error('AbortError'));
        });
      }

      req.write(payload);
      req.end();
    });
  }

  private async getRequest(urlStr: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const transport = url.protocol === 'https:' ? https : http;
      transport.get({ hostname: url.hostname, port: url.port, path: url.pathname }, (res) => {
        let data = '';
        res.on('data', (c: Buffer) => { data += c.toString(); });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  async chat(messages: LLMMessage[], options?: LLMOptions): Promise<string> {
    const result: string[] = [];
    await this.streamChat(messages, options ?? {}, token => { result.push(token); });
    return result.join('');
  }

  async streamChat(
    messages: LLMMessage[],
    options: LLMOptions,
    onToken: (token: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const reqBody: OllamaChatRequest = {
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      options: {
        temperature: options.temperature ?? 0.2,
        top_p: options.topP ?? 0.9,
        num_predict: options.numPredict ?? 4096,
      },
      keep_alive: options.keepAlive ?? '5m',
    };

    logger.debug('Ollama chat request:', JSON.stringify(reqBody).slice(0, 200));

    const res = await this.request(`${this.baseUrl}/api/chat`, reqBody, signal);

    if (res.statusCode !== 200) {
      const errBody = await new Promise<string>(r => {
        let d = '';
        res.on('data', (c: Buffer) => { d += c.toString(); });
        res.on('end', () => r(d));
      });
      throw new Error(`Ollama API error ${res.statusCode}: ${errBody}`);
    }

    await new Promise<void>((resolve, reject) => {
      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed: OllamaStreamChunk = JSON.parse(line);
            if (parsed.message?.content) {
              onToken(parsed.message.content);
            }
            if (parsed.done) {
              resolve();
            }
          } catch (e) {
            logger.warn('Failed to parse chunk:', line, e);
          }
        }
      });
      res.on('end', () => resolve());
      res.on('error', reject);
    });
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const raw = await Promise.race<string>([
        this.getRequest(`${this.baseUrl}/api/tags`),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      const data: OllamaTagsResponse = JSON.parse(raw);
      const availableModels = (data.models ?? []).map(m => m.name);
      return { reachable: true, model: this.model, availableModels };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { reachable: false, model: this.model, availableModels: [], error: message };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const raw = await this.getRequest(`${this.baseUrl}/api/tags`);
      const data: OllamaTagsResponse = JSON.parse(raw);
      return (data.models ?? []).map(m => m.name);
    } catch {
      return [];
    }
  }

  setModel(model: string): void {
    this.model = model;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }
}
