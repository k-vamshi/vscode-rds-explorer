import * as vscode from 'vscode';
import { DBConnection } from '../types';

export class ConnectionManager {
  private connections: Map<string, DBConnection> = new Map();
  private context: vscode.ExtensionContext;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private readonly STORAGE_KEY = 'rds-explorer-connections';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadConnections();
  }

  async addConnection(connection: DBConnection): Promise<void> {
    this.validateConnection(connection);

    this.connections.set(connection.id, connection);
    await this.saveConnections();
  }

  async updateConnection(connection: DBConnection): Promise<void> {
    if (!this.connections.has(connection.id)) {
      throw new Error(`Connection ${connection.id} not found`);
    }

    this.validateConnection(connection);
    this.connections.set(connection.id, connection);
    await this.saveConnections();
  }

  async removeConnection(id: string): Promise<void> {
    this.connections.delete(id);
    await this.saveConnections();
  }

  getConnection(id: string): DBConnection | undefined {
    return this.connections.get(id);
  }

  getConnections(): DBConnection[] {
    return Array.from(this.connections.values());
  }

  private validateConnection(connection: DBConnection): void {
    if (
      !connection.name.trim() ||
      !connection.dbClusterArn.trim() ||
      !connection.secretArn.trim()
    ) {
      throw new Error('Connection name, DB cluster ARN, and secret ARN are required');
    }
  }

  private loadConnections(): void {
    const stored = this.context.globalState.get<string>(this.STORAGE_KEY);
    if (stored) {
      try {
        const connections = JSON.parse(stored) as DBConnection[];
        connections.forEach((conn) => {
          this.connections.set(conn.id, conn);
        });
      } catch (error) {
        // Error loading connections will be silently ignored
      }
    }
  }

  private async saveConnections(): Promise<void> {
    const connections = Array.from(this.connections.values());
    await this.context.globalState.update(this.STORAGE_KEY, JSON.stringify(connections));
  }
}
