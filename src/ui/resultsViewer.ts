import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { DBConnection, QueryResult } from '../types';

interface ResultTab {
  id: string;
  connectionName: string;
  databaseName: string;
  color: string | null;
  query: string;
  columns: string[];
  columnTypes: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  updatedRows: number | null;
  executionTime: number;
  executedAt: string;
}

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'selectTab'; tabId: string }
  | { type: 'closeTab'; tabId: string }
  | { type: 'saveFile'; content: string; format: 'csv' | 'json'; fileName: string };

/**
 * Webview view in the bottom panel showing query results, one tab per connection.
 * Rendering happens client-side (media/results.js); this class only syncs state.
 */
export class ResultsViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'rdsResults';

  private view: vscode.WebviewView | undefined;
  private readonly tabs = new Map<string, ResultTab>();
  private activeTabId: string | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const mediaRoot = vscode.Uri.joinPath(this.extensionUri, 'media');
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
    webviewView.webview.html = this.getHtml(webviewView.webview, mediaRoot);
    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) =>
      this.handleMessage(message)
    );
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
    this.updateDescription();
  }

  async showResults(result: QueryResult, query: string, connection: DBConnection): Promise<void> {
    const tab: ResultTab = {
      id: connection.id,
      connectionName: connection.name,
      databaseName: connection.databaseName,
      color:
        connection.color && /^[a-z.]+$/i.test(connection.color)
          ? `var(--vscode-${connection.color.replace(/\./g, '-')})`
          : null,
      query,
      columns: result.columns,
      columnTypes: result.columnTypes ?? [],
      rows: result.rows,
      rowCount: result.rowCount,
      updatedRows: result.updatedRows ?? null,
      executionTime: result.executionTime,
      executedAt: new Date().toISOString(),
    };
    this.tabs.set(tab.id, tab);
    this.activeTabId = tab.id;

    if (this.view) {
      void this.view.webview.postMessage({ type: 'upsertTab', tab });
      this.updateDescription();
      this.view.show(true);
    } else {
      // Focusing resolves the view; the webview then sends 'ready' and receives all tabs
      await vscode.commands.executeCommand(`${ResultsViewProvider.viewId}.focus`);
    }
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message?.type) {
      case 'ready':
        void this.view?.webview.postMessage({
          type: 'init',
          tabs: Array.from(this.tabs.values()),
          activeTabId: this.activeTabId,
        });
        break;
      case 'selectTab':
        if (this.tabs.has(message.tabId)) {
          this.activeTabId = message.tabId;
          this.updateDescription();
        }
        break;
      case 'closeTab':
        this.tabs.delete(message.tabId);
        if (this.activeTabId === message.tabId) {
          this.activeTabId = Array.from(this.tabs.keys()).pop();
        }
        this.updateDescription();
        break;
      case 'saveFile':
        await this.saveFile(message);
        break;
    }
  }

  private async saveFile(message: Extract<WebviewMessage, { type: 'saveFile' }>): Promise<void> {
    if (typeof message.content !== 'string' || !['csv', 'json'].includes(message.format)) {
      return;
    }
    const fileName = String(message.fileName || 'results').replace(/[\\/:*?"<>|]+/g, '-');
    const baseUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    const target = await vscode.window.showSaveDialog({
      defaultUri: baseUri ? vscode.Uri.joinPath(baseUri, fileName) : undefined,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      filters: message.format === 'csv' ? { CSV: ['csv'] } : { JSON: ['json'] },
    });
    if (!target) {
      return;
    }
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(message.content));
    vscode.window.showInformationMessage(
      `Results saved to ${vscode.workspace.asRelativePath(target)}`
    );
  }

  private updateDescription(): void {
    if (this.view) {
      this.view.description = this.activeTabId
        ? this.tabs.get(this.activeTabId)?.connectionName
        : undefined;
    }
  }

  private getHtml(webview: vscode.Webview, mediaRoot: vscode.Uri): string {
    const nonce = randomBytes(16).toString('base64');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'results.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'results.css'));

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div id="app">
      <div id="tab-strip" class="tab-strip" role="tablist"></div>
      <div id="empty-state" class="empty-state">Run a query to see results here.</div>
      <div id="result" class="result" hidden>
        <div class="toolbar">
          <div id="summary" class="summary"></div>
          <div class="toolbar-actions">
            <input id="filter" class="filter" type="search" placeholder="Filter rows" />
            <button id="toggle-sql" class="button secondary" title="Show the executed SQL">SQL</button>
            <button id="copy-all" class="button secondary" title="Copy visible rows as TSV (paste into Excel/Sheets)">Copy</button>
            <button id="export-json" class="button secondary">JSON</button>
            <button id="export-csv" class="button">Export CSV</button>
          </div>
        </div>
        <pre id="sql" class="sql" hidden></pre>
        <div id="grid" class="grid" tabindex="0"></div>
        <div id="footer" class="footer"></div>
      </div>
    </div>

    <div id="context-menu" class="context-menu" hidden>
      <div class="menu-item" data-action="copy-cell">Copy value</div>
      <div class="menu-item" data-action="view-cell">View value</div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="copy-row-json">Copy row as JSON</div>
      <div class="menu-item" data-action="copy-row-tsv">Copy row as TSV</div>
      <div class="menu-item" data-action="copy-column">Copy column values</div>
      <div class="menu-separator"></div>
      <div class="menu-item" data-action="filter-value">Filter by this value</div>
    </div>

    <div id="modal" class="modal" hidden>
      <div class="modal-content" role="dialog" aria-modal="true">
        <div class="modal-header">
          <span id="modal-title" class="modal-title"></span>
          <button id="modal-close" class="icon-button" title="Close">&times;</button>
        </div>
        <div id="modal-body" class="modal-body"></div>
        <div class="modal-footer">
          <button id="modal-copy" class="button">Copy</button>
        </div>
      </div>
    </div>

    <div id="toast" class="toast" hidden></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}
