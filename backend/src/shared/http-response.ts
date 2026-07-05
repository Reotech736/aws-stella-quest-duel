import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

export function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body),
  };
}
