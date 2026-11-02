import { QueryResult } from '../../types';
import { UtilsComponent } from './UtilsComponent';

/**
 * Component responsible for rendering the results table
 * Handles row and column rendering with JSON detection and cell expansion
 */
export class ResultsTableComponent {
  /**
   * Renders all table rows with proper HTML escaping and JSON detection
   */
  renderRows(result: QueryResult): string {
    return result.rows
      .map((row, rowIndex) => this.renderRow(row, rowIndex, result.columns))
      .join('');
  }

  /**
   * Renders a single row with cells
   */
  private renderRow(row: Record<string, unknown>, rowIndex: number, columns: string[]): string {
    const cells = columns.map((col) => this.renderCell(row[col], rowIndex, col)).join('');

    return `
      <tr data-row-index="${rowIndex}" class="clickable-row" title="Click to copy row as JSON">
        ${cells}
      </tr>
    `;
  }

  /**
   * Renders a single cell with content
   * Handles NULL values, JSON detection, and long text truncation
   */
  private renderCell(value: unknown, rowIndex: number, colName: string): string {
    if (value === null || value === undefined) {
      return '<td class="null-value">NULL</td>';
    }

    const text = String(value);
    const escapedText = UtilsComponent.escapeHtml(text);
    const isJson = UtilsComponent.isJsonValue(text);
    const isLongText = text.length > 100;

    if (isJson || isLongText) {
      const displayText = isLongText ? text.substring(0, 100) + '...' : text;
      const escapedDisplay = UtilsComponent.escapeHtml(displayText);
      // Use data attributes for cell data instead of inline event handlers
      // Escape the value for use in HTML attribute
      const escapedValue = text
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
      return `<td class="cell-expandable" data-row="${rowIndex}" data-col="${colName}" data-value="${escapedValue}">${escapedDisplay}</td>`;
    }

    return `<td>${escapedText}</td>`;
  }

  /**
   * Renders table header row with column names
   */
  renderColumnHeaders(result: QueryResult): string {
    return result.columns.map((col) => `<th>${UtilsComponent.escapeHtml(col)}</th>`).join('');
  }
}
