/**
 * Component responsible for rendering the cell detail modal
 */
export class CellModalComponent {
  /**
   * Renders the HTML for the cell detail modal
   */
  render(): string {
    return `
      <!-- Cell Detail Modal -->
      <div id="cellModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <span class="modal-title" id="cellModalTitle">Cell Content</span>
            <button class="modal-close-btn" onclick="closeCellModal()">&times;</button>
          </div>
          <div class="modal-body">
            <pre id="cellContent" class="cell-content"></pre>
          </div>
          <div class="modal-footer">
            <button class="modal-btn" onclick="copyCellContent()">Copy</button>
            <button class="modal-btn" onclick="closeCellModal()">Close</button>
          </div>
        </div>
      </div>
    `;
  }
}
