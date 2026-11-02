/**
 * Component responsible for generating JavaScript code for the webview
 * Handles modal interactions, JSON operations, and CSV export
 */
export class ScriptBuilderComponent {
  /**
   * Generates all JavaScript code for the results viewer
   */
  generate(rowsData: unknown[], columnsData: string[]): string {
    const rowsJson = JSON.stringify(rowsData);
    const columnsJson = JSON.stringify(columnsData);

    return `
      let cellModalData = {};
      let rowsData = ${rowsJson};
      let columnsData = ${columnsJson};

      ${this.getJsonUtilities()}

      ${this.getCellModalFunctions()}

      ${this.getCheckboxFunctions()}

      ${this.getRowCopyFunctions()}

      ${this.getCsvExportFunction()}

      ${this.getEventListeners()}
    `;
  }

  /**
   * JSON parsing and formatting utilities
   */
  private getJsonUtilities(): string {
    return `
      function isJsonString(str) {
        try {
          JSON.parse(str);
          return true;
        } catch {
          return false;
        }
      }

      function parseJsonString(str) {
        try {
          return JSON.parse(str);
        } catch {
          return str;
        }
      }

      function formatJsonString(str) {
        try {
          const json = JSON.parse(str);
          return JSON.stringify(json, null, 2);
        } catch {
          return str;
        }
      }
    `;
  }

  /**
   * Cell modal functions
   */
  private getCellModalFunctions(): string {
    return `
      function showCellModal(cellValue) {
        cellModalData = { value: cellValue };
        const modal = document.getElementById('cellModal');
        const title = document.getElementById('cellModalTitle');
        const content = document.getElementById('cellContent');
        
        title.textContent = 'Cell Content';
        
        if (isJsonString(cellValue)) {
          content.classList.add('json');
          content.innerHTML = buildJsonTreeHtml(JSON.parse(cellValue));
        } else {
          content.classList.remove('json');
          content.textContent = cellValue;
        }
        
        modal.classList.add('show');
      }

      function buildJsonTreeHtml(obj, depth = 0) {
        if (obj === null) return '<span class="json-null">null</span>';
        if (typeof obj !== 'object') {
          const strValue = String(obj);
          if (typeof obj === 'string') return \`<span class="json-string">\"\${strValue.replace(/\"/g, '\\\\\"')}\"</span>\`;
          if (typeof obj === 'number') return \`<span class="json-number">\${strValue}</span>\`;
          if (typeof obj === 'boolean') return \`<span class="json-boolean">\${strValue}</span>\`;
          return strValue;
        }

        const isArray = Array.isArray(obj);
        const entries = isArray ? obj : Object.entries(obj);
        const openBracket = isArray ? '[' : '{';
        const closeBracket = isArray ? ']' : '}';
        
        if (entries.length === 0) {
          return \`<span class="json-bracket">\${openBracket}\${closeBracket}</span>\`;
        }

        let html = \`<details open><summary class="json-summary">\${openBracket}</summary>\`;
        html += '<div class="json-children" style="margin-left: 20px;">';

        if (isArray) {
          entries.forEach((item, idx) => {
            html += \`<div class="json-entry">\`;
            html += \`<span class="json-index">[\${idx}]:</span> \`;
            html += buildJsonTreeHtml(item, depth + 1);
            html += '</div>';
          });
        } else {
          entries.forEach(([key, value]) => {
            html += \`<div class="json-entry">\`;
            html += \`<span class="json-key">\"\${key}\"</span>: \`;
            html += buildJsonTreeHtml(value, depth + 1);
            html += '</div>';
          });
        }

        html += '</div>';
        html += \`<span class="json-bracket">\${closeBracket}</span></details>\`;
        return html;
      }

      function closeCellModal() {
        const modal = document.getElementById('cellModal');
        modal.classList.remove('show');
        cellModalData = {};
      }

      function copyCellContent() {
        let contentToCopy = '';
        const cellContent = document.getElementById('cellContent');
        
        if (cellContent.classList.contains('json')) {
          // For JSON, try to extract from the original data
          contentToCopy = JSON.stringify(JSON.parse(cellModalData.value), null, 2);
        } else {
          contentToCopy = cellContent.textContent;
        }
        
        navigator.clipboard.writeText(contentToCopy).then(() => {
          showNotification('Copied to clipboard');
        }).catch(() => {
          showNotification('Failed to copy', 'error');
        });
      }
    `;
  }

  /**
   * Row click handler to copy as JSON
   */
  private getCheckboxFunctions(): string {
    return `
      function deepParseJsonFields(obj) {
        const parsed = {};
        for (const key in obj) {
          const value = obj[key];
          if (typeof value === 'string' && isJsonString(value)) {
            try {
              parsed[key] = JSON.parse(value);
            } catch {
              parsed[key] = value;
            }
          } else {
            parsed[key] = value;
          }
        }
        return parsed;
      }

      function copyRowAsJson(rowIndex) {
        const row = rowsData[rowIndex];
        const parsedRow = deepParseJsonFields(row);
        const jsonStr = JSON.stringify(parsedRow, null, 2);
        navigator.clipboard.writeText(jsonStr).then(() => {
          showNotification('Data copied');
        }).catch(() => {
          showNotification('Failed to copy', 'error');
        });
      }
    `;
  }

  /**
   * Row copy as JSON functions
   */
  private getRowCopyFunctions(): string {
    return ``;
  }

  /**
   * CSV export function
   */
  private getCsvExportFunction(): string {
    return `
      function exportCSV() {
        const headers = columnsData;
        const rows = rowsData;

        let csv = headers.map(h => {
          if (h.includes(',') || h.includes('"')) {
            return '"' + h.replace(/"/g, '""') + '"';
          }
          return h;
        }).join(',') + '\\n';
        
        rows.forEach(row => {
          const values = headers.map(h => {
            const value = row[h];
            if (value === null || value === undefined) return '';
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"')) {
              return '"' + stringValue.replace(/"/g, '""') + '"';
            }
            return stringValue;
          });
          csv += values.join(',') + '\\n';
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'results.csv';
        a.click();
        URL.revokeObjectURL(url);
      }
    `;
  }

  /**
   * Notification display function
   */
  private getNotificationFunction(): string {
    return `
      function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = \`notification notification-\${type}\`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
          notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
          notification.classList.remove('show');
          setTimeout(() => notification.remove(), 300);
        }, 2000);
      }
    `;
  }

  /**
   * Event listeners
   */
  private getEventListeners(): string {
    return `
      ${this.getNotificationFunction()}

      // Close modal when clicking outside
      document.addEventListener('click', function(e) {
        const modal = document.getElementById('cellModal');
        if (e.target === modal) {
          closeCellModal();
        }
      });

      // Handle expandable cell clicks
      document.addEventListener('click', function(e) {
        const cell = e.target.closest('td.cell-expandable');
        if (cell) {
          e.stopPropagation();
          const cellValue = cell.getAttribute('data-value');
          showCellModal(cellValue);
        }
      });

      // Handle row clicks to copy as JSON
      document.addEventListener('click', function(e) {
        const row = e.target.closest('tr.clickable-row');
        if (row) {
          const rowIndex = parseInt(row.getAttribute('data-row-index'), 10);
          copyRowAsJson(rowIndex);
        }
      });
    `;
  }
}
