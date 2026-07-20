import { describe, expect, it } from "vitest";

import { createRequestId } from "./request-id";

describe("createRequestId", () => {
  it("randomUUIDが利用できないHTTP環境でもUUID v4形式を生成する", () => {
    const randomSource = {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        const bytes = array as Uint8Array;
        bytes.forEach((_, index) => {
          bytes[index] = index;
        });
        return array;
      },
    };

    expect(createRequestId(randomSource)).toBe(
      "00010203-0405-4607-8809-0a0b0c0d0e0f",
    );
  });
});
