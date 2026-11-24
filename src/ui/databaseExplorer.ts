import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connectionManager';
import { DatabaseMetadata } from '../services/databaseMetadata';

type ExplorerNodeType =
  | 'connection'
  | 'schema-container'
  | 'tables-container'
  | 'views-container'
  | 'functions-container'
  | 'procedures-container'
  | 'triggers-container'
  | 'sequences-container'
  | 'types-container'
  | 'schema'
  | 'table'
  | 'columns-container'
  | 'column'
  | 'indexes-container'
  | 'index'
  | 'view'
  | 'function'
  | 'procedure'
  | 'trigger'
  | 'sequence'
  | 'type'
  | 'error';

interface NodeData {
  type: ExplorerNodeType;
  connectionId?: string;
  schema?: string;
  table?: string;
  view?: string;
  function?: string;
  procedure?: string;
  trigger?: string;
  sequence?: string;
  typeInfo?: string;
  [key: string]: string | ExplorerNodeType | undefined;
}

export class DatabaseExplorerProvider implements vscode.TreeDataProvider<ExplorerItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ExplorerItem | undefined | null | void> =
    new vscode.EventEmitter<ExplorerItem | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<ExplorerItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private metadataCache: Map<string, DatabaseMetadata> = new Map();

  constructor(private connectionManager: ConnectionManager) {}

  refresh(): void {
    this.metadataCache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ExplorerItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ExplorerItem): Promise<ExplorerItem[]> {
    if (!element) {
      // Root level: show connections
      const connections = this.connectionManager.getConnections();
      return connections.map((conn) => {
        const item = new ExplorerItem(
          conn.name,
          'connection',
          vscode.TreeItemCollapsibleState.Collapsed,
          { type: 'connection', connectionId: conn.id },
          new vscode.ThemeIcon(
            'database',
            conn.color ? new vscode.ThemeColor(conn.color) : undefined
          )
        );
        item.description = `${conn.databaseName} · ${conn.region}`;
        return item;
      });
    }

    const nodeData = element.nodeData as NodeData;

    try {
      switch (nodeData.type) {
        case 'connection':
          return [
            new ExplorerItem(
              'Schemas',
              'schema-container',
              vscode.TreeItemCollapsibleState.Collapsed,
              { type: 'schema-container', connectionId: nodeData.connectionId },
              new vscode.ThemeIcon('folder')
            ),
          ];

        case 'schema-container': {
          const metadata = this.getMetadata(nodeData.connectionId!);
          const schemas = await metadata.getSchemas();
          return schemas.map(
            (schema) =>
              new ExplorerItem(
                schema,
                'schema',
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'schema', connectionId: nodeData.connectionId, schema },
                new vscode.ThemeIcon('folder')
              )
          );
        }

        case 'schema': {
          const metadata = this.getMetadata(nodeData.connectionId!);
          const schema = nodeData.schema!;

          const [tables, views, functions, procedures, triggers, sequences, types] =
            await Promise.all([
              metadata.getTables(schema),
              metadata.getViews(schema),
              metadata.getFunctions(schema),
              metadata.getProcedures(schema),
              metadata.getTriggers(schema),
              metadata.getSequences(schema),
              metadata.getTypes(schema),
            ]);

          const items: ExplorerItem[] = [];

          if (tables.length > 0) {
            items.push(
              new ExplorerItem(
                `Tables (${tables.length})`,
                'tables-container',
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'tables-container', connectionId: nodeData.connectionId, schema },
                new vscode.ThemeIcon('symbol-class')
              )
            );
          }

          if (views.length > 0) {
            items.push(
              new ExplorerItem(
                `Views (${views.length})`,
                'views-container',
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'views-container', connectionId: nodeData.connectionId, schema },
                new vscode.ThemeIcon('symbol-interface')
              )
            );
          }

          if (functions.length > 0) {
            items.push(
              new ExplorerItem(
                `Functions (${functions.length})`,
                'functions-container',
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'functions-container', connectionId: nodeData.connectionId, schema },
                new vscode.ThemeIcon('symbol-method')
              )
            );
          }

          if (procedures.length > 0) {
            items.push(
              new ExplorerItem(
                `Procedures (${procedures.length})`,
                'procedures-container',
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'procedures-container', connectionId: nodeData.connectionId, schema },
                new vscode.ThemeIcon('symbol-method')
              )
            );
          }

          if (triggers.length > 0) {
            items.push(
              new ExplorerItem(
                `Triggers (${triggers.length})`,
                'triggers-container',
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'triggers-container', connectionId: nodeData.connectionId, schema },
                new vscode.ThemeIcon('zap')
              )
            );
          }

          if (sequences.length > 0) {
            items.push(
              new ExplorerItem(
                `Sequences (${sequences.length})`,
                'sequences-container',
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'sequences-container', connectionId: nodeData.connectionId, schema },
                new vscode.ThemeIcon('symbol-numeric')
              )
            );
          }

          if (types.length > 0) {
            items.push(
              new ExplorerItem(
                `Types (${types.length})`,
                'types-container',
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'types-container', connectionId: nodeData.connectionId, schema },
                new vscode.ThemeIcon('symbol-type-parameter')
              )
            );
          }

          return items;
        }

        case 'tables-container': {
          const metadata = this.getMetadata(nodeData.connectionId!);
          const tables = await metadata.getTables(nodeData.schema!);
          return tables.map(
            (table) =>
              new ExplorerItem(
                table.name,
                'table',
                vscode.TreeItemCollapsibleState.Collapsed,
                {
                  type: 'table',
                  connectionId: nodeData.connectionId,
                  schema: nodeData.schema,
                  table: table.name,
                },
                new vscode.ThemeIcon('symbol-class')
              )
          );
        }

        case 'table': {
          return [
            new ExplorerItem(
              'Columns',
              'columns-container',
              vscode.TreeItemCollapsibleState.Collapsed,
              {
                type: 'columns-container',
                connectionId: nodeData.connectionId,
                schema: nodeData.schema,
                table: nodeData.table,
              },
              new vscode.ThemeIcon('symbol-property')
            ),
            new ExplorerItem(
              'Indexes',
              'indexes-container',
              vscode.TreeItemCollapsibleState.Collapsed,
              {
                type: 'indexes-container',
                connectionId: nodeData.connectionId,
                schema: nodeData.schema,
                table: nodeData.table,
              },
              new vscode.ThemeIcon('search')
            ),
          ];
        }

        case 'columns-container': {
          const metadata = this.getMetadata(nodeData.connectionId!);
          const tableInfo = await metadata.getTableColumns(nodeData.schema!, nodeData.table!);
          return tableInfo.columns.map(
            (col) =>
              new ExplorerItem(
                `${col.name}: ${col.type}${col.isNullable ? '' : ' NOT NULL'}`,
                'column',
                vscode.TreeItemCollapsibleState.None,
                {
                  type: 'column',
                  connectionId: nodeData.connectionId,
                  schema: nodeData.schema,
                  table: nodeData.table,
                  column: col.name,
                },
                new vscode.ThemeIcon('symbol-field')
              )
          );
        }

        case 'indexes-container': {
          const metadata = this.getMetadata(nodeData.connectionId!);
          const indexes = await metadata.getTableIndexes(nodeData.schema!, nodeData.table!);
          return indexes.map(
            (idx) =>
              new ExplorerItem(
                idx.name,
                'index',
                vscode.TreeItemCollapsibleState.None,
                {
                  type: 'index',
                  connectionId: nodeData.connectionId,
                  schema: nodeData.schema,
                  table: nodeData.table,
                  index: idx.name,
                },
                new vscode.ThemeIcon('search')
              )
          );
        }

        case 'views-container': {
          const metadata = this.getMetadata(nodeData.connectionId!);
          const views = await metadata.getViews(nodeData.schema!);
          return views.map(
            (view) =>
              new ExplorerItem(
                view.name,
                'view',
                vscode.TreeItemCollapsibleState.None,
                {
                  type: 'view',
                  connectionId: nodeData.connectionId,
                  schema: nodeData.schema,
                  view: view.name,
                },
                new vscode.ThemeIcon('symbol-interface')
              )
          );
        }

        case 'functions-container': {
          const metadata = this.getMetadata(nodeData.connectionId!);
          const functions = await metadata.getFunctions(nodeData.schema!);
          return functions.map((fn) => {
            const item = new ExplorerItem(
              fn.name,
              'function',
              vscode.TreeItemCollapsibleState.None,
              {
                type: 'function',
                connectionId: nodeData.connectionId,
                schema: nodeData.schema,
                function: fn.name,
              },
              new vscode.ThemeIcon('symbol-method')
            );
            item.description = `\u2192 ${fn.returnType}`;
            item.tooltip = `${nodeData.schema}.${fn.name}() \u2192 ${fn.returnType}`;
            return item;
          });
        }

        case 'procedures-container': {
          const metadata = this.getMetadata(nodeData.connectionId!);
          const procedures = await metadata.getProcedures(nodeData.schema!);
          return procedures.map(
            (proc) =>
              new ExplorerItem(
                proc.name,
                'procedure',
                vscode.TreeItemCollapsibleState.None,
                {
                  type: 'procedure',
                  connectionId: nodeData.connectionId,
                  schema: nodeData.schema,
                  procedure: proc.name,
                },
                new vscode.ThemeIcon('symbol-method')
              )
          );
        }

        case 'triggers-container': {
          const metadata = this.getMetadata(nodeData.connectionId!);
          const triggers = await metadata.getTriggers(nodeData.schema!);
          return triggers.map((trg) => {
            const item = new ExplorerItem(
              trg.name,
              'trigger',
              vscode.TreeItemCollapsibleState.None,
              {
                type: 'trigger',
                connectionId: nodeData.connectionId,
                schema: nodeData.schema,
                trigger: trg.name,
              },
              new vscode.ThemeIcon('zap')
            );
            item.description = `${trg.eventManipulation} on ${trg.tableName}`;
            item.tooltip = `${trg.name}\n${trg.eventOrientation} ${trg.eventManipulation} on ${nodeData.schema}.${trg.tableName}`;
            return item;
          });
        }

        case 'sequences-container': {
          const metadata = this.getMetadata(nodeData.connectionId!);
          const sequences = await metadata.getSequences(nodeData.schema!);
          return sequences.map((seq) => {
            const item = new ExplorerItem(
              seq.name,
              'sequence',
              vscode.TreeItemCollapsibleState.None,
              {
                type: 'sequence',
                connectionId: nodeData.connectionId,
                schema: nodeData.schema,
                sequence: seq.name,
              },
              new vscode.ThemeIcon('symbol-numeric')
            );
            item.description = `${seq.dataType} \u00b7 last ${seq.lastValue ?? '\u2014'}`;
            item.tooltip = [
              `Data type: ${seq.dataType}`,
              `Last stored value: ${seq.lastValue ?? 'not available'}`,
              `Start: ${seq.startValue}`,
              `Minimum: ${seq.minimumValue}`,
              `Maximum: ${seq.maximumValue}`,
              `Increment: ${seq.increment}`,
              `Cache: ${seq.cacheSize}`,
              `Cycles: ${seq.cycles ? 'yes' : 'no'}`,
            ].join('\n');
            return item;
          });
        }

        case 'types-container': {
          const metadata = this.getMetadata(nodeData.connectionId!);
          const types = await metadata.getTypes(nodeData.schema!);
          return types.map((type) => {
            const item = new ExplorerItem(
              type.name,
              'type',
              vscode.TreeItemCollapsibleState.None,
              {
                type: 'type',
                connectionId: nodeData.connectionId,
                schema: nodeData.schema,
                typeInfo: type.name,
              },
              new vscode.ThemeIcon('symbol-type-parameter')
            );
            item.description = type.kind.toLowerCase();
            return item;
          });
        }

        default:
          return [];
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[RDS Explorer] Failed to load ${nodeData.type}: ${message}`, error);
      return [
        new ExplorerItem(
          `Error loading ${nodeData.type}: ${message}`,
          'error',
          vscode.TreeItemCollapsibleState.None,
          { type: 'error' },
          new vscode.ThemeIcon('error')
        ),
      ];
    }
  }

  private getMetadata(connectionId: string): DatabaseMetadata {
    if (!this.metadataCache.has(connectionId)) {
      const conn = this.connectionManager.getConnection(connectionId);
      if (!conn) {
        throw new Error(`Connection ${connectionId} not found`);
      }
      this.metadataCache.set(connectionId, new DatabaseMetadata(conn));
    }
    return this.metadataCache.get(connectionId)!;
  }
}

export class ExplorerItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly nodeType: ExplorerNodeType,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly nodeData: NodeData,
    public readonly iconPath?: vscode.ThemeIcon
  ) {
    super(label, collapsibleState);
    this.contextValue = nodeType;

    const definitionCommand = DEFINITION_COMMANDS[nodeType];
    if (definitionCommand) {
      this.command = { command: definitionCommand, title: 'Open Definition', arguments: [this] };
    }
  }
}

const DEFINITION_COMMANDS: Partial<Record<ExplorerNodeType, string>> = {
  view: 'rds-explorer.viewViewCode',
  function: 'rds-explorer.viewFunctionCode',
  procedure: 'rds-explorer.viewProcedureCode',
  trigger: 'rds-explorer.viewTriggerCode',
  type: 'rds-explorer.viewTypeCode',
  sequence: 'rds-explorer.viewSequenceCode',
};
