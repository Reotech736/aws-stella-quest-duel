import type { APIGatewayProxyHandlerV2 } from "aws-lambda";

import { jsonResponse } from "./http-response";

export function createNotImplementedHandler(
  handlerName: string,
): APIGatewayProxyHandlerV2 {
  return async () =>
    jsonResponse(501, {
      error: {
        code: "NOT_IMPLEMENTED",
        message: "このAPIはまだ実装されていません。",
      },
      meta: {
        handler: handlerName,
      },
    });
}
