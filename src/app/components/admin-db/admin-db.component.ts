import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface TableMeta { key: string; label: string; columns: string[]; }
type Row = Record<string, any>;

// Columns that are FK display values — not directly editable (edit via _id twin)
const FK_DISPLAY = new Set(['team','teamA','teamB','match','player','user']);

// PK column per table
const PK: Record<string, string> = {
  teams: 'id', players: 'id', matches: 'id', match_player_stats: 'id',
  app_users: 'id', user_transfer_records: 'id', round_config: 'stage'
};

// Columns that are booleans
const BOOL_COLS = new Set(['eliminated','cleanSheet','isAdmin']);

// Columns that are dropdowns with fixed options
const DROPDOWN_COLS: Record<string, string[]> = {
  position:  ['GK','DEF','MID','FWD'],
  stage:     ['R32','R16','QF','SF','FINAL'],
  status:    ['UPCOMING','LIVE','COMPLETED'],
};

@Component({
  selector: 'app-admin-db',
  standalone: true,
  imports: [FormsModule],
  template: `
<div class="db-wrap">

  <!-- ── LEFT SIDEBAR: table list ── -->
  <div class="db-sidebar">
    <div class="db-sidebar-title">Tables</div>
    @for (t of tables(); track t.key) {
      <button class="db-table-btn" [class.db-table-active]="selectedTable()?.key === t.key"
              (click)="selectTable(t)">
        <span class="db-table-icon">{{ tableIcon(t.key) }}</span>
        <span class="db-table-label">{{ t.label }}</span>
        @if (selectedTable()?.key === t.key) {
          <span class="db-table-count">{{ rows().length }}</span>
        }
      </button>
    }
  </div>

  <!-- ── MAIN CONTENT ── -->
  <div class="db-main">
    @if (!selectedTable()) {
      <div class="db-empty">
        <div class="db-empty-icon">🗄️</div>
        <div class="db-empty-title">Select a table to browse and edit</div>
        <div class="db-empty-sub">All changes are saved directly to the database.</div>
      </div>
    } @else {

      <!-- Header row -->
      <div class="db-toolbar">
        <div class="db-toolbar-left">
          <span class="db-table-name">{{ selectedTable()!.label }}</span>
          <span class="db-row-count">{{ filteredRows().length }} / {{ rows().length }} rows</span>
        </div>
        <div class="db-toolbar-right">
          <input class="db-search" placeholder="Search…" [(ngModel)]="searchQ" (ngModelChange)="onSearch()">
          <button class="db-refresh-btn" (click)="reload()" title="Refresh">↺</button>
        </div>
      </div>

      <!-- Status bar -->
      @if (saveMsg()) {
        <div class="db-save-msg" [class.db-save-ok]="saveMsgOk()" [class.db-save-err]="!saveMsgOk()">
          {{ saveMsg() }}
        </div>
      }

      <!-- Loading -->
      @if (loading()) {
        <div class="db-loading">Loading…</div>
      } @else {

        <!-- Table -->
        <div class="db-table-wrap">
          <table class="db-table">
            <thead>
              <tr>
                @for (col of visibleColumns(); track col) {
                  <th class="db-th" (click)="sortBy(col)">
                    {{ colLabel(col) }}
                    @if (sortCol() === col) { <span>{{ sortDir() === 'asc' ? '▲' : '▼' }}</span> }
                  </th>
                }
                <th class="db-th db-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (row of pagedRows(); track pkVal(row)) {
                @let isEditing = editingId() === pkVal(row);
                <tr class="db-tr" [class.db-tr-editing]="isEditing">
                  @for (col of visibleColumns(); track col) {
                    <td class="db-td">
                      @if (isEditing && col !== pkCol() && !isFkDisplay(col)) {
                        <!-- Edit cell -->
                        @if (isBool(col)) {
                          <select class="db-cell-input db-cell-sel" [(ngModel)]="editRow[col]">
                            <option [value]="true">true</option>
                            <option [value]="false">false</option>
                          </select>
                        } @else if (dropdownFor(col)) {
                          <select class="db-cell-input db-cell-sel" [(ngModel)]="editRow[col]">
                            @for (opt of dropdownFor(col)!; track opt) {
                              <option [value]="opt">{{ opt }}</option>
                            }
                          </select>
                        } @else if (col.endsWith('_id')) {
                          <input class="db-cell-input" type="number" [(ngModel)]="editRow[col]"
                                 [placeholder]="col">
                        } @else if (col === 'matchTime' || col === 'roundStart') {
                          <input class="db-cell-input" type="datetime-local" [(ngModel)]="editRow[col]">
                        } @else if (isNumber(row[col])) {
                          <input class="db-cell-input" type="number" [(ngModel)]="editRow[col]">
                        } @else {
                          <input class="db-cell-input" type="text" [(ngModel)]="editRow[col]">
                        }
                      } @else {
                        <!-- Display cell -->
                        <span class="db-cell-val" [class.db-cell-pk]="col === pkCol()"
                              [class.db-cell-bool-true]="isBool(col) && row[col] === true"
                              [class.db-cell-bool-false]="isBool(col) && row[col] === false"
                              [class.db-cell-fk]="isFkDisplay(col)">
                          {{ displayVal(col, row[col]) }}
                        </span>
                      }
                    </td>
                  }
                  <td class="db-td db-td-actions">
                    @if (isEditing) {
                      <button class="db-btn db-btn-save" (click)="saveEdit(row)" [disabled]="saving()">
                        {{ saving() ? '…' : '✓ Save' }}
                      </button>
                      <button class="db-btn db-btn-cancel" (click)="cancelEdit()">✕</button>
                    } @else {
                      <button class="db-btn db-btn-edit" (click)="startEdit(row)">Edit</button>
                      <button class="db-btn db-btn-del" (click)="confirmDelete(row)">Del</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        @if (totalPages() > 1) {
          <div class="db-pagination">
            <button class="db-page-btn" [disabled]="page() === 0" (click)="page.set(page() - 1)">‹</button>
            <span class="db-page-info">Page {{ page() + 1 }} / {{ totalPages() }}</span>
            <button class="db-page-btn" [disabled]="page() === totalPages() - 1" (click)="page.set(page() + 1)">›</button>
            <select class="db-page-size-sel" [(ngModel)]="pageSize" (ngModelChange)="page.set(0)">
              <option [value]="20">20 / page</option>
              <option [value]="50">50 / page</option>
              <option [value]="100">100 / page</option>
            </select>
          </div>
        }
      }
    }
  </div>

</div>

<!-- Delete confirm dialog -->
@if (deleteTarget()) {
  <div class="db-backdrop" (click)="deleteTarget.set(null)">
    <div class="db-dialog" (click)="$event.stopPropagation()">
      <div class="db-dialog-title">⚠️ Delete row?</div>
      <div class="db-dialog-body">
        This will permanently delete the row with {{ pkCol() }} = <strong>{{ pkVal(deleteTarget()!) }}</strong> from <strong>{{ selectedTable()?.label }}</strong>.
      </div>
      <div class="db-dialog-actions">
        <button class="db-btn db-btn-cancel" (click)="deleteTarget.set(null)">Cancel</button>
        <button class="db-btn db-btn-del" (click)="doDelete()">Delete</button>
      </div>
    </div>
  </div>
}
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .db-wrap { display: flex; height: 100%; overflow: hidden; background: #111; }

    /* ── SIDEBAR ── */
    .db-sidebar {
      width: 200px; flex-shrink: 0; background: #0d0d0d; border-right: 1px solid #1f2937;
      display: flex; flex-direction: column; overflow-y: auto; padding: 8px 0;
    }
    .db-sidebar-title {
      color: #4b5563; font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: 1px; padding: 6px 14px 10px;
    }
    .db-table-btn {
      display: flex; align-items: center; gap: 8px; padding: 9px 14px;
      background: none; border: none; cursor: pointer; text-align: left; width: 100%;
      border-left: 3px solid transparent; transition: background 0.1s;
    }
    .db-table-btn:hover { background: #1a1a1a; }
    .db-table-active { background: #1e2a3a !important; border-left-color: #3b82f6 !important; }
    .db-table-icon { font-size: 14px; }
    .db-table-label { flex: 1; color: #d1d5db; font-size: 13px; font-weight: 600; }
    .db-table-active .db-table-label { color: #60a5fa; }
    .db-table-count {
      background: #1d4ed8; color: #fff; font-size: 10px; font-weight: 700;
      padding: 1px 6px; border-radius: 10px;
    }

    /* ── MAIN ── */
    .db-main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }

    .db-empty {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 10px; color: #4b5563;
    }
    .db-empty-icon { font-size: 48px; }
    .db-empty-title { color: #9ca3af; font-size: 16px; font-weight: 700; }
    .db-empty-sub { font-size: 13px; }

    /* Toolbar */
    .db-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; background: #0d0d0d; border-bottom: 1px solid #1f2937; flex-shrink: 0;
    }
    .db-toolbar-left { display: flex; align-items: center; gap: 10px; }
    .db-table-name { color: #f9fafb; font-size: 15px; font-weight: 800; }
    .db-row-count { color: #6b7280; font-size: 12px; }
    .db-toolbar-right { display: flex; align-items: center; gap: 8px; }
    .db-search {
      background: #1a1a1a; border: 1px solid #374151; border-radius: 6px;
      color: #f9fafb; padding: 5px 10px; font-size: 13px; outline: none; width: 180px;
    }
    .db-search:focus { border-color: #3b82f6; }
    .db-refresh-btn {
      background: #1a1a1a; border: 1px solid #374151; border-radius: 6px;
      color: #9ca3af; padding: 5px 10px; cursor: pointer; font-size: 16px;
    }
    .db-refresh-btn:hover { color: #fff; }

    .db-save-msg {
      padding: 7px 16px; font-size: 12px; font-weight: 700; flex-shrink: 0;
    }
    .db-save-ok  { background: #052e16; color: #4ade80; }
    .db-save-err { background: #450a0a; color: #fca5a5; }

    .db-loading { padding: 32px; text-align: center; color: #6b7280; }

    /* Table */
    .db-table-wrap { flex: 1; overflow: auto; }
    .db-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .db-th {
      background: #0d0d0d; color: #6b7280; font-size: 10px; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 10px;
      border-bottom: 1px solid #1f2937; white-space: nowrap; cursor: pointer;
      position: sticky; top: 0; z-index: 1; user-select: none;
    }
    .db-th:hover { color: #d1d5db; }
    .db-th-actions { cursor: default; }
    .db-tr { border-bottom: 1px solid #1a1a1a; }
    .db-tr:hover { background: #161616; }
    .db-tr-editing { background: #0f1f33 !important; }
    .db-td { padding: 6px 10px; vertical-align: middle; color: #e5e7eb; }
    .db-td-actions { white-space: nowrap; }

    .db-cell-val { display: block; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .db-cell-pk   { color: #6b7280; font-size: 11px; }
    .db-cell-fk   { color: #60a5fa; font-style: italic; }
    .db-cell-bool-true  { color: #4ade80; font-weight: 700; }
    .db-cell-bool-false { color: #f87171; font-weight: 700; }

    .db-cell-input {
      background: #111827; border: 1px solid #3b82f6; border-radius: 4px;
      color: #f9fafb; padding: 3px 6px; font-size: 12px; outline: none;
      width: 100%; min-width: 80px; max-width: 220px;
    }
    .db-cell-sel { max-width: 140px; }

    /* Buttons */
    .db-btn { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer; border: none; margin-right: 3px; }
    .db-btn-edit   { background: #1d4ed8; color: #fff; }
    .db-btn-edit:hover { background: #2563eb; }
    .db-btn-save   { background: #065f46; color: #4ade80; }
    .db-btn-save:hover:not(:disabled) { background: #047857; }
    .db-btn-save:disabled { opacity: .5; cursor: not-allowed; }
    .db-btn-cancel { background: #374151; color: #9ca3af; }
    .db-btn-cancel:hover { background: #4b5563; }
    .db-btn-del    { background: #7f1d1d; color: #fca5a5; }
    .db-btn-del:hover { background: #991b1b; }

    /* Pagination */
    .db-pagination {
      display: flex; align-items: center; gap: 8px; padding: 10px 16px;
      background: #0d0d0d; border-top: 1px solid #1f2937; flex-shrink: 0;
    }
    .db-page-btn {
      background: #1a1a1a; border: 1px solid #374151; border-radius: 4px;
      color: #d1d5db; padding: 4px 10px; cursor: pointer; font-size: 14px;
    }
    .db-page-btn:disabled { opacity: .35; cursor: not-allowed; }
    .db-page-info { color: #6b7280; font-size: 12px; flex: 1; text-align: center; }
    .db-page-size-sel {
      background: #1a1a1a; border: 1px solid #374151; border-radius: 4px;
      color: #d1d5db; padding: 4px 8px; font-size: 12px;
    }

    /* Delete dialog */
    .db-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
    }
    .db-dialog {
      background: #1f2937; border: 1px solid #374151; border-radius: 12px;
      padding: 24px; max-width: 400px; width: 90%;
    }
    .db-dialog-title { color: #f9fafb; font-size: 16px; font-weight: 800; margin-bottom: 12px; }
    .db-dialog-body  { color: #9ca3af; font-size: 13px; line-height: 1.6; margin-bottom: 20px; }
    .db-dialog-body strong { color: #e5e7eb; }
    .db-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }

    @media (max-width: 768px) {
      .db-sidebar { width: 44px; }
      .db-table-label, .db-table-count, .db-sidebar-title { display: none; }
      .db-table-btn { justify-content: center; padding: 10px; }
      .db-table-icon { font-size: 18px; }
      .db-search { width: 120px; }
    }
  `]
})
export class AdminDbComponent implements OnInit {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  tables      = signal<TableMeta[]>([]);
  selectedTable = signal<TableMeta | null>(null);
  rows        = signal<Row[]>([]);
  loading     = signal(false);
  saving      = signal(false);
  saveMsg     = signal('');
  saveMsgOk   = signal(true);
  editingId   = signal<any>(null);
  editRow     = {} as Row;
  deleteTarget = signal<Row | null>(null);
  page        = signal(0);
  pageSize    = 50;
  searchQ     = '';
  sortCol     = signal('');
  sortDir     = signal<'asc'|'desc'>('asc');

  filteredRows = computed(() => {
    const q = this.searchQ.toLowerCase().trim();
    let list = q
      ? this.rows().filter(r => Object.values(r).some(v => v != null && String(v).toLowerCase().includes(q)))
      : this.rows();
    const col = this.sortCol();
    if (col) {
      list = [...list].sort((a, b) => {
        const av = a[col], bv = b[col];
        const cmp = av == null ? -1 : bv == null ? 1 : String(av).localeCompare(String(bv), undefined, { numeric: true });
        return this.sortDir() === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize)));

  pagedRows = computed(() => {
    const p = Math.min(this.page(), this.totalPages() - 1);
    return this.filteredRows().slice(p * this.pageSize, (p + 1) * this.pageSize);
  });

  visibleColumns = computed(() => {
    return this.selectedTable()?.columns ?? [];
  });

  ngOnInit() {
    this.http.get<TableMeta[]>(`${this.base}/db/tables`).subscribe({
      next: t => this.tables.set(t),
      error: () => {}
    });
  }

  selectTable(t: TableMeta) {
    this.selectedTable.set(t);
    this.rows.set([]);
    this.editingId.set(null);
    this.searchQ = '';
    this.page.set(0);
    this.sortCol.set('');
    this.saveMsg.set('');
    this.loadRows();
  }

  loadRows() {
    const t = this.selectedTable();
    if (!t) return;
    this.loading.set(true);
    this.http.get<Row[]>(`${this.base}/db/table/${t.key}`).subscribe({
      next: rows => { this.rows.set(rows); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  reload() { this.loadRows(); }
  onSearch() { this.page.set(0); }

  sortBy(col: string) {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  pkCol(): string { return PK[this.selectedTable()?.key ?? ''] ?? 'id'; }
  pkVal(row: Row): any { return row[this.pkCol()]; }
  isFkDisplay(col: string): boolean { return FK_DISPLAY.has(col); }
  isBool(col: string): boolean { return BOOL_COLS.has(col); }
  dropdownFor(col: string): string[] | null { return DROPDOWN_COLS[col] ?? null; }
  isNumber(v: any): boolean { return typeof v === 'number'; }

  colLabel(col: string): string {
    if (col.endsWith('_id')) return col.replace('_id', ' ID');
    return col.replace(/([A-Z])/g, ' $1').trim();
  }

  displayVal(col: string, val: any): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    return String(val);
  }

  tableIcon(key: string): string {
    const icons: Record<string, string> = {
      teams: '🌍', players: '⚽', matches: '🏟️',
      match_player_stats: '📊', app_users: '👥',
      user_transfer_records: '🔁', round_config: '⚙️'
    };
    return icons[key] ?? '🗄️';
  }

  startEdit(row: Row) {
    this.editingId.set(this.pkVal(row));
    this.editRow = { ...row };
    this.saveMsg.set('');
  }

  cancelEdit() { this.editingId.set(null); }

  saveEdit(row: Row) {
    const t = this.selectedTable();
    if (!t) return;
    this.saving.set(true);
    const pk = this.pkVal(row);
    // Send only non-display fields
    const payload: Row = {};
    Object.keys(this.editRow).forEach(k => {
      if (!FK_DISPLAY.has(k)) payload[k] = this.editRow[k];
    });
    this.http.patch<any>(`${this.base}/db/table/${t.key}/${pk}`, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.editingId.set(null);
        this.flash('Saved successfully', true);
        this.loadRows();
      },
      error: (err) => {
        this.saving.set(false);
        this.flash(err.error?.error || 'Save failed', false);
      }
    });
  }

  confirmDelete(row: Row) { this.deleteTarget.set(row); }

  doDelete() {
    const t = this.selectedTable();
    const row = this.deleteTarget();
    if (!t || !row) return;
    const pk = this.pkVal(row);
    this.http.delete(`${this.base}/db/table/${t.key}/${pk}`).subscribe({
      next: () => {
        this.deleteTarget.set(null);
        this.flash('Row deleted', true);
        this.loadRows();
      },
      error: () => {
        this.deleteTarget.set(null);
        this.flash('Delete failed', false);
      }
    });
  }

  private flash(msg: string, ok: boolean) {
    this.saveMsg.set(msg);
    this.saveMsgOk.set(ok);
    setTimeout(() => this.saveMsg.set(''), 3000);
  }
}
