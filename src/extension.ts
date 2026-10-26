import * as vscode from 'vscode';
import { ConnectionManager } from './services/connectionManager';
import { DatabaseMetadata } from './services/databaseMetadata';
import { RDSDataAPIClient } from './services/rdsDataApi';
import { DBConnection } from './types';
import { DatabaseExplorerProvider, ExplorerItem } from './ui/databaseExplorer';
import { QueryHistoryNode, QueryHistoryProvider } from './ui/queryHistory';
import { ResultsViewProvider } from './ui/resultsViewer';
import { ConstraintsDetailProvider } from './ui/constraintsDetail';
import { CodeViewerProvider } from './ui/codeViewer';

let connectionManager: ConnectionManager;
let databaseExplorerProvider: DatabaseExplorerProvider;
let outputChannel: vscode.OutputChannel;
let resultsViewProvider: ResultsViewProvider;
let constraintsDetailProvider: ConstraintsDetailProvider;
let codeViewerProvider: CodeViewerProvider;
let queryConnectionStatusItem: vscode.StatusBarItem | undefined;
const queryConnectionIds = new Map<string, string>();

type ConnectionDetails = Omit<DBConnection, 'id'>;

export function activate(context: vscode.ExtensionContext) {
  try {
    outputChannel = vscode.window.createOutputChannel('RDS Explorer');
    outputChannel.appendLine('🚀 RDS Explorer extension is starting...');
    console.log('[RDS Explorer] Extension activating...');

    // Initialize services
    outputChannel.appendLine('Initializing ConnectionManager...');
    connectionManager = new ConnectionManager(context);
    outputChannel.appendLine('✓ ConnectionManager initialized');

    queryConnectionStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    queryConnectionStatusItem.command = 'rds-explorer.selectQueryConnection';
    context.subscriptions.push(queryConnectionStatusItem);
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        updateQueryConnectionStatus(connectionManager);
      })
    );

    outputChannel.appendLine('Initializing DatabaseExplorerProvider...');
    databaseExplorerProvider = new DatabaseExplorerProvider(connectionManager);
    outputChannel.appendLine('✓ DatabaseExplorerProvider initialized');

    outputChannel.appendLine('Initializing ResultsViewProvider...');
    resultsViewProvider = new ResultsViewProvider(context);
    outputChannel.appendLine('✓ ResultsViewProvider initialized');

    outputChannel.appendLine('Initializing ConstraintsDetailProvider...');
    constraintsDetailProvider = new ConstraintsDetailProvider();
    outputChannel.appendLine('✓ ConstraintsDetailProvider initialized');

    outputChannel.appendLine('Initializing CodeViewerProvider...');
    codeViewerProvider = new CodeViewerProvider();
    outputChannel.appendLine('✓ CodeViewerProvider initialized');

    // Register tree view providers
    outputChannel.appendLine('Registering rdsExplorer tree view...');
    vscode.window.registerTreeDataProvider('rdsExplorer', databaseExplorerProvider);
    outputChannel.appendLine('✓ rdsExplorer tree view registered');

    outputChannel.appendLine('Initializing QueryHistoryProvider...');
    const queryHistoryProvider = new QueryHistoryProvider();
    outputChannel.appendLine('✓ QueryHistoryProvider initialized');

    outputChannel.appendLine('Registering rdsQueryHistory tree view...');
    vscode.window.registerTreeDataProvider('rdsQueryHistory', queryHistoryProvider);
    outputChannel.appendLine('✓ rdsQueryHistory tree view registered');

    // Register commands
    outputChannel.appendLine('Registering commands...');
    registerCommands(context, connectionManager, databaseExplorerProvider, queryHistoryProvider);
    outputChannel.appendLine('✓ Commands registered');

    outputChannel.appendLine('🎉 RDS Explorer activated successfully!');
    console.log('[RDS Explorer] Activation complete');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'N/A';
    console.error('[RDS Explorer] Activation failed:', errorMsg);
    console.error('[RDS Explorer] Stack:', errorStack);
    outputChannel.appendLine(`❌ ACTIVATION FAILED: ${errorMsg}`);
    outputChannel.appendLine(`Stack: ${errorStack}`);
    outputChannel.show(true);
    vscode.window.showErrorMessage(`RDS Explorer activation failed: ${errorMsg}`);
    throw error;
  }
}

function registerCommands(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  databaseExplorerProvider: DatabaseExplorerProvider,
  queryHistoryProvider: QueryHistoryProvider
) {
  // Open Connection
  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.openConnection', async () => {
      try {
        outputChannel.appendLine('📝 Opening connection dialog...');
        const details = await promptForConnection();
        if (!details) {
          return;
        }

        outputChannel.appendLine('💾 Saving connection...');
        await connectionManager.addConnection({
          id: `conn-${Date.now()}`,
          ...details,
        });

        outputChannel.appendLine(`✓ Connection saved successfully`);
        vscode.window.showInformationMessage(`Connection "${details.name}" created successfully`);
        databaseExplorerProvider.refresh();
        outputChannel.appendLine(`✓ Explorer refreshed`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : 'N/A';
        outputChannel.appendLine(`❌ Error creating connection: ${errorMsg}`);
        outputChannel.appendLine(`Stack: ${errorStack}`);
        vscode.window.showErrorMessage(`Failed to create connection: ${errorMsg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.editConnection', async (item?: ExplorerItem) => {
      const connectionId = item?.nodeData.connectionId;
      const connection = connectionId ? connectionManager.getConnection(connectionId) : undefined;
      if (!connection) {
        vscode.window.showErrorMessage('Select a database connection to edit');
        return;
      }

      try {
        const details = await promptForConnection(connection);
        if (!details) {
          return;
        }

        await connectionManager.updateConnection({ id: connection.id, ...details });
        databaseExplorerProvider.refresh();
        vscode.window.showInformationMessage(`Connection "${details.name}" updated`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to update connection: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rds-explorer.deleteConnection',
      async (item?: ExplorerItem) => {
        const connectionId = item?.nodeData.connectionId;
        const connection = connectionId ? connectionManager.getConnection(connectionId) : undefined;
        if (!connection) {
          vscode.window.showErrorMessage('Select a database connection to delete');
          return;
        }

        const confirmation = await vscode.window.showWarningMessage(
          `Delete connection "${connection.name}"?`,
          { modal: true, detail: 'This removes the saved connection from this workspace profile.' },
          'Delete'
        );
        if (confirmation !== 'Delete') {
          return;
        }

        try {
          await connectionManager.removeConnection(connection.id);
          databaseExplorerProvider.refresh();
          vscode.window.showInformationMessage(`Connection "${connection.name}" deleted`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to delete connection: ${message}`);
        }
      }
    )
  );

  // Refresh Explorer
  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.refreshExplorer', () => {
      databaseExplorerProvider.refresh();
    })
  );

  // New Query
  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.newQuery', async (item?: ExplorerItem) => {
      const nodeData = item?.nodeData;
      const connectionId = nodeData?.connectionId;
      const connection = connectionId ? connectionManager.getConnection(connectionId) : undefined;
      const doc = await vscode.workspace.openTextDocument({
        language: 'sql',
        content: '',
      });
      if (connection) {
        queryConnectionIds.set(doc.uri.toString(), connection.id);
      }
      await vscode.window.showTextDocument(doc);
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      queryConnectionIds.delete(document.uri.toString());
      updateQueryConnectionStatus(connectionManager);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.selectQueryConnection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'sql') {
        vscode.window.showWarningMessage('Open a SQL query editor to select its connection');
        return;
      }

      const connection = await selectConnection(connectionManager);
      if (!connection) {
        return;
      }

      queryConnectionIds.set(editor.document.uri.toString(), connection.id);
      updateQueryConnectionStatus(connectionManager);
      vscode.window.showInformationMessage(`Query connection set to "${connection.name}"`);
    })
  );

  // Execute Query
  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.executeQuery', async (connectionId?: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active SQL editor');
        return;
      }

      const selectedText = editor.selection.isEmpty
        ? ''
        : editor.document.getText(editor.selection);
      const query = (selectedText.trim() ? selectedText : editor.document.getText()).trim();
      if (!query.trim()) {
        vscode.window.showWarningMessage('No SQL query to execute');
        return;
      }

      const queryConnectionId =
        (typeof connectionId === 'string' ? connectionId : undefined) ??
        queryConnectionIds.get(editor.document.uri.toString());
      const connection = await selectConnection(connectionManager, queryConnectionId);
      if (!connection) {
        return;
      }

      queryConnectionIds.set(editor.document.uri.toString(), connection.id);
      updateQueryConnectionStatus(connectionManager);
      await executeSqlQuery(query, connection, queryHistoryProvider);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rds-explorer.runHistoryQuery',
      async (node?: QueryHistoryNode) => {
        const historyItem = node?.item;
        if (!historyItem) {
          vscode.window.showWarningMessage('Select a query from Query History');
          return;
        }

        const connection = connectionManager.getConnection(historyItem.connectionId);
        if (!connection) {
          vscode.window.showWarningMessage(
            `Connection "${historyItem.connectionName}" is no longer available`
          );
          return;
        }

        const document = await vscode.workspace.openTextDocument({
          language: 'sql',
          content: historyItem.query,
        });
        queryConnectionIds.set(document.uri.toString(), connection.id);
        await vscode.window.showTextDocument(document);
        updateQueryConnectionStatus(connectionManager);
        await executeSqlQuery(historyItem.query, connection, queryHistoryProvider);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.selectTop10', async (item?: ExplorerItem) => {
      const nodeData = item?.nodeData;
      const connection = nodeData?.connectionId
        ? connectionManager.getConnection(nodeData.connectionId)
        : undefined;
      if (!connection || nodeData?.type !== 'table' || !nodeData.schema || !nodeData.table) {
        vscode.window.showWarningMessage('Select a table in the database explorer');
        return;
      }

      const query = `SELECT * FROM ${quoteIdentifier(nodeData.schema)}.${quoteIdentifier(nodeData.table)} LIMIT 10;`;
      const document = await vscode.workspace.openTextDocument({ language: 'sql', content: query });
      queryConnectionIds.set(document.uri.toString(), connection.id);
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('rds-explorer.executeQuery', connection.id);
    })
  );

  // View Column Constraints
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rds-explorer.viewColumnConstraints',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (schema: string, table: string, column: string) => {
        const connection = connectionManager.getConnections()[0];
        if (!connection) {
          vscode.window.showWarningMessage('No database connection available');
          return;
        }

        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { DatabaseMetadata } = await import('./services/databaseMetadata');
        const metadata = new DatabaseMetadata(connection);

        try {
          await constraintsDetailProvider.showColumnConstraints(
            context,
            metadata,
            schema,
            table,
            column
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to load constraints: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    )
  );

  // View Foreign Key Relationships
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rds-explorer.viewForeignKeys',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (schema: string, table: string) => {
        const connection = connectionManager.getConnections()[0];
        if (!connection) {
          vscode.window.showWarningMessage('No database connection available');
          return;
        }

        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { DatabaseMetadata } = await import('./services/databaseMetadata');
        const metadata = new DatabaseMetadata(connection);

        try {
          await constraintsDetailProvider.showForeignKeyRelationships(
            context,
            metadata,
            schema,
            table
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to load foreign keys: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    )
  );

  const registerDefinitionCommand = (
    commandId: string,
    field: 'view' | 'function' | 'procedure' | 'trigger' | 'typeInfo' | 'sequence',
    label: string,
    showDefinition: (metadata: DatabaseMetadata, schema: string, name: string) => Promise<void>
  ) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, async (item?: ExplorerItem) => {
        const nodeData = item?.nodeData;
        const connection = nodeData?.connectionId
          ? connectionManager.getConnection(nodeData.connectionId)
          : undefined;
        const name = nodeData?.[field];

        if (!connection || !nodeData?.schema || typeof name !== 'string') {
          vscode.window.showWarningMessage(`Select a ${label} in the database explorer`);
          return;
        }

        try {
          await showDefinition(new DatabaseMetadata(connection), nodeData.schema, name);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to load ${label} definition: ${message}`);
        }
      })
    );
  };

  registerDefinitionCommand('rds-explorer.viewViewCode', 'view', 'view', (metadata, schema, name) =>
    codeViewerProvider.showViewDefinition(context, metadata, schema, name)
  );
  registerDefinitionCommand(
    'rds-explorer.viewFunctionCode',
    'function',
    'function',
    (metadata, schema, name) =>
      codeViewerProvider.showFunctionDefinition(context, metadata, schema, name)
  );
  registerDefinitionCommand(
    'rds-explorer.viewProcedureCode',
    'procedure',
    'procedure',
    (metadata, schema, name) =>
      codeViewerProvider.showProcedureDefinition(context, metadata, schema, name)
  );
  registerDefinitionCommand(
    'rds-explorer.viewTriggerCode',
    'trigger',
    'trigger',
    (metadata, schema, name) =>
      codeViewerProvider.showTriggerDefinition(context, metadata, schema, name)
  );
  registerDefinitionCommand(
    'rds-explorer.viewTypeCode',
    'typeInfo',
    'type',
    (metadata, schema, name) =>
      codeViewerProvider.showTypeDefinition(context, metadata, schema, name)
  );
  registerDefinitionCommand(
    'rds-explorer.viewSequenceCode',
    'sequence',
    'sequence',
    (metadata, schema, name) =>
      codeViewerProvider.showSequenceDefinition(context, metadata, schema, name)
  );
}

async function promptForConnection(
  existing?: DBConnection
): Promise<ConnectionDetails | undefined> {
  const name = await vscode.window.showInputBox({
    prompt: 'Enter connection name',
    placeHolder: 'my-rds-connection',
    value: existing?.name,
    ignoreFocusOut: true,
  });
  if (!name?.trim()) {
    return undefined;
  }

  const dbClusterArn = await vscode.window.showInputBox({
    prompt: 'Enter DB Cluster ARN',
    placeHolder: 'arn:aws:rds:region:account:cluster:cluster-name',
    value: existing?.dbClusterArn,
    ignoreFocusOut: true,
  });
  if (!dbClusterArn?.trim()) {
    return undefined;
  }

  const secretArn = await vscode.window.showInputBox({
    prompt: 'Enter Secrets Manager secret ARN',
    placeHolder: 'arn:aws:secretsmanager:region:account:secret:secret-name',
    value: existing?.secretArn,
    ignoreFocusOut: true,
  });
  if (!secretArn?.trim()) {
    return undefined;
  }

  const databaseName = await vscode.window.showInputBox({
    prompt: 'Enter database name',
    placeHolder: 'postgres',
    value: existing?.databaseName,
    ignoreFocusOut: true,
  });
  if (!databaseName?.trim()) {
    return undefined;
  }

  const region = await vscode.window.showInputBox({
    prompt: 'Enter AWS region',
    placeHolder: 'us-east-1',
    value: existing?.region ?? 'us-east-1',
    ignoreFocusOut: true,
  });
  if (!region?.trim()) {
    return undefined;
  }

  const awsProfile = await vscode.window.showInputBox({
    prompt: 'Enter AWS profile',
    placeHolder: 'default',
    value: existing?.awsProfile ?? 'default',
    ignoreFocusOut: true,
  });

  return {
    name: name.trim(),
    dbClusterArn: dbClusterArn.trim(),
    secretArn: secretArn.trim(),
    databaseName: databaseName.trim(),
    region: region.trim(),
    awsProfile: awsProfile?.trim() || 'default',
  };
}

async function selectConnection(
  manager: ConnectionManager,
  connectionId?: string
): Promise<DBConnection | undefined> {
  if (connectionId) {
    const connection = manager.getConnection(connectionId);
    if (connection) {
      return connection;
    }
  }

  const connections = manager.getConnections();
  if (connections.length === 0) {
    vscode.window.showWarningMessage('Add a database connection before running a query');
    return undefined;
  }
  if (connections.length === 1) {
    return connections[0];
  }

  const selected = await vscode.window.showQuickPick(
    connections.map((connection) => ({
      label: connection.name,
      description: `${connection.databaseName} (${connection.region})`,
      connection,
    })),
    { placeHolder: 'Select a database connection' }
  );
  return selected?.connection;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function updateQueryConnectionStatus(manager: ConnectionManager): void {
  if (!queryConnectionStatusItem) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'sql') {
    queryConnectionStatusItem.hide();
    return;
  }

  const connectionId = queryConnectionIds.get(editor.document.uri.toString());
  const connection = connectionId ? manager.getConnection(connectionId) : undefined;
  queryConnectionStatusItem.text = connection
    ? `$(database) ${connection.name}`
    : '$(database) Select connection';
  queryConnectionStatusItem.tooltip = connection
    ? `Query connection: ${connection.name}. Click to change.`
    : 'Choose the database connection for this query editor.';
  queryConnectionStatusItem.show();
}

async function executeSqlQuery(
  query: string,
  connection: DBConnection,
  queryHistoryProvider: QueryHistoryProvider
): Promise<void> {
  const client = new RDSDataAPIClient(connection);
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Executing query...' },
      async () => {
        const result = await client.executeQuery(query);
        await resultsViewProvider.showResults(result, query, connection.name);
      }
    );
    queryHistoryProvider.addQueryToHistory({
      id: `query-${Date.now()}`,
      query,
      timestamp: new Date(),
      connectionId: connection.id,
      connectionName: connection.name,
    });
  } catch (error) {
    vscode.window.showErrorMessage(
      `Query execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    await client.close();
  }
}

export function deactivate() {}
