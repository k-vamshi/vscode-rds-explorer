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

      const columnMetadata = response.columnMetadata || [];
      const columns = this.uniqueColumnNames(columnMetadata.map((col) => col.name || ''));
      const rows = this.parseResults(response.records || [], columns);

      return {
        rows,
        columns,
        columnTypes: columnMetadata.map((col) => col.typeName || ''),
        rowCount: rows.length,
        updatedRows: response.numberOfRecordsUpdated,
        executionTime,
      };
    } catch (error) {
      throw new Error(
        `Query execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Joins often return duplicate names (e.g. two `id` columns); suffix them so no values are lost
  private uniqueColumnNames(names: string[]): string[] {
    const seen = new Map<string, number>();
    return names.map((rawName, index) => {
      const name = rawName || `col_${index}`;
      const count = (seen.get(name) ?? 0) + 1;
      seen.set(name, count);
      return count === 1 ? name : `${name}_${count}`;
    });
  }

  private parseResults(records: unknown[], columns: string[]): Record<string, unknown>[] {
    return records.map((record) => {
      const row: Record<string, unknown> = {};
      (record as unknown[]).forEach((value, index) => {
        row[columns[index] ?? `col_${index}`] = this.parseField(value);
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
    if (value.blobValue) {
      return `\\x${Buffer.from(value.blobValue).toString('hex')}`;
    }

    return (
      value.stringValue ??
      value.longValue ??
      value.doubleValue ??
      value.booleanValue ??
      value.arrayValue ??
      value.structValue ??
      field
    );
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}
