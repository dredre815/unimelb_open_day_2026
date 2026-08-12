const DEFAULT_MAX_BUFFER_BYTES = 1_000_000;

export class NdjsonParseError extends Error {
  readonly lineNumber: number;

  constructor(message: string, lineNumber: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NdjsonParseError";
    this.lineNumber = lineNumber;
  }
}

export type NdjsonValidator<T> = (value: unknown) => T;

export function encodeNdjsonEvent<T>(event: T): string {
  const encoded = JSON.stringify(event);
  if (encoded === undefined) {
    throw new TypeError("NDJSON events must be JSON-serialisable values.");
  }
  return `${encoded}\n`;
}

export function encodeNdjsonEvents<T>(events: Iterable<T>): string {
  let output = "";
  for (const event of events) output += encodeNdjsonEvent(event);
  return output;
}

export class NdjsonParser<T = unknown> {
  private readonly decoder = new TextDecoder();
  private readonly validate: NdjsonValidator<T>;
  private readonly maxBufferBytes: number;
  private buffer = "";
  private lineNumber = 0;
  private firstLine = true;

  constructor(
    validate: NdjsonValidator<T> = (value) => value as T,
    options: { maxBufferBytes?: number } = {},
  ) {
    this.validate = validate;
    this.maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
  }

  push(chunk: Uint8Array | string): T[] {
    this.buffer +=
      typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    this.assertBufferLimit();
    return this.drainCompleteLines();
  }

  finish(): T[] {
    this.buffer += this.decoder.decode();
    this.assertBufferLimit();

    const events = this.drainCompleteLines();
    const finalLine = this.buffer.trim();
    this.buffer = "";
    if (finalLine) events.push(this.parseLine(finalLine));
    return events;
  }

  reset(): void {
    this.buffer = "";
    this.lineNumber = 0;
    this.firstLine = true;
  }

  private assertBufferLimit(): void {
    if (this.buffer.length > this.maxBufferBytes) {
      this.buffer = "";
      throw new NdjsonParseError(
        "The NDJSON stream exceeded the safe buffer limit.",
        this.lineNumber + 1,
      );
    }
  }

  private drainCompleteLines(): T[] {
    const events: T[] = [];
    let newlineIndex = this.buffer.indexOf("\n");

    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, "").trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) events.push(this.parseLine(line));
      else this.lineNumber += 1;
      newlineIndex = this.buffer.indexOf("\n");
    }

    return events;
  }

  private parseLine(line: string): T {
    this.lineNumber += 1;
    const normalised = this.firstLine ? line.replace(/^\uFEFF/, "") : line;
    this.firstLine = false;

    try {
      return this.validate(JSON.parse(normalised) as unknown);
    } catch (error) {
      throw new NdjsonParseError(
        `Invalid NDJSON event at line ${this.lineNumber}.`,
        this.lineNumber,
        { cause: error },
      );
    }
  }
}

export async function parseNdjsonStream<T>(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void | Promise<void>,
  options: {
    validate?: NdjsonValidator<T>;
    signal?: AbortSignal;
    maxBufferBytes?: number;
  } = {},
): Promise<void> {
  const reader = stream.getReader();
  const parser = new NdjsonParser<T>(options.validate, {
    maxBufferBytes: options.maxBufferBytes,
  });

  try {
    while (true) {
      if (options.signal?.aborted) throw options.signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(value)) await onEvent(event);
    }
    for (const event of parser.finish()) await onEvent(event);
  } finally {
    reader.releaseLock();
  }
}

export async function parseNdjsonResponse<T>(
  response: Response,
  onEvent: (event: T) => void | Promise<void>,
  options: {
    validate?: NdjsonValidator<T>;
    signal?: AbortSignal;
    maxBufferBytes?: number;
  } = {},
): Promise<void> {
  if (!response.ok) {
    throw new Error(`NDJSON request failed with HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error("The NDJSON response did not include a body.");
  await parseNdjsonStream(response.body, onEvent, options);
}

export function createNdjsonReadableStream<T>(
  produce: (
    emit: (event: T) => void,
    signal: AbortSignal,
  ) => void | Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const controller = new AbortController();

  return new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
        await produce(
          (event) => streamController.enqueue(encoder.encode(encodeNdjsonEvent(event))),
          controller.signal,
        );
        streamController.close();
      } catch (error) {
        streamController.error(error);
      }
    },
    cancel(reason) {
      controller.abort(reason);
    },
  });
}
