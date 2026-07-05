import { describe, expect, it } from "vitest";

import { jsonResponse } from "../src/shared/http-response";

describe("jsonResponse", () => {
  it("JSON形式のLambdaレスポンスを生成する", () => {
    const response = jsonResponse(200, {
      data: {
        ok: true,
      },
    });

    expect(response).toEqual({
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        data: {
          ok: true,
        },
      }),
    });
  });
});
