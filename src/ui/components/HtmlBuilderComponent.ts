import { UtilsComponent } from './UtilsComponent';

/**
 * Interface for HTML builder options
 */
interface HtmlBuildOptions {
  connectionName: string;
  query: string;
  rowCount: number;
  executionTime: number;
  columnHeaders: string;
  tableRows: string;
  modalContent: string;
  scriptContent: string;
}

/**
 * Component responsible for building the complete HTML document
 * Combines styles, layout, and all child components
 */
export class HtmlBuilderComponent {
  /**
   * Builds the complete HTML webview document
   */
  build(options: HtmlBuildOptions): string {
    const escapedConnectionName = UtilsComponent.escapeHtml(options.connectionName);
    const escapedQuery = UtilsComponent.escapeHtml(options.query);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            ${this.getStyles()}
          </style>
        </head>
        <body>
          <div class="container">
            ${this.getSummarySection(escapedConnectionName, options.rowCount, options.executionTime)}
            ${this.getQuerySection(escapedQuery)}
            ${this.getTableSection(options.columnHeaders, options.tableRows)}
          </div>

          ${options.modalContent}

          <script>
            ${options.scriptContent}
          </script>
        </body>
      </html>
    `;
  }

  /**
   * Renders the summary section with connection and stats
   */
  private getSummarySection(
    connectionName: string,
    rowCount: number,
    executionTime: number
  ): string {
    return `
      <div class="summary">
        <div>
          <div class="connection-label">Connection</div>
          <div class="connection-name">${connectionName}</div>
        </div>
        <div class="stats">
          <span><strong>${rowCount}</strong> rows</span>
          <span><strong>${executionTime} ms</strong></span>
        </div>
      </div>
    `;
  }

  /**
   * Renders the query display section
   */
  private getQuerySection(query: string): string {
    return `
      <div class="query-block">
        <div class="query-label">SQL</div>
        <pre>${query}</pre>
      </div>
    `;
  }

  /**
   * Renders the table section with results toolbar
   */
  private getTableSection(columnHeaders: string, tableRows: string): string {
    return `
      <div class="results-toolbar">
        <div class="results-title">Results</div>
        <button class="export-button" onclick="exportCSV()">Export as CSV</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              ${columnHeaders}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * All CSS styles for the results viewer
   */
  private getStyles(): string {
    return `
      body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
        margin: 0;
        padding: 14px 16px 20px;
      }
      .container {
        max-width: 100%;
      }
      .summary {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 2px 0 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      .connection-label,
      .query-label {
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        margin-bottom: 4px;
      }
      .connection-name {
        font-size: 14px;
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .stats {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px 14px;
        color: var(--vscode-descriptionForeground);
        text-align: right;
        white-space: nowrap;
      }
      .stats strong {
        color: var(--vscode-foreground);
        font-weight: 600;
      }
      .query-block {
        margin-top: 12px;
        padding: 10px 12px;
        border-left: 2px solid var(--vscode-focusBorder);
        background: var(--vscode-textCodeBlock-background);
      }
      .query-block pre {
        margin: 0;
        color: var(--vscode-editor-foreground);
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        line-height: 1.45;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .results-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 16px 0 8px;
      }
      .results-title {
        font-size: 13px;
        font-weight: 600;
      }
      .table-wrap {
        max-width: 100%;
        overflow: auto;
        border: 1px solid var(--vscode-panel-border);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        cursor: default;
      }
      tbody tr {
        cursor: default;
      }
      th {
        position: sticky;
        top: 0;
        z-index: 1;
        background-color: var(--vscode-editorWidget-background);
        padding: 8px 10px;
        text-align: left;
        font-weight: 600;
        border-bottom: 1px solid var(--vscode-focusBorder);
        color: var(--vscode-foreground);
        white-space: nowrap;
      }
      tbody tr {
        cursor: pointer;
      }
      tbody tr:hover {
        background-color: var(--vscode-list-hoverBackground);
      }
      td {
        padding: 8px 10px;
        border-bottom: 1px solid var(--vscode-panel-border);
        line-height: 1.4;
        max-width: 400px;
        word-wrap: break-word;
        overflow-wrap: break-word;
        white-space: pre-wrap;
      }
      td.cell-expandable {
        cursor: pointer;
      }
      td.cell-expandable:hover {
        text-decoration: underline;
      }
      .null-value {
        color: var(--vscode-descriptionForeground);
        font-style: italic;
      }
      .export-button {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 5px 10px;
        border-radius: 2px;
        cursor: pointer;
        font: inherit;
      }
      .export-button:hover {
        background-color: var(--vscode-button-hoverBackground);
      }
      
      /* Modal Styles */
      .modal {
        display: none;
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.6);
      }
      .modal.show {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .modal-content {
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        width: 85%;
        max-width: 900px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      }
      .modal-header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--vscode-panel-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
      }
      .modal-title {
        font-weight: 600;
        color: var(--vscode-foreground);
      }
      .modal-close-btn {
        background: none;
        border: none;
        color: var(--vscode-foreground);
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .modal-close-btn:hover {
        color: var(--vscode-focusBorder);
      }
      .modal-body {
        overflow: auto;
        padding: 16px;
        flex: 1;
        min-height: 0;
      }
      .cell-content {
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
        line-height: 1.6;
        background-color: var(--vscode-textCodeBlock-background);
        padding: 12px;
        border-radius: 4px;
        border: 1px solid var(--vscode-panel-border);
        margin: 0;
        max-height: 100%;
        overflow: auto;
      }
      .cell-content.json {
        color: var(--vscode-editor-foreground);
        white-space: normal;
      }
      .cell-content.json pre {
        display: none;
      }
      .json-summary {
        cursor: pointer;
        user-select: none;
        color: var(--vscode-editor-foreground);
        padding: 2px 4px;
        border-radius: 2px;
      }
      .json-summary:hover {
        background-color: var(--vscode-editor-selectionBackground);
      }
      .json-summary::marker {
        color: var(--vscode-descriptionForeground);
      }
      .json-entry {
        padding: 2px 0;
        font-family: var(--vscode-editor-font-family);
      }
      .json-key {
        color: #9cdcfe;
        font-weight: 500;
      }
      .json-string {
        color: #ce9178;
      }
      .json-number {
        color: #b5cea8;
      }
      .json-boolean {
        color: #569cd6;
        font-weight: bold;
      }
      .json-null {
        color: #6a9955;
        font-weight: bold;
      }
      .json-bracket {
        color: #d4d4d4;
        font-weight: bold;
      }
      .json-index {
        color: #9cdcfe;
        font-weight: 500;
      }
      .json-children {
        font-size: 11px;
      }
      .modal-footer {
        padding: 12px 16px;
        border-top: 1px solid var(--vscode-panel-border);
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        flex-shrink: 0;
      }
      .modal-btn {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 6px 16px;
        border-radius: 2px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
      }
      .modal-btn:hover {
        background-color: var(--vscode-button-hoverBackground);
      }
      
      /* Context Menu */
      .context-menu {
        background-color: var(--vscode-menu-background);
        border: 1px solid var(--vscode-menu-border);
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        min-width: 200px;
        padding: 4px 0;
      }
      .context-menu-item {
        padding: 8px 12px;
        cursor: pointer;
        user-select: none;
        color: var(--vscode-menu-foreground);
        font-size: 13px;
      }
      .context-menu-item:hover {
        background-color: var(--vscode-menu-selectionBackground);
        color: var(--vscode-menu-selectionForeground);
      }
      
      /* Notification */
      .notification {
        position: fixed;
        bottom: -100px;
        right: 16px;
        background-color: var(--vscode-notifications-background);
        color: var(--vscode-notifications-foreground);
        padding: 12px 16px;
        border-radius: 4px;
        border: 1px solid var(--vscode-notifications-border);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        z-index: 10001;
        transition: bottom 0.3s ease-in-out;
        max-width: 300px;
        word-wrap: break-word;
      }
      .notification.show {
        bottom: 16px;
      }
      .notification-error {
        background-color: var(--vscode-inputValidation-errorBackground);
        color: var(--vscode-inputValidation-errorForeground);
        border-color: var(--vscode-inputValidation-errorBorder);
      }
      
      @media (max-width: 480px) {
        .summary {
          flex-direction: column;
          gap: 8px;
        }
        .stats {
          justify-content: flex-start;
          text-align: left;
        }
        .modal-content {
          width: 95%;
          max-height: 90vh;
        }
      }
    `;
  }
}
