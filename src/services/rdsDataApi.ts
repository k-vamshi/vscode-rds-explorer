import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { DBConnection, QueryResult } from '../types';

export class RDSDataAPIClient {
  private client: RDSDataClient;
  private connection: DBConnection;

  constructor(connection: DBConnection) {
    this.connection = connection;

    // Initialize RDS Data API client with credential provider
    this.client = new RDSDataClient({
      region: connection.region,
      credentials: defaultProvider({ profile: connection.awsProfile }),
    });
  }

  async executeQuery(sql: string, parameters: Record<string, string> = {}): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      if (!this.connection.secretArn) {
        throw new Error('A Secrets Manager secret ARN is required for the RDS Data API');
      }

      const command = new ExecuteStatementCommand({
        resourceArn: this.connection.dbClusterArn,
        secretArn: this.connection.secretArn,
        database: this.connection.databaseName,
        sql,
        parameters: Object.entries(parameters).map(([name, value]) => ({
          name,
          value: { stringValue: value },
        })),
        includeResultMetadata: true,
      });

      const response = await this.client.send(command);
      const executionTime = Date.now() - startTime;

      const rows = this.parseResults(response.records || [], response.columnMetadata || []);

      return {
        rows,
        columns: (response.columnMetadata || []).map((col) => col.name || ''),
        rowCount: rows.length,
        executionTime,
      };
    } catch (error) {
      throw new Error(
        `Query execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private parseResults(
    records: unknown[] | undefined,
    columnMetadata:
      | Array<{
          name?: string;
        }>
      | undefined
  ): Record<string, unknown>[] {
    if (!records || !columnMetadata) {
      return [];
    }

    return (records as unknown[]).map((record) => {
      const row: Record<string, unknown> = {};
      const recordArray = record as Array<unknown>;
      recordArray.forEach((value: unknown, index: number) => {
        const colName = columnMetadata[index]?.name || `col_${index}`;
        row[colName] = this.parseField(value);
      });
      return row;
    });
  }

  private parseField(field: unknown): unknown {
    if (typeof field !== 'object' || field === null) {
      return field;
    }

    const value = field as {
      stringValue?: string;
      longValue?: number;
      doubleValue?: number;
      booleanValue?: boolean;
      blobValue?: Uint8Array;
      isNull?: boolean;
      arrayValue?: unknown;
      structValue?: unknown;
    };

    if (value.isNull) {
      return null;
    }

    return (
      value.stringValue ??
      value.longValue ??
      value.doubleValue ??
      value.booleanValue ??
      value.blobValue ??
      value.arrayValue ??
      value.structValue ??
      field
    );
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}
