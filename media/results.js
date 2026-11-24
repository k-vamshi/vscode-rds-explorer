// Client-side renderer for the RDS Results panel. All data is inserted via textContent (no innerHTML).
(function () {
  // eslint-disable-next-line no-undef
  const vscode = acquireVsCodeApi();
  const PAGE_SIZE = 500;
  const MAX_CELL_CHARS = 500;
  const EXPANDABLE_CHARS = 100;
  const NUMERIC_TYPE = /int|serial|float|double|numeric|decimal|real|money/i;

  /** @type {Map<string, {data: any, view: {filter: string, sortCol: number, sortDir: number, limit: number, showSql: boolean, visible: number[] | null}}>} */
  const tabs = new Map();
  /** @type {string | null} */
  let activeTabId = null;
  /** @type {{vis: number, col: number} | null} */
  let selection = null;
  let modalCopyValue = '';
  /** @type {number | undefined} */
  let toastTimer;

  /** @param {string} id */
  const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const els = {
    tabStrip: byId('tab-strip'),
    empty: byId('empty-state'),
    result: byId('result'),
    summary: byId('summary'),
    filter: /** @type {HTMLInputElement} */ (byId('filter')),
    toggleSql: byId('toggle-sql'),
    copyAll: byId('copy-all'),
    exportJson: byId('export-json'),
    exportCsv: byId('export-csv'),
    sql: byId('sql'),
    grid: byId('grid'),
    footer: byId('footer'),
    menu: byId('context-menu'),
    modal: byId('modal'),
    modalTitle: byId('modal-title'),
    modalBody: byId('modal-body'),
    modalClose: byId('modal-close'),
    modalCopy: byId('modal-copy'),
    toast: byId('toast'),
  };

  // ---------- helpers ----------

  /**
   * @param {string} tag
   * @param {string} [className]
   * @param {string} [text]
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  /** @param {unknown} value */
  function toText(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  /** @param {unknown} value */
  function parseJsonLike(value) {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
      return undefined;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }

  /** @param {Record<string, unknown>} row */
  function rowWithParsedJson(row) {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key of Object.keys(row)) {
      const parsed = parseJsonLike(row[key]);
      out[key] = parsed === undefined ? row[key] : parsed;
    }
    return out;
  }

  /**
   * @param {unknown} value
   * @param {string} separator
   */
  function delimited(value, separator) {
    const text = toText(value);
    return text.includes(separator) || /["\r\n]/.test(text)
      ? '"' + text.replace(/"/g, '""') + '"'
      : text;
  }

  /**
   * @param {string} message
   * @param {boolean} [isError]
   */
  function showToast(message, isError) {
    els.toast.textContent = message;
    els.toast.classList.toggle('error', !!isError);
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (els.toast.hidden = true), 1800);
  }

  /**
   * @param {string} text
   * @param {string} message
   */
  function copyText(text, message) {
    navigator.clipboard.writeText(text).then(
      () => showToast(message),
      () => showToast('Failed to copy', true)
    );
  }

  function activeTab() {
    return activeTabId ? tabs.get(activeTabId) : undefined;
  }

  /** @param {any} data */
  function createTab(data) {
    return {
      data,
      view: { filter: '', sortCol: -1, sortDir: 0, limit: PAGE_SIZE, showSql: false, visible: null },
    };
  }

  /** @param {{data: any, view: any}} tab */
  function isNumericColumn(tab, colIndex) {
    return NUMERIC_TYPE.test(tab.data.columnTypes[colIndex] || '');
  }

  /**
   * Row indices after filtering and sorting (cached until the filter/sort changes)
   * @param {{data: any, view: any}} tab
   * @returns {number[]}
   */
  function visibleRows(tab) {
    if (tab.view.visible) {
      return tab.view.visible;
    }
    const { rows, columns } = tab.data;
    let indices = rows.map((_row, i) => i);

    const needle = tab.view.filter.trim().toLowerCase();
    if (needle) {
      indices = indices.filter((i) =>
        columns.some((c) => toText(rows[i][c]).toLowerCase().includes(needle))
      );
    }

    if (tab.view.sortDir !== 0 && tab.view.sortCol >= 0) {
      const col = columns[tab.view.sortCol];
      const dir = tab.view.sortDir;
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      indices.sort((a, b) => {
        const va = rows[a][col];
        const vb = rows[b][col];
        if (va === null || va === undefined) {
          return vb === null || vb === undefined ? 0 : 1;
        }
        if (vb === null || vb === undefined) {
          return -1;
        }
        if (typeof va === 'number' && typeof vb === 'number') {
          return (va - vb) * dir;
        }
        return collator.compare(toText(va), toText(vb)) * dir;
      });
    }

    tab.view.visible = indices;
    return indices;
  }

  /** @param {{data: any, view: any}} tab */
  function invalidate(tab) {
    tab.view.visible = null;
    tab.view.limit = PAGE_SIZE;
    selection = null;
  }

  // ---------- rendering ----------

  function render() {
    renderTabs();
    const tab = activeTab();
    els.empty.hidden = !!tab;
    els.result.hidden = !tab;
    if (!tab) {
      return;
    }
    renderToolbar(tab);
    renderGrid(tab);
  }

  function renderTabs() {
    els.tabStrip.replaceChildren();
    for (const [id, tab] of tabs) {
      const node = el('div', 'tab' + (id === activeTabId ? ' active' : ''));
      node.setAttribute('role', 'tab');
      node.title = `${tab.data.connectionName} (${tab.data.databaseName})`;
      if (tab.data.color) {
        const dot = el('span', 'tab-dot');
        dot.style.backgroundColor = tab.data.color;
        node.appendChild(dot);
      }
      node.appendChild(el('span', 'tab-label', tab.data.connectionName));
      node.appendChild(el('span', 'tab-meta', String(tab.data.rowCount)));
      const close = el('button', 'icon-button tab-close', '\u00d7');
      close.title = 'Close';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(id);
      });
      node.appendChild(close);
      node.addEventListener('click', () => selectTab(id));
      node.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          closeTab(id);
        }
      });
      els.tabStrip.appendChild(node);
    }
  }

  /** @param {{data: any, view: any}} tab */
  function renderToolbar(tab) {
    const d = tab.data;
    els.summary.replaceChildren();
    if (d.color) {
      const dot = el('span', 'dot');
      dot.style.backgroundColor = d.color;
      els.summary.appendChild(dot);
    }
    els.summary.appendChild(el('strong', undefined, d.connectionName));
    els.summary.appendChild(el('span', undefined, d.databaseName));
    const rowsText = d.columns.length
      ? `${d.rowCount} row${d.rowCount === 1 ? '' : 's'}`
      : `${d.updatedRows ?? 0} affected`;
    els.summary.appendChild(el('span', undefined, rowsText));
    els.summary.appendChild(el('span', undefined, `${d.executionTime} ms`));
    els.summary.appendChild(el('span', undefined, new Date(d.executedAt).toLocaleTimeString()));

    els.filter.value = tab.view.filter;
    els.sql.textContent = d.query;
    els.sql.hidden = !tab.view.showSql;
    els.toggleSql.classList.toggle('pressed', tab.view.showSql);

    const hasRows = d.columns.length > 0;
    els.filter.disabled = !hasRows;
    for (const button of [els.copyAll, els.exportJson, els.exportCsv]) {
      /** @type {HTMLButtonElement} */ (button).disabled = !hasRows;
    }
  }

  /** @param {{data: any, view: any}} tab */
  function renderGrid(tab) {
    const { columns, columnTypes, rows } = tab.data;
    els.grid.replaceChildren();
    els.footer.replaceChildren();

    if (columns.length === 0) {
      const affected = tab.data.updatedRows ?? 0;
      els.grid.appendChild(
        el('div', 'grid-message', `Statement executed successfully. ${affected} row(s) affected.`)
      );
      return;
    }

    const visible = visibleRows(tab);
    const shown = visible.slice(0, tab.view.limit);

    const table = el('table');
    const headRow = el('tr');
    headRow.appendChild(el('th', 'rownum', '#'));
    columns.forEach((name, c) => {
      const th = el('th');
      th.dataset.col = String(c);
      th.title = `${name}${columnTypes[c] ? ' (' + columnTypes[c] + ')' : ''} \u2014 click to sort`;
      th.appendChild(document.createTextNode(name));
      if (tab.view.sortCol === c && tab.view.sortDir !== 0) {
        th.appendChild(el('span', 'sort-indicator', tab.view.sortDir === 1 ? '\u25b2' : '\u25bc'));
      }
      if (columnTypes[c]) {
        th.appendChild(el('span', 'col-type', columnTypes[c]));
      }
      if (isNumericColumn(tab, c)) {
        th.style.textAlign = 'right';
      }
      headRow.appendChild(th);
    });
    const thead = el('thead');
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    const fragment = document.createDocumentFragment();
    shown.forEach((rowIndex, vis) => {
      const tr = el('tr');
      tr.dataset.vis = String(vis);
      tr.title = 'Click to copy row as JSON';
      tr.appendChild(el('td', 'rownum', String(rowIndex + 1)));
      columns.forEach((name, c) => {
        tr.appendChild(renderCell(tab, rows[rowIndex][name], c));
      });
      fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
    table.appendChild(tbody);
    els.grid.appendChild(table);

    if (visible.length === 0) {
      els.grid.appendChild(el('div', 'grid-message', 'No rows match the filter.'));
    }

    renderFooter(tab, shown.length, visible.length);
    applySelection();
  }

  /**
   * @param {{data: any, view: any}} tab
   * @param {unknown} value
   * @param {number} c
   */
  function renderCell(tab, value, c) {
    const td = el('td');
    td.dataset.col = String(c);
    if (value === null || value === undefined) {
      td.className = 'null';
      td.textContent = 'NULL';
      return td;
    }
    const text = toText(value);
    if (typeof value === 'number' || isNumericColumn(tab, c)) {
      td.className = 'num';
    } else if (typeof value === 'boolean') {
      td.className = 'bool';
    } else if (typeof value === 'object' || parseJsonLike(value) !== undefined) {
      td.className = 'json';
    }
    if (td.className === 'json' || text.length > EXPANDABLE_CHARS) {
      td.classList.add('expandable');
      td.title = 'Click to view full value';
    }
    td.textContent = text.length > MAX_CELL_CHARS ? text.slice(0, MAX_CELL_CHARS) + '\u2026' : text;
    return td;
  }

  /**
   * @param {{data: any, view: any}} tab
   * @param {number} shownCount
   * @param {number} visibleCount
   */
  function renderFooter(tab, shownCount, visibleCount) {
    const total = tab.data.rows.length;
    let text = `Showing ${shownCount} of ${visibleCount} row${visibleCount === 1 ? '' : 's'}`;
    if (visibleCount !== total) {
      text += ` (filtered from ${total})`;
    }
    els.footer.appendChild(el('span', undefined, text));

    if (shownCount < visibleCount) {
      const more = el('button', 'link', `Show ${Math.min(PAGE_SIZE, visibleCount - shownCount)} more`);
      more.addEventListener('click', () => {
        tab.view.limit += PAGE_SIZE;
        renderGrid(tab);
      });
      const all = el('button', 'link', 'Show all');
      all.addEventListener('click', () => {
        tab.view.limit = Infinity;
        renderGrid(tab);
      });
      els.footer.append(more, all);
    }
    els.footer.appendChild(
      el(
        'span',
        undefined,
        'Click a row to copy it as JSON \u00b7 click a JSON/long cell to view \u00b7 right-click for more'
      )
    );
  }

  // ---------- selection ----------

  function applySelection() {
    els.grid.querySelectorAll('td.selected').forEach((td) => td.classList.remove('selected'));
    const td = selectedCellElement();
    if (td) {
      td.classList.add('selected');
      td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function selectedCellElement() {
    if (!selection) {
      return null;
    }
    return els.grid.querySelector(
      `tr[data-vis="${selection.vis}"] td[data-col="${selection.col}"]`
    );
  }

  function selectedValue() {
    const tab = activeTab();
    if (!tab || !selection) {
      return undefined;
    }
    const rowIndex = visibleRows(tab)[selection.vis];
    const column = tab.data.columns[selection.col];
    return { tab, rowIndex, column, value: tab.data.rows[rowIndex][column] };
  }

  /** @param {EventTarget | null} target */
  function selectFromTarget(target) {
    const td = target instanceof Element ? target.closest('td[data-col]') : null;
    const tr = td?.closest('tr[data-vis]');
    if (!td || !(tr instanceof HTMLElement) || !(td instanceof HTMLElement)) {
      return false;
    }
    selection = { vis: Number(tr.dataset.vis), col: Number(td.dataset.col) };
    applySelection();
    return true;
  }

  // ---------- actions ----------

  /** @param {string} id */
  function selectTab(id) {
    if (!tabs.has(id) || id === activeTabId) {
      return;
    }
    activeTabId = id;
    selection = null;
    vscode.postMessage({ type: 'selectTab', tabId: id });
    render();
  }

  /** @param {string} id */
  function closeTab(id) {
    tabs.delete(id);
    if (activeTabId === id) {
      activeTabId = Array.from(tabs.keys()).pop() ?? null;
      selection = null;
    }
    vscode.postMessage({ type: 'closeTab', tabId: id });
    render();
  }

  /**
   * @param {string} title
   * @param {unknown} value
   */
  function openModal(title, value) {
    const parsed = typeof value === 'object' && value !== null ? value : parseJsonLike(value);
    els.modalTitle.textContent = title;
    els.modalBody.replaceChildren();
    if (parsed !== undefined) {
      modalCopyValue = JSON.stringify(parsed, null, 2);
      const tree = el('div', 'json-tree');
      tree.appendChild(jsonNode(parsed, null));
      els.modalBody.appendChild(tree);
    } else {
      modalCopyValue = value === null || value === undefined ? 'NULL' : toText(value);
      els.modalBody.appendChild(el('pre', undefined, modalCopyValue));
    }
    els.modal.hidden = false;
    els.modalCopy.focus();
  }

  function closeModal() {
    els.modal.hidden = true;
    els.grid.focus();
  }

  /**
   * @param {unknown} value
   * @param {string | null} key
   * @returns {HTMLElement}
   */
  function jsonNode(value, key) {
    const keyLabel = () => (key === null ? null : el('span', 'json-key', key + ': '));

    if (value !== null && typeof value === 'object') {
      const isArray = Array.isArray(value);
      const entries = isArray ? value.map((v, i) => [String(i), v]) : Object.entries(value);
      if (entries.length === 0) {
        const leaf = el('div', 'json-entry');
        const label = keyLabel();
        if (label) {
          leaf.appendChild(label);
        }
        leaf.appendChild(el('span', 'json-preview', isArray ? '[]' : '{}'));
        return leaf;
      }
      const details = el('details');
      /** @type {HTMLDetailsElement} */ (details).open = true;
      const summary = el('summary');
      const label = keyLabel();
      if (label) {
        summary.appendChild(label);
      }
      summary.appendChild(
        el(
          'span',
          'json-preview',
          isArray ? `[${entries.length}]` : `{${entries.length} key${entries.length === 1 ? '' : 's'}}`
        )
      );
      details.appendChild(summary);
      const children = el('div', 'json-children');
      for (const [childKey, childValue] of entries) {
        children.appendChild(jsonNode(childValue, childKey));
      }
      details.appendChild(children);
      return details;
    }

    const leaf = el('div', 'json-entry');
    const label = keyLabel();
    if (label) {
      leaf.appendChild(label);
    }
    if (value === null) {
      leaf.appendChild(el('span', 'json-null', 'null'));
    } else if (typeof value === 'string') {
      leaf.appendChild(el('span', 'json-string', JSON.stringify(value)));
    } else if (typeof value === 'number') {
      leaf.appendChild(el('span', 'json-number', String(value)));
    } else {
      leaf.appendChild(el('span', 'json-boolean', String(value)));
    }
    return leaf;
  }

  /** @param {{data: any, view: any}} tab */
  function visibleAsDelimited(tab, separator) {
    const { columns, rows } = tab.data;
    const lines = [columns.map((c) => delimited(c, separator)).join(separator)];
    for (const i of visibleRows(tab)) {
      lines.push(columns.map((c) => delimited(rows[i][c], separator)).join(separator));
    }
    return lines.join('\n');
  }

  /**
   * @param {{data: any, view: any}} tab
   * @param {'csv' | 'json'} format
   */
  function exportTab(tab, format) {
    const content =
      format === 'csv'
        ? visibleAsDelimited(tab, ',')
        : JSON.stringify(
            visibleRows(tab).map((i) => rowWithParsedJson(tab.data.rows[i])),
            null,
            2
          );
    const stamp = new Date(tab.data.executedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    vscode.postMessage({
      type: 'saveFile',
      format,
      content,
      fileName: `${tab.data.connectionName}-${stamp}.${format}`,
    });
  }

  /** @param {string} action */
  function runMenuAction(action) {
    const current = selectedValue();
    if (!current) {
      return;
    }
    const { tab, rowIndex, column, value } = current;
    const row = tab.data.rows[rowIndex];
    switch (action) {
      case 'copy-cell':
        copyText(value === null || value === undefined ? 'NULL' : toText(value), 'Value copied');
        break;
      case 'view-cell':
        openModal(`${column} \u00b7 row ${rowIndex + 1}`, value);
        break;
      case 'copy-row-json':
        copyText(JSON.stringify(rowWithParsedJson(row), null, 2), 'Row copied as JSON');
        break;
      case 'copy-row-tsv':
        copyText(tab.data.columns.map((c) => delimited(row[c], '\t')).join('\t'), 'Row copied');
        break;
      case 'copy-column':
        copyText(
          visibleRows(tab).map((i) => toText(tab.data.rows[i][column])).join('\n'),
          `Column "${column}" copied`
        );
        break;
      case 'filter-value':
        tab.view.filter = toText(value);
        invalidate(tab);
        render();
        break;
    }
  }

  function hideMenu() {
    els.menu.hidden = true;
  }

  // ---------- events ----------

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message?.type === 'init') {
      tabs.clear();
      for (const data of message.tabs) {
        tabs.set(data.id, createTab(data));
      }
      activeTabId = message.activeTabId ?? null;
      selection = null;
      render();
    } else if (message?.type === 'upsertTab') {
      const previous = tabs.get(message.tab.id);
      const tab = createTab(message.tab);
      if (previous) {
        tab.view.showSql = previous.view.showSql;
      }
      tabs.set(message.tab.id, tab);
      activeTabId = message.tab.id;
      selection = null;
      render();
    }
  });

  let filterTimer;
  els.filter.addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      const tab = activeTab();
      if (tab) {
        tab.view.filter = els.filter.value;
        invalidate(tab);
        renderGrid(tab);
      }
    }, 150);
  });

  els.toggleSql.addEventListener('click', () => {
    const tab = activeTab();
    if (tab) {
      tab.view.showSql = !tab.view.showSql;
      renderToolbar(tab);
    }
  });
  els.copyAll.addEventListener('click', () => {
    const tab = activeTab();
    if (tab) {
      copyText(visibleAsDelimited(tab, '\t'), `${visibleRows(tab).length} rows copied`);
    }
  });
  els.exportCsv.addEventListener('click', () => {
    const tab = activeTab();
    if (tab) {
      exportTab(tab, 'csv');
    }
  });
  els.exportJson.addEventListener('click', () => {
    const tab = activeTab();
    if (tab) {
      exportTab(tab, 'json');
    }
  });

  els.grid.addEventListener('click', (e) => {
    const target = /** @type {Element} */ (e.target);
    const th = target.closest('th[data-col]');
    const tab = activeTab();
    if (th instanceof HTMLElement && tab) {
      const col = Number(th.dataset.col);
      // Cycle: ascending -> descending -> unsorted
      if (tab.view.sortCol !== col) {
        tab.view.sortCol = col;
        tab.view.sortDir = 1;
      } else {
        tab.view.sortDir = tab.view.sortDir === 1 ? -1 : tab.view.sortDir === -1 ? 0 : 1;
      }
      invalidate(tab);
      renderGrid(tab);
      return;
    }

    const tr = target.closest('tr[data-vis]');
    if (!(tr instanceof HTMLElement)) {
      return;
    }
    const td = target.closest('td');
    if (td && !td.dataset.col) {
      // Row-number cell: select the row's first cell
      selection = { vis: Number(tr.dataset.vis), col: 0 };
      applySelection();
    } else {
      selectFromTarget(target);
    }

    if (td?.classList.contains('expandable')) {
      runMenuAction('view-cell');
    } else if (!window.getSelection()?.toString()) {
      runMenuAction('copy-row-json');
    }
  });

  els.grid.addEventListener('contextmenu', (e) => {
    if (!selectFromTarget(e.target)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    els.menu.hidden = false;
    const { innerWidth, innerHeight } = window;
    const rect = els.menu.getBoundingClientRect();
    els.menu.style.left = Math.min(e.clientX, innerWidth - rect.width - 4) + 'px';
    els.menu.style.top = Math.min(e.clientY, innerHeight - rect.height - 4) + 'px';
  });

  els.menu.addEventListener('click', (e) => {
    const item = /** @type {Element} */ (e.target).closest('[data-action]');
    if (item instanceof HTMLElement && item.dataset.action) {
      hideMenu();
      runMenuAction(item.dataset.action);
    }
  });

  els.grid.addEventListener('keydown', (e) => {
    const tab = activeTab();
    if (!tab || !selection) {
      return;
    }
    const rendered = Math.min(visibleRows(tab).length, tab.view.limit);
    const lastCol = tab.data.columns.length - 1;
    const moves = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (e.key in moves) {
      const [dv, dc] = moves[/** @type {keyof typeof moves} */ (e.key)];
      selection = {
        vis: Math.max(0, Math.min(rendered - 1, selection.vis + dv)),
        col: Math.max(0, Math.min(lastCol, selection.col + dc)),
      };
      applySelection();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      runMenuAction('view-cell');
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      if (!window.getSelection()?.toString()) {
        runMenuAction('copy-cell');
        e.preventDefault();
      }
    }
  });

  els.modalClose.addEventListener('click', closeModal);
  els.modalCopy.addEventListener('click', () => copyText(modalCopyValue, 'Copied to clipboard'));
  els.modal.addEventListener('click', (e) => {
    if (e.target === els.modal) {
      closeModal();
    }
  });

  document.addEventListener('click', (e) => {
    if (!els.menu.hidden && !els.menu.contains(/** @type {Node} */ (e.target))) {
      hideMenu();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!els.modal.hidden) {
        closeModal();
      }
      hideMenu();
    }
  });
  els.grid.addEventListener('scroll', hideMenu);

  vscode.postMessage({ type: 'ready' });
})();
