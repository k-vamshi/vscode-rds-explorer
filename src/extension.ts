import * as vscode from 'vscode';
import { ConnectionManager } from './services/connectionManager';
import { DatabaseMetadata } from './services/databaseMetadata';
import { QueryEditorBindings } from './services/queryEditorBindings';
import { RDSDataAPIClient } from './services/rdsDataApi';
import { DBConnection } from './types';
import { DatabaseExplorerProvider, ExplorerItem } from './ui/databaseExplorer';
import { QueryHistoryNode, QueryHistoryProvider } from './ui/queryHistory';
import { ResultsViewProvider } from './ui/resultsViewer';
import { ConstraintsDetailProvider } from './ui/constraintsDetail';
import { CodeViewerProvider, DEFINITION_SCHEME, DefinitionKind } from './ui/codeViewer';
import {
  CONNECTION_COLORS,
  QueryEditorCodeLensProvider,
  QueryEditorDecorationProvider,
  connectionThemeColor,
} from './ui/queryEditorDecorations';

let outputChannel: vscode.OutputChannel;
let resultsViewProvider: ResultsViewProvider;
let constraintsDetailProvider: ConstraintsDetailProvider;
let codeViewerProvider: CodeViewerProvider;
let queryEditorBindings: QueryEditorBindings;
let queryConnectionStatusItem: vscode.StatusBarItem;

type ConnectionDetails = Omit<DBConnection, 'id'>;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('RDS Explorer');
  context.subscriptions.push(outputChannel);

  try {
    const connectionManager = new ConnectionManager(context);
    const databaseExplorerProvider = new DatabaseExplorerProvider(connectionManager);
    const queryHistoryProvider = new QueryHistoryProvider();
    queryEditorBindings = new QueryEditorBindings(context, connectionManager);
    resultsViewProvider = new ResultsViewProvider(context.extensionUri);
    constraintsDetailProvider = new ConstraintsDetailProvider();
    codeViewerProvider = new CodeViewerProvider();

    queryConnectionStatusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    queryConnectionStatusItem.command = 'rds-explorer.selectQueryConnection';

    context.subscriptions.push(
      queryEditorBindings,
      queryConnectionStatusItem,
      vscode.window.registerTreeDataProvider('rdsExplorer', databaseExplorerProvider),
      vscode.window.registerTreeDataProvider('rdsQueryHistory', queryHistoryProvider),
      vscode.window.registerWebviewViewProvider(ResultsViewProvider.viewId, resultsViewProvider, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
      vscode.window.registerFileDecorationProvider(
        new QueryEditorDecorationProvider(queryEditorBindings)
      ),
      vscode.languages.registerCodeLensProvider(
        [
          { language: 'sql', scheme: 'file' },
          { language: 'sql', scheme: 'untitled' },
        ],
        new QueryEditorCodeLensProvider(queryEditorBindings)
      ),
      codeViewerProvider,
      vscode.workspace.registerTextDocumentContentProvider(DEFINITION_SCHEME, codeViewerProvider),
      vscode.languages.registerCodeLensProvider({ scheme: DEFINITION_SCHEME }, codeViewerProvider),
      vscode.window.onDidChangeActiveTextEditor(updateQueryConnectionStatus),
      queryEditorBindings.onDidChange(updateQueryConnectionStatus)
    );

    registerCommands(context, connectionManager, databaseExplorerProvider, queryHistoryProvider);
    updateQueryConnectionStatus();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`Activation failed: ${errorMsg}`);
    outputChannel.appendLine(`Stack: ${error instanceof Error ? error.stack : 'N/A'}`);
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
        const details = await promptForConnection();
        if (!details) {
          return;
        }

        await connectionManager.addConnection({
          id: `conn-${Date.now()}`,
          ...details,
        });

        vscode.window.showInformationMessage(`Connection "${details.name}" created successfully`);
        databaseExplorerProvider.refresh();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Error creating connection: ${errorMsg}`);
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

        await connectionManager.updateConnection({ ...connection, ...details });
        databaseExplorerProvider.refresh();
        queryEditorBindings.notifyConnectionsChanged();
        vscode.window.showInformationMessage(`Connection "${details.name}" updated`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to update connection: ${message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rds-explorer.setConnectionColor',
      async (item?: ExplorerItem) => {
        const connectionId = item?.nodeData.connectionId;
        const connection = connectionId ? connectionManager.getConnection(connectionId) : undefined;
        if (!connection) {
          return;
        }

        const picked = await vscode.window.showQuickPick(
          CONNECTION_COLORS.map((color) => ({
            label: color.label,
            description: color.id === connection.color ? 'current' : undefined,
            color,
          })),
          { placeHolder: `Color for "${connection.name}" (e.g. red for production)` }
        );
        if (!picked) {
          return;
        }

        await connectionManager.updateConnection({ ...connection, color: picked.color.id });
        databaseExplorerProvider.refresh();
        queryEditorBindings.notifyConnectionsChanged();
      }
    )
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
          queryEditorBindings.notifyConnectionsChanged();
          vscode.window.showInformationMessage(`Connection "${connection.name}" deleted`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to delete connection: ${message}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.refreshExplorer', () => {
      databaseExplorerProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.newQuery', async (item?: ExplorerItem) => {
      const connectionId = item?.nodeData?.connectionId;
      const connection = connectionId ? connectionManager.getConnection(connectionId) : undefined;
      await queryEditorBindings.openQueryEditor(connection);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rds-explorer.selectQueryConnection',
      async (uri?: vscode.Uri) => {
        const document =
          uri instanceof vscode.Uri
            ? vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString())
            : vscode.window.activeTextEditor?.document;
        if (!document || document.languageId !== 'sql') {
          vscode.window.showWarningMessage('Open a SQL query editor to select its connection');
          return;
        }
        if (document.uri.scheme === DEFINITION_SCHEME) {
          return;
        }

        const connection = await pickConnection(connectionManager);
        if (connection) {
          await queryEditorBindings.set(document.uri, connection.id);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.executeQuery', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active SQL editor');
        return;
      }
      if (editor.document.uri.scheme === DEFINITION_SCHEME) {
        vscode.window.showWarningMessage(
          'Definitions are read-only. Use "Open in Query Editor" to run a copy.'
        );
        return;
      }

      const selectedText = editor.selection.isEmpty
        ? ''
        : editor.document.getText(editor.selection);
      const query = (selectedText.trim() ? selectedText : editor.document.getText()).trim();
      if (!query) {
        vscode.window.showWarningMessage('No SQL query to execute');
        return;
      }

      const connection =
        queryEditorBindings.getConnection(editor.document.uri) ??
        (await pickConnection(connectionManager));
      if (!connection) {
        return;
      }

      await queryEditorBindings.set(editor.document.uri, connection.id);
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

        await queryEditorBindings.openQueryEditor(connection, historyItem.query);
        await executeSqlQuery(historyItem.query, connection, queryHistoryProvider);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.clearQueryHistory', () => {
      queryHistoryProvider.clearHistory();
    })
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
      await queryEditorBindings.openQueryEditor(connection, query);
      await executeSqlQuery(query, connection, queryHistoryProvider);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'rds-explorer.viewColumnConstraints',
      async (item?: ExplorerItem) => {
        const nodeData = item?.nodeData;
        const connection = nodeData?.connectionId
          ? connectionManager.getConnection(nodeData.connectionId)
          : undefined;
        if (!connection || !nodeData?.schema || !nodeData.table || !nodeData.column) {
          vscode.window.showWarningMessage('Select a column in the database explorer');
          return;
        }

        try {
          await constraintsDetailProvider.showColumnConstraints(
            context,
            new DatabaseMetadata(connection),
            nodeData.schema,
            nodeData.table,
            nodeData.column
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to load constraints: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.viewForeignKeys', async (item?: ExplorerItem) => {
      const nodeData = item?.nodeData;
      const connection = nodeData?.connectionId
        ? connectionManager.getConnection(nodeData.connectionId)
        : undefined;
      if (!connection || !nodeData?.schema || !nodeData.table) {
        vscode.window.showWarningMessage('Select a table in the database explorer');
        return;
      }

      try {
        await constraintsDetailProvider.showForeignKeyRelationships(
          context,
          new DatabaseMetadata(connection),
          nodeData.schema,
          nodeData.table
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to load foreign keys: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  const registerDefinitionCommand = (
    commandId: string,
    field: 'view' | 'function' | 'procedure' | 'trigger' | 'typeInfo' | 'sequence',
    kind: DefinitionKind,
    fetchDefinition: (metadata: DatabaseMetadata, schema: string, name: string) => Promise<string>
  ) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, async (item?: ExplorerItem) => {
        const nodeData = item?.nodeData;
        const connection = nodeData?.connectionId
          ? connectionManager.getConnection(nodeData.connectionId)
          : undefined;
        const name = nodeData?.[field];

        if (!connection || !nodeData?.schema || typeof name !== 'string') {
          vscode.window.showWarningMessage(`Select a ${kind} in the database explorer`);
          return;
        }

        try {
          const definition = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: `Loading ${kind} ${name}...` },
            () => fetchDefinition(new DatabaseMetadata(connection), nodeData.schema!, name)
          );
          await codeViewerProvider.showDefinition(
            connection,
            kind,
            nodeData.schema,
            name,
            definition
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to load ${kind} definition: ${message}`);
        }
      })
    );
  };

  registerDefinitionCommand('rds-explorer.viewViewCode', 'view', 'view', (m, s, n) =>
    m.getViewDefinition(s, n)
  );
  registerDefinitionCommand('rds-explorer.viewFunctionCode', 'function', 'function', (m, s, n) =>
    m.getFunctionDefinition(s, n)
  );
  registerDefinitionCommand('rds-explorer.viewProcedureCode', 'procedure', 'procedure', (m, s, n) =>
    m.getProcedureDefinition(s, n)
  );
  registerDefinitionCommand('rds-explorer.viewTriggerCode', 'trigger', 'trigger', (m, s, n) =>
    m.getTriggerDefinition(s, n)
  );
  registerDefinitionCommand('rds-explorer.viewTypeCode', 'typeInfo', 'type', (m, s, n) =>
    m.getTypeDefinition(s, n)
  );
  registerDefinitionCommand('rds-explorer.viewSequenceCode', 'sequence', 'sequence', (m, s, n) =>
    m.getSequenceDefinition(s, n)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('rds-explorer.openDefinitionAsQuery', async () => {
      const document = vscode.window.activeTextEditor?.document;
      const connectionId = document ? CodeViewerProvider.connectionIdFor(document.uri) : undefined;
      if (!document || !connectionId) {
        return;
      }
      await queryEditorBindings.openQueryEditor(
        connectionManager.getConnection(connectionId),
        codeViewerProvider.getBody(document.uri) ?? document.getText()
      );
    })
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

async function pickConnection(manager: ConnectionManager): Promise<DBConnection | undefined> {
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
      label: `$(database) ${connection.name}`,
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

function updateQueryConnectionStatus(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'sql') {
    queryConnectionStatusItem.hide();
    return;
  }

  const connection = queryEditorBindings.getConnection(editor.document.uri);
  queryConnectionStatusItem.text = connection
    ? `$(database) ${connection.name}`
    : '$(database) Select connection';
  queryConnectionStatusItem.color = connection ? connectionThemeColor(connection) : undefined;
  queryConnectionStatusItem.tooltip = connection
    ? `Query connection: ${connection.name} (${connection.databaseName}). Click to change.`
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
      {
        location: vscode.ProgressLocation.Notification,
        title: `Executing on ${connection.name}...`,
      },
      async () => {
        const result = await client.executeQuery(query);
        await resultsViewProvider.showResults(result, query, connection);
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
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`[${connection.name}] ${message}`);
    vscode.window.showErrorMessage(message);
  } finally {
    await client.close();
  }
}

export function deactivate() {}
