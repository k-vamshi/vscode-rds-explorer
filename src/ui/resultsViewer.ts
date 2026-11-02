import * as vscode from 'vscode';
import { QueryResult } from '../types';
import { ResultsTableComponent } from './components/ResultsTableComponent';
import { CellModalComponent } from './components/CellModalComponent';
import { HtmlBuilderComponent } from './components/HtmlBuilderComponent';
import { ScriptBuilderComponent } from './components/ScriptBuilderComponent';

/**
 * Main provider for the results viewer panel
 * Orchestrates the display of query results using component-based architecture
 */
export class ResultsViewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private tableComponent: ResultsTableComponent;
  private modalComponent: CellModalComponent;
  private htmlBuilder: HtmlBuilderComponent;
  private scriptBuilder: ScriptBuilderComponent;

  constructor(private context: vscode.ExtensionContext) {
    this.tableComponent = new ResultsTableComponent();
    this.modalComponent = new CellModalComponent();
    this.htmlBuilder = new HtmlBuilderComponent();
    this.scriptBuilder = new ScriptBuilderComponent();
  }

  async showResults(result: QueryResult, query: string, connectionName: string): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'rdsResults',
        'Query Results',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      this.panel.onDidDispose(
        () => {
          this.panel = undefined;
        },
        undefined,
        this.context.subscriptions
      );
    } else {
      this.panel.reveal(vscode.ViewColumn.Beside);
    }

    this.panel.webview.html = this.buildWebviewHtml(result, query, connectionName);
  }

  /**
   * Orchestrates building the complete webview HTML using components
   */
  private buildWebviewHtml(result: QueryResult, query: string, connectionName: string): string {
    // Generate content using components
    const tableRows = this.tableComponent.renderRows(result);
    const columnHeaders = this.tableComponent.renderColumnHeaders(result);
    const modalHtml = this.modalComponent.render();
    const scriptContent = this.scriptBuilder.generate(result.rows, result.columns);

    // Build complete HTML document
    return this.htmlBuilder.build({
      connectionName,
      query,
      rowCount: result.rowCount,
      executionTime: result.executionTime,
      columnHeaders,
      tableRows,
      modalContent: modalHtml,
      scriptContent,
    });
  }
}
