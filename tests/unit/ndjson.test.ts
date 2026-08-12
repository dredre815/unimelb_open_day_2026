import { describe, expect, it } from "vitest";

import {
  NdjsonParseError,
  NdjsonParser,
  encodeNdjsonEvents,
  parseNdjsonStream,
} from "@/lib/ndjson";

describe("NDJSON streaming", () => {
  it("buffers partial string chunks and a final line without a newline", () => {
    const parser = new NdjsonParser<{ id: number }>();

    expect(parser.push('{"id":')).toEqual([]);
    expect(parser.push('1}\n{"id"')).toEqual([{ id: 1 }]);
    expect(parser.push(':2}')).toEqual([]);
    expect(parser.finish()).toEqual([{ id: 2 }]);
  });

  it("preserves split multibyte UTF-8 characters", () => {
    const parser = new NdjsonParser<{ message: string }>();
    const bytes = new TextEncoder().encode('{"message":"校园"}\n');
    const events: Array<{ message: string }> = [];

    for (const byte of bytes) events.push(...parser.push(Uint8Array.of(byte)));
    events.push(...parser.finish());

    expect(events).toEqual([{ message: "校园" }]);
  });

  it("applies validation and reports the failing line number", () => {
    const parser = new NdjsonParser<{ type: string }>((value) => {
      if (
        typeof value !== "object" ||
        value === null ||
        !("type" in value) ||
        typeof value.type !== "string"
      ) {
        throw new Error("Missing type");
      }
      return value as { type: string };
    });

    expect(() => parser.push('{"type":"ok"}\n{"bad":true}\n')).toThrowError(
      expect.objectContaining<Partial<NdjsonParseError>>({
        name: "NdjsonParseError",
        lineNumber: 2,
      }),
    );
  });

  it("fails closed when an unterminated buffer exceeds its limit", () => {
    const parser = new NdjsonParser(undefined, { maxBufferBytes: 8 });
    expect(() => parser.push("123456789")).toThrow(NdjsonParseError);
  });

  it("parses arbitrary response chunks in stream order", async () => {
    const encoded = new TextEncoder().encode(
      encodeNdjsonEvents([{ id: 1 }, { id: 2 }, { id: 3 }]),
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 5));
        controller.enqueue(encoded.slice(5, 17));
        controller.enqueue(encoded.slice(17));
        controller.close();
      },
    });
    const events: Array<{ id: number }> = [];

    await parseNdjsonStream<{ id: number }>(stream, (event) => {
      events.push(event);
    });
    expect(events).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });
});
