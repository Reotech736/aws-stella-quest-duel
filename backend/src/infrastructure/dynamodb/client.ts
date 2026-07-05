import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  type GetCommand,
  type TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

export type SupportedDocumentCommand = GetCommand | TransactWriteCommand;

export interface DocumentClientPort {
  send(command: SupportedDocumentCommand): Promise<unknown>;
}

export function createDocumentClient(
  config: DynamoDBClientConfig = {},
): DocumentClientPort {
  const lowLevelClient = new DynamoDBClient(config);
  const documentClient = DynamoDBDocumentClient.from(lowLevelClient, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });

  return documentClient;
}
