import { Component, inject, OnInit, signal, computed, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Player, UserTeam, Match, UserTransferRecord, RoundConfig } from '../../models/models';

const BUDGET = 105_000_000;
const TOTAL_PLAYERS = 15;
const POS_COLOR: Record<string, string> = { GK: '#f59e0b', DEF: '#10b981', MID: '#3b82f6', FWD: '#ef4444' };

// Fallback defaults — used until round-config loads from API
const DEFAULT_FREE_TRANSFERS: Record<string, number> = { GROUP: Infinity, R32: 4, R16: 4, QF: 4, SF: 5, FINAL: 6 };
const DEFAULT_COUNTRY_LIMIT:  Record<string, number> = { GROUP: 3, R32: 3, R16: 4, QF: 5, SF: 6, FINAL: 8 };

const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Before Round of 32', R32: 'Round of 32', R16: 'Round of 16',
  QF: 'Quarter-Final', SF: 'Semi-Final', LF: "Losers' Final", FINAL: 'Final'
};

type SlotRef = { pos: string; type: 'xi' | 'bench'; i: number };

// formation string → [DEF, MID, FWD] counts (GK is always 1)
const FORMATIONS: Record<string, [number, number, number]> = {
  '4-4-2': [4, 4, 2],
  '4-3-3': [4, 3, 3],
  '4-5-1': [4, 5, 1],
  '3-4-3': [3, 4, 3],
  '3-5-2': [3, 5, 2],
  '5-4-1': [5, 4, 1],
  '5-3-2': [5, 3, 2],
};

// Squad quota is formation-driven: each outfield position gets exactly
// (formation count + 1 bench sub). GK is always 2.
function quotaFor(formation: string): Record<string, number> {
  const [def, mid, fwd] = FORMATIONS[formation] ?? FORMATIONS['4-4-2'];
  return { GK: 2, DEF: def + 1, MID: mid + 1, FWD: fwd + 1 };
}

function buildRows(formation: string): SlotRef[][] {
  const [def, mid, fwd] = FORMATIONS[formation] ?? FORMATIONS['4-4-2'];
  const rows: SlotRef[][] = [[{ pos: 'GK', type: 'xi', i: 0 }]];
  let idx = 1;
  const defSlots: SlotRef[] = [];
  for (let i = 0; i < def; i++) defSlots.push({ pos: 'DEF', type: 'xi', i: idx++ });
  rows.push(defSlots);
  const midSlots: SlotRef[] = [];
  for (let i = 0; i < mid; i++) midSlots.push({ pos: 'MID', type: 'xi', i: idx++ });
  rows.push(midSlots);
  const fwdSlots: SlotRef[] = [];
  for (let i = 0; i < fwd; i++) fwdSlots.push({ pos: 'FWD', type: 'xi', i: idx++ });
  rows.push(fwdSlots);
  return rows;
}

// slot index → position for any formation
function slotPos(i: number, formation: string): string {
  if (i === 0) return 'GK';
  const [def, mid] = FORMATIONS[formation] ?? FORMATIONS['4-4-2'];
  if (i <= def) return 'DEF';
  if (i <= def + mid) return 'MID';
  return 'FWD';
}

const BENCH_ROW: SlotRef[] = [
  { pos: 'GK',  type: 'bench', i: 0 },
  { pos: 'DEF', type: 'bench', i: 1 },
  { pos: 'MID', type: 'bench', i: 2 },
  { pos: 'FWD', type: 'bench', i: 3 },
];

@Component({
  selector: 'app-my-team',
  standalone: true,
  imports: [FormsModule],
  template: `
<div class="page-wrap" (click)="closePanel()">

  <!-- ═══════════════════ HEADER ═══════════════════ -->
  <div class="header-bar" (click)="$event.stopPropagation()">
    <div class="hb-brand">
      <div class="hb-logo-badge">⚽</div>
      <div>
        <div class="hb-title">FIFA WORLD CUP™</div>
        <div class="hb-sub">FANTASY</div>
      </div>
    </div>
    <div class="hb-deadline">
      <div class="hb-dl-lbl">Transfer window</div>
      @if (windowOpen()) {
        <div class="hb-dl-val win-open">OPEN · closes {{ fmtHour(currentConfig()?.windowCloseHour ?? 19) }}</div>
      } @else {
        <div class="hb-dl-val win-closed">CLOSED · opens {{ fmtHour(currentConfig()?.windowOpenHour ?? 12) }}</div>
      }
      <div class="hb-dl-sub">Next match: {{ deadlineLabel() }}</div>
    </div>
    <div class="hb-pills">
      <div class="hb-pill">
        <div class="hb-pill-val" [class.over-budget]="remainingBudget() < 0">{{ fmtM(remainingBudget()) }}</div>
        <div class="hb-pill-lbl">Budget</div>
      </div>
      <div class="hb-pill">
          <div class="hb-pill-val" [class.over-budget]="xiCount() > 11">{{ xiCount() }}/11</div>
          <div class="hb-pill-lbl">XI</div>
        </div>
        <div class="hb-pill">
          <div class="hb-pill-val" [class.over-budget]="benchCount() > 4">{{ benchCount() }}/4</div>
          <div class="hb-pill-lbl">Bench</div>
        </div>
    </div>
    @if (existingTeam() && !isUnlimitedStage()) {
      <div class="hb-transfers" [class.penalty]="transfersRemaining() === 0">
        <span class="tf-count">{{ transfersRemaining() }}/{{ freeTransfersForStage() }} free</span>
        @if ((transferRecord()?.penaltyPoints ?? 0) > 0) {
          <span class="tf-penalty">−{{ transferRecord()?.penaltyPoints }}pts used</span>
        } @else {
          <span class="tf-stage">{{ stageLabel() }}</span>
        }
      </div>
    }
    @if (existingTeam() && isUnlimitedStage()) {
      <div class="hb-transfers hb-transfers-unlimited">
        <span class="tf-count">∞ free</span>
        @if (pendingTransfers() > 0) {
          <span class="tf-stage">{{ pendingTransfers() }} unsaved</span>
        } @else {
          <span class="tf-stage">{{ stageLabel() }}</span>
        }
      </div>
    }
    @if (squadEliminatedCount() > 0) {
      <div class="hb-elim-warn">
        <span class="hb-elim-icon">⚠️</span>
        <span>{{ squadEliminatedCount() }} player{{ squadEliminatedCount() > 1 ? 's' : '' }} eliminated</span>
      </div>
    }
  </div>

  <!-- ═══════════════════ BODY ═══════════════════ -->
  <div class="body-row" [class.mobile-show-pool]="mobileView() === 'pool'">

    <!-- ── LEFT: PITCH ── -->
    <div class="pitch-col" (click)="$event.stopPropagation()">

      <!-- Transfer panel — limited stages (R32 onwards) -->
      @if (existingTeam() && !isUnlimitedStage()) {
        <div class="transfer-panel">
          <div class="tp-stage-col">
            <span class="tp-stage-badge">{{ stageLabel() }}</span>
            <span class="tp-window-lbl">
              Window: {{ fmtHour(currentConfig()?.windowOpenHour ?? 12) }}–{{ fmtHour(currentConfig()?.windowCloseHour ?? 19) }} IST daily
            </span>
          </div>
          <div class="tp-divider"></div>
          <div class="tp-stat">
            <div class="tp-val">{{ freeTransfersForStage() }}</div>
            <div class="tp-lbl">Allowed</div>
          </div>
          <div class="tp-stat">
            <div class="tp-val" [class.used-all]="(transferRecord()?.transfersMade ?? 0) >= freeTransfersForStage()">
              {{ transferRecord()?.transfersMade ?? 0 }}
            </div>
            <div class="tp-lbl">Used</div>
          </div>
          <div class="tp-stat">
            <div class="tp-val free" [class.zero]="transfersRemaining() === 0">
              {{ transfersRemaining() }}
            </div>
            <div class="tp-lbl">Free Left</div>
          </div>
          @if (pendingTransfers() > 0) {
            <div class="tp-stat">
              <div class="tp-val" [class.penalty]="transferPenalty() > 0">
                {{ pendingTransfers() }}
              </div>
              <div class="tp-lbl">Unsaved</div>
            </div>
          }
          @if (transferPenalty() > 0) {
            <div class="tp-penalty-pill">−{{ transferPenalty() }} pts!</div>
          } @else if (pendingTransfers() > 0 && transfersRemaining() > 0) {
            <div class="tp-free-pill">Free ✓</div>
          }
        </div>
      }

      <!-- Transfer panel — unlimited stage (GROUP) -->
      @if (existingTeam() && isUnlimitedStage()) {
        <div class="transfer-panel">
          <div class="tp-stage-col">
            <span class="tp-stage-badge">{{ stageLabel() }}</span>
            <span class="tp-window-lbl">Unlimited free transfers</span>
          </div>
          <div class="tp-divider"></div>
          <div class="tp-stat">
            <div class="tp-val free">∞</div>
            <div class="tp-lbl">Allowed</div>
          </div>
          <div class="tp-stat">
            <div class="tp-val">{{ transferRecord()?.transfersMade ?? 0 }}</div>
            <div class="tp-lbl">Done</div>
          </div>
          @if (pendingTransfers() > 0) {
            <div class="tp-stat">
              <div class="tp-val">{{ pendingTransfers() }}</div>
              <div class="tp-lbl">Unsaved</div>
            </div>
            <div class="tp-free-pill">Free ✓</div>
          }
        </div>
      }

      <!-- Pitch canvas -->
      <div class="pitch">
        <select class="pitch-display-select" [ngModel]="pitchDisplay()" (ngModelChange)="pitchDisplay.set($event)" (click)="$event.stopPropagation()">
          <option value="price">Price</option>
          <option value="pts">Points</option>
        </select>
        <div class="pitch-markings">
          <div class="pm halfway"></div>
          <div class="pm center-circle"></div>
          <div class="pm penalty-top"></div>
          <div class="pm penalty-bot"></div>
          <div class="pm goal-top"></div>
          <div class="pm goal-bot"></div>
        </div>

        @for (row of pitchRows(); track $index) {
          <div class="pitch-row">
            @for (slot of row; track slot.type + slot.i) {
              <div class="p-slot"
                   [class.p-active]="isActiveSlot(slot)"
                   [class.is-swap-target]="isSwapTarget(slot)"
                   (click)="$event.stopPropagation(); tapSlot(slot.type, slot.i, slot.pos)">

                @if (isSwapTarget(slot)) {
                  <div class="swap-overlay">⇅</div>
                }

                @if (getSlotPlayer(slot); as p) {
                  <div class="p-card" [class.p-card-eliminated]="eliminatedPlayerIds().has(p.id)">
                    @if (eliminatedPlayerIds().has(p.id)) {
                      <div class="elim-overlay">
                        <span class="elim-skull">💀</span>
                        <span class="elim-text">OUT</span>
                      </div>
                    }
                    <div class="p-card-icons">
                      <button class="icon-btn minus-btn" [disabled]="!windowOpen()" (click)="$event.stopPropagation(); removeSlot(slot)" title="Remove">
                        <span class="icon-circle minus-circle">−</span>
                      </button>
                      <div class="cap-badges">
                        @if (captainId() === p.id) { <span class="cap-icon c-icon">C</span> }
                        @if (vcId() === p.id)      { <span class="cap-icon vc-icon">V</span> }
                      </div>
                    </div>
                    <div class="p-avatar filled-av" [style.--pc]="posColor(p.position)"></div>
                    <div class="p-name-bar">{{ shortName(p.name) }}</div>
                    <div class="p-price-bar" [style.background]="posColor(p.position)">
                      {{ pitchDisplay() === 'pts' ? (p.totalPoints ?? 0) + ' pts' : fmtM(p.price) }}
                    </div>
                  </div>
                } @else {
                  <div class="p-card p-card-empty">
                    <div class="p-avatar empty-av">
                      <span class="p-plus-icon">+</span>
                    </div>
                    <div class="p-name-bar dim-bar">{{ slot.pos }}</div>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>

      <!-- Bench strip -->
      <div class="bench-strip">
        <div class="bench-strip-label">BENCH</div>
        <div class="bench-strip-slots">
          @for (slot of BENCH_ROW; track slot.i) {
            <div class="p-slot is-bench"
                 [class.p-active]="isActiveSlot(slot)"
                 [class.is-swap-target]="isSwapTarget(slot)"
                 (click)="$event.stopPropagation(); tapSlot(slot.type, slot.i, slot.pos)">

              @if (isSwapTarget(slot)) {
                <div class="swap-overlay">⇅</div>
              }

              @if (getSlotPlayer(slot); as p) {
                <div class="p-card p-card-bench" [class.p-card-eliminated]="eliminatedPlayerIds().has(p.id)">
                  @if (eliminatedPlayerIds().has(p.id)) {
                    <div class="elim-overlay">
                      <span class="elim-skull">💀</span>
                      <span class="elim-text">OUT</span>
                    </div>
                  }
                  <div class="bench-badge">SUB</div>
                  <div class="p-card-icons">
                    <button class="icon-btn minus-btn" [disabled]="!windowOpen()" (click)="$event.stopPropagation(); removeSlot(slot)" title="Remove">
                      <span class="icon-circle minus-circle">−</span>
                    </button>
                    <div class="cap-badges">
                      @if (captainId() === p.id) { <span class="cap-icon c-icon">C</span> }
                      @if (vcId() === p.id)      { <span class="cap-icon vc-icon">V</span> }
                    </div>
                  </div>
                  <div class="p-avatar filled-av" [style.--pc]="posColor(p.position)"></div>
                  <div class="p-name-bar">{{ shortName(p.name) }}</div>
                  <div class="p-price-bar" [style.background]="posColor(p.position)">
                    {{ pitchDisplay() === 'pts' ? (p.totalPoints ?? 0) + ' pts' : fmtM(p.price) }}
                  </div>
                </div>
              } @else {
                <div class="p-card p-card-empty p-card-bench">
                  <div class="p-avatar empty-av bench-av">
                    <span class="p-plus-icon">+</span>
                  </div>
                  <div class="p-name-bar dim-bar">{{ slot.pos }}</div>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Action menu (captain / vc assignment) -->
      @if (showActionMenu() && activePlayer(); as p) {
        <div class="action-menu" (click)="$event.stopPropagation()">
          <div class="am-row">
            <div class="am-dot" [style.background]="posColor(p.position)">{{ p.position }}</div>
            <div class="am-info">
              <div class="am-name">{{ p.name }}</div>
              <div class="am-meta">{{ p.team.name }} · {{ fmtM(p.price) }}</div>
            </div>
            <button class="am-close" (click)="activeSlot.set(null)">✕</button>
          </div>
          <div class="am-swap-hint">
            @if (activeSlot()?.type === 'xi') {
              <span class="am-hint-text">⇅ Tap a bench player below to substitute</span>
            } @else {
              <span class="am-hint-text">⇅ Tap a pitch player to substitute</span>
            }
          </div>
          <div class="am-actions">
            <button class="am-btn am-remove" [disabled]="!windowOpen()" (click)="removeActive()">Remove</button>
            <button class="am-btn am-cap" [class.am-sel]="captainId() === p.id" (click)="setCaptain(p.id)">
              {{ captainId() === p.id ? '✓ Captain' : 'Captain' }}
            </button>
            <button class="am-btn am-vc" [class.am-sel]="vcId() === p.id" (click)="setVC(p.id)">
              {{ vcId() === p.id ? '✓ Vice-C' : 'Vice-C' }}
            </button>
          </div>
        </div>
      }

      <!-- Toolbar -->
      <div class="pitch-toolbar" (click)="$event.stopPropagation()">
        <div class="cap-tags">
          <span class="cap-tag c-tag">C: {{ captainName() ?? '—' }}</span>
          <span class="cap-tag v-tag">V: {{ vcName() ?? '—' }}</span>
        </div>
        <select class="formation-select" [ngModel]="selectedFormation()" (ngModelChange)="changeFormation($event)" [disabled]="!windowOpen()">
          @for (f of FORMATIONS; track f) {
            <option [value]="f">{{ f }}</option>
          }
        </select>
        <button class="autopick-btn" [class.picking]="autoPicking()" [disabled]="!windowOpen()" (click)="autoPick()">⚡ AUTOPICK</button>
        <button class="clear-btn" [disabled]="!windowOpen()" (click)="clearAll()">✕ Clear</button>
      </div>

      <!-- Save button -->
      <div class="save-row" (click)="$event.stopPropagation()">
        @if (!windowOpen()) {
          <div class="window-closed-bar">
            🔒 Transfer window closed · Opens {{ fmtHour(currentConfig()?.windowOpenHour ?? 12) }} IST
          </div>
        }
        <button class="save-btn" [disabled]="!canSave()" (click)="confirmSave()">
          {{ saveButtonLabel() }}
        </button>
      </div>

      @if (message()) {
        <div class="msg-bar" [class.msg-ok]="msgOk()" [class.msg-err]="!msgOk()">{{ message() }}</div>
      }

      <!-- Key -->
      <div class="key-bar" (click)="$event.stopPropagation()">
        <span class="key-title">Key</span>
        <div class="key-items">
          <span class="key-item"><span class="ki-btn ki-rem">−</span> Remove</span>
          <span class="key-item"><span class="ki-cap c-cap">C</span> Captain</span>
          <span class="key-item"><span class="ki-cap vc-cap">V</span> Vice-Capt</span>
          <span class="key-item"><span class="ki-dim">░</span> Sub</span>
        </div>
      </div>
    </div>

    <!-- ── RIGHT: PLAYER POOL ── -->
    <div class="pool-col" (click)="$event.stopPropagation()">
      <div class="pool-header">
        <span class="pool-title">PLAYER POOL</span>
        <button class="pool-reset" title="Reset filters" (click)="resetFilters()">↺</button>
      </div>

      <div class="pos-tabs">
        @for (pos of POS_LIST; track pos) {
          <button class="pos-tab" [class.tab-active]="poolPos() === pos"
            [style.--tc]="posColor(pos)" (click)="setPoolPos(pos)">
            {{ pos }}
            <span class="pos-count">{{ countInSquad(pos) }}/{{ totalQuotaFor(pos) }}</span>
          </button>
        }
      </div>

      <!-- Search -->
      <div class="pool-controls" (click)="$event.stopPropagation()">
        <input class="pool-search" placeholder="Search player or team…"
          [ngModel]="poolSearch()" (ngModelChange)="poolSearch.set($event)">
      </div>

      <div class="pool-col-hdr">
        <button class="pch-sort-btn pch-player-btn" [class.pch-active]="sortBy().startsWith('name')" (click)="toggleSort('name')">
          Player {{ sortArrow('name') }}
        </button>
        <button class="pch-sort-btn" [class.pch-active]="sortBy().startsWith('price')" (click)="toggleSort('price')">
          Price {{ sortArrow('price') }}
        </button>
        <button class="pch-sort-btn" [class.pch-active]="sortBy().startsWith('pts')" (click)="toggleSort('pts')">
          Pts {{ sortArrow('pts') }}
        </button>
        <span class="pch-action">+/−</span>
      </div>

      <div class="pool-list">
        @if (poolLoading()) {
          <div class="pool-empty">Loading players…</div>
        } @else if (filteredPool().length === 0) {
          <div class="pool-empty">No players match your filter</div>
        }
        @for (p of filteredPool(); track p.id) {
          <div class="pool-row" [class.is-picked]="inSquad(p.id)" [class.pos-mismatch]="!!activeSlot() && p.position !== activeSlot()!.pos && !inSquad(p.id)">
            <div class="pr-pos-badge" [style.background]="posColor(p.position)">{{ p.position }}</div>
            <div class="pr-info">
              <div class="pr-name">{{ p.name }}</div>
              <div class="pr-meta">{{ p.team.name }}</div>
            </div>
            <div class="pr-price" [class.pr-col-active]="sortBy() === 'price_desc'">{{ fmtM(p.price) }}</div>
            <div class="pr-pts"   [class.pr-col-active]="sortBy() === 'pts_desc'">{{ p.totalPoints ?? 0 }}</div>
            @if (canSubIntoActiveSlot(p)) {
              <button class="pr-circ-btn pr-sub-btn" [disabled]="!windowOpen()" (click)="subPlayerIntoActiveSlot(p)" title="Substitute">⇅</button>
            } @else if (inSquad(p.id)) {
              <button class="pr-circ-btn pr-rem-btn" [disabled]="!windowOpen()" (click)="removeById(p.id)" title="Remove"><span>−</span></button>
            } @else {
              <button class="pr-circ-btn pr-add-btn" [disabled]="!windowOpen() || !canAdd(p)" (click)="addPlayerFromPool(p)" title="Add"><span>+</span></button>
            }
          </div>
        }
      </div>

      <!-- Mobile-only: back to pitch button -->
      <div class="view-team-bar">
        <button class="view-team-btn" (click)="viewTeam()">⬅ View Team</button>
      </div>
    </div>

  </div>
</div>

<!-- ── Restore Saved Team Dialog ────────────────────────────────────── -->
@if (restoreDlg(); as rdlg) {
  <div class="fm-backdrop" (click)="restoreDlgCancel()">
    <div class="fm-dialog fm-dialog-sm" (click)="$event.stopPropagation()">

      <div class="fm-header">
        <div class="fm-header-left">
          <span class="fm-title">Restore Saved Team</span>
          <div class="fm-formation-row">
            <span class="fm-badge fm-badge-old">{{ formation() }}</span>
            <span class="fm-arrow">→</span>
            <span class="fm-badge fm-badge-new">{{ rdlg.savedFormation }}</span>
          </div>
        </div>
        <button class="fm-close-btn" (click)="restoreDlgCancel()">✕</button>
      </div>

      <div class="fm-body">
        <div class="fm-section fm-section-warn fm-restore-body">
          <div class="fm-restore-icon">↩</div>
          <p class="fm-restore-msg">
            You have unsaved changes. Going back to <strong>{{ rdlg.savedFormation }}</strong> will restore your last saved squad exactly as it was.
          </p>
          <p class="fm-restore-sub">
            All unsaved formation changes and transfers will be discarded — no transfer deductions will apply.
          </p>
        </div>
      </div>

      <div class="fm-actions">
        <button class="fm-btn fm-btn-cancel" (click)="restoreDlgCancel()">Keep Changes</button>
        <button class="fm-btn fm-btn-restore" (click)="restoreDlgConfirm()">Yes, Restore</button>
      </div>

    </div>
  </div>
}

<!-- ── Formation Change Dialog ─────────────────────────────────────── -->
@if (fmDlg(); as dlg) {
  <div class="fm-backdrop" (click)="fmDlgCancel()">
    <div class="fm-dialog" (click)="$event.stopPropagation()">

      <!-- Header -->
      <div class="fm-header">
        <div class="fm-header-left">
          <span class="fm-title">Formation Change</span>
          <div class="fm-formation-row">
            <span class="fm-badge fm-badge-old">{{ dlg.from }}</span>
            <span class="fm-arrow">→</span>
            <span class="fm-badge fm-badge-new">{{ dlg.to }}</span>
          </div>
        </div>
        <button class="fm-close-btn" (click)="fmDlgCancel()">✕</button>
      </div>

      <div class="fm-body">

        <!-- Info note when unsaved changes were discarded before computing diff -->
        @if (dlg.restoredFromSaved) {
          <div class="fm-info-note">
            ℹ️ Your unsaved changes were discarded. Player conflicts below are compared against your <strong>saved team ({{ dlg.from }})</strong>, not your previous unsaved state.
          </div>
        }

        <!-- Conflicts: user picks who to drop per position -->
        @for (conflict of dlg.conflicts; track conflict.pos; let ci = $index) {
          <div class="fm-section fm-section-conflict">
            <div class="fm-section-title">
              <span class="fm-pos-pill" [style.background]="posColor(conflict.pos)">{{ conflict.pos }}</span>
              Squad has too many {{ conflict.pos }}s for <strong>{{ dlg.to }}</strong>
            </div>
            <div class="fm-drop-info">
              New {{ conflict.pos }} quota: <strong>{{ conflict.newQuota }}</strong> &nbsp;·&nbsp;
              Select <strong>{{ conflict.dropCount }}</strong> player{{ conflict.dropCount > 1 ? 's' : '' }} to remove
              <span class="fm-drop-counter"
                [class.fm-drop-done]="conflict.selectedDrops.size === conflict.dropCount">
                {{ conflict.selectedDrops.size }}/{{ conflict.dropCount }} selected
              </span>
            </div>
            <div class="fm-candidates">
              @for (c of conflict.candidates; track c.id) {
                @let isSelected = conflict.selectedDrops.has(c.id);
                @let maxReached = conflict.selectedDrops.size >= conflict.dropCount && !isSelected;
                <button class="fm-candidate-btn"
                  [class.fm-cand-selected]="isSelected"
                  [class.fm-cand-disabled]="maxReached"
                  [disabled]="maxReached"
                  (click)="fmDlgToggleDrop(ci, c.id)">
                  <span class="fm-pos-dot" [style.background]="posColor(conflict.pos)"></span>
                  <span class="fm-cand-name">{{ c.name }}</span>
                  <span class="fm-cand-tag" [class.bench-tag]="!c.isXI">{{ c.isXI ? 'XI' : 'Bench' }}</span>
                  @if (isSelected) {
                    <span class="fm-cand-drop-label">✕ DROP</span>
                  }
                </button>
              }
            </div>

            <!-- Bench-move sub-prompt: appears once drops are fully chosen and XI still exceeds new XI slots -->
            @let benchMoveNeeded = fmBenchMoveCountFor(conflict);
            @if (conflict.selectedDrops.size === conflict.dropCount && benchMoveNeeded > 0) {
              <div class="fm-bench-move-section">
                <div class="fm-drop-info fm-bench-move-title">
                  <span>Choose <strong>{{ benchMoveNeeded }}</strong> {{ conflict.pos }} player{{ benchMoveNeeded > 1 ? 's' : '' }} to move to bench</span>
                  <span class="fm-drop-counter"
                    [class.fm-drop-done]="conflict.selectedBenchMoves.size === benchMoveNeeded">
                    {{ conflict.selectedBenchMoves.size }}/{{ benchMoveNeeded }} selected
                  </span>
                </div>
                <div class="fm-candidates">
                  @for (c of conflict.candidates; track c.id) {
                    @if (c.isXI && !conflict.selectedDrops.has(c.id)) {
                      @let isMoveSelected = conflict.selectedBenchMoves.has(c.id);
                      @let moveFull = conflict.selectedBenchMoves.size >= benchMoveNeeded && !isMoveSelected;
                      <button class="fm-candidate-btn fm-candidate-bench-move"
                        [class.fm-cand-selected]="isMoveSelected"
                        [class.fm-cand-disabled]="moveFull"
                        [disabled]="moveFull"
                        (click)="fmDlgToggleBenchMove(ci, c.id)">
                        <span class="fm-pos-dot" [style.background]="posColor(conflict.pos)"></span>
                        <span class="fm-cand-name">{{ c.name }}</span>
                        <span class="fm-cand-tag">XI</span>
                        @if (isMoveSelected) {
                          <span class="fm-cand-drop-label fm-bench-move-label">→ BENCH</span>
                        }
                      </button>
                    }
                  }
                </div>
              </div>
            }

          </div>
        }

        <!-- Empty slots warning (transfers needed) -->
        @if (dlg.emptySlots.length > 0) {
          <div class="fm-section fm-section-warn">
            <div class="fm-section-title">⚠️ New empty slots — transfers required to fill them</div>
            @for (s of dlg.emptySlots; track s.pos) {
              <div class="fm-empty-row">
                <span class="fm-pos-dot" [style.background]="posColor(s.pos)"></span>
                <span>{{ s.count }} × {{ s.pos }} slot{{ s.count > 1 ? 's' : '' }} will be empty</span>
                <span class="fm-transfer-badge">+{{ s.count }} transfer{{ s.count > 1 ? 's' : '' }}</span>
              </div>
            }
          </div>
        }

      </div>

      <!-- Actions -->
      <div class="fm-actions">
        <button class="fm-btn fm-btn-cancel" (click)="fmDlgCancel()">Cancel</button>
        <button class="fm-btn fm-btn-confirm" [disabled]="!fmDlgCanConfirm()" (click)="fmDlgConfirm()">
          Confirm Change
        </button>
      </div>

    </div>
  </div>
}
  `,
  styles: [`
    :host { display: block; }

    .page-wrap {
      position: fixed; top: 56px; left: 0; right: 0; bottom: 0;
      background: #1565c0; font-family: 'Roboto', sans-serif;
      display: flex; flex-direction: column; overflow: hidden;
    }

    /* ── HEADER ── */
    .header-bar {
      background: #0d0d0d; border-bottom: 1px solid #222;
      padding: 8px 16px; display: flex; align-items: center; gap: 12px;
      flex-wrap: wrap; flex-shrink: 0;
    }
    .hb-brand { display: flex; align-items: center; gap: 10px; }
    .hb-logo-badge { width: 38px; height: 38px; border-radius: 8px; background: linear-gradient(135deg,#1565c0,#0d47a1); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
    .hb-title { color: #fff; font-size: 11px; font-weight: 900; letter-spacing: 1px; line-height: 1.1; }
    .hb-sub   { color: #60a5fa; font-size: 9px; font-weight: 700; letter-spacing: 2px; }
    .hb-deadline { margin-left: auto; text-align: center; }
    .hb-dl-lbl { color: #6b7280; font-size: 9px; text-transform: uppercase; }
    .hb-dl-val { font-size: 12px; font-weight: 800; }
    .hb-dl-sub { color: #6b7280; font-size: 9px; margin-top: 1px; }
    .win-open   { color: #4ade80; }
    .win-closed { color: #f87171; }
    .hb-pills { display: flex; gap: 6px; }
    .hb-pill { background: #1a1a1a; border: 1px solid #333; border-radius: 10px; padding: 6px 14px; text-align: center; min-width: 70px; }
    .hb-pill-val { color: #fff; font-size: 17px; font-weight: 900; line-height: 1; }
    .hb-pill-val.over-budget { color: #ef4444; }
    .hb-pill-lbl { color: #6b7280; font-size: 9px; text-transform: uppercase; margin-top: 2px; }
    .hb-transfers { background: #052e16; border: 1px solid #16a34a; border-radius: 10px; padding: 5px 12px; display: flex; flex-direction: column; align-items: center; }
    .hb-transfers.penalty { background: #2d0a0a; border-color: #ef4444; }
    .hb-transfers-unlimited { background: #0a1f3d; border-color: #3b82f6; }
    .tf-count   { color: #fff; font-size: 11px; font-weight: 700; }
    .tf-free    { color: #4ade80; font-size: 10px; font-weight: 600; }
    .tf-penalty { color: #f87171; font-size: 10px; font-weight: 700; }

    /* ── BODY ── */
    .body-row { display: flex; flex: 1; min-height: 0; overflow: hidden; }

    /* ── PITCH COLUMN ── */
    .pitch-col { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 6px 10px 0; overflow: hidden; }

    /* Transfer panel */
    .transfer-panel { display: flex; align-items: center; background: #0d0d0d; border: 1px solid #1f2937; border-radius: 8px; padding: 6px 10px; margin-bottom: 5px; flex-shrink: 0; gap: 2px; flex-wrap: wrap; }
    .tp-stage-col { display: flex; flex-direction: column; gap: 2px; margin-right: 4px; }
    .tp-stage-badge { background: #1d4ed8; color: #fff; font-size: 10px; font-weight: 900; padding: 2px 8px; border-radius: 4px; white-space: nowrap; }
    .tp-window-lbl { color: #6b7280; font-size: 8px; white-space: nowrap; }
    .tp-divider { width: 1px; background: #1f2937; height: 32px; margin: 0 8px; flex-shrink: 0; }
    .tp-stat { display: flex; flex-direction: column; align-items: center; min-width: 38px; }
    .tp-val { color: #fff; font-size: 15px; font-weight: 900; line-height: 1.1; }
    .tp-val.free      { color: #4ade80; }
    .tp-val.free.zero { color: #f87171; }
    .tp-val.used-all  { color: #f87171; }
    .tp-val.penalty   { color: #fbbf24; }
    .tp-lbl { color: #6b7280; font-size: 8px; text-transform: uppercase; }
    .tp-penalty-pill { margin-left: auto; background: #450a0a; color: #fca5a5; border: 1px solid #7f1d1d; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 800; white-space: nowrap; }
    .tp-free-pill { margin-left: auto; background: #052e16; color: #4ade80; border: 1px solid #14532d; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }
    .tf-stage { color: #60a5fa; font-size: 9px; font-weight: 600; }

    /* ── PITCH ── */
    .pitch {
      background: #111827; border-radius: 12px; padding: 6px 4px 2px;
      position: relative; overflow: hidden; flex: 1; min-height: 0;
      display: flex; flex-direction: column; justify-content: space-evenly;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .pitch-markings { position: absolute; inset: 0; pointer-events: none; }
    .pm { position: absolute; }
    .halfway       { top: 48%; left: 5%; right: 5%; height: 1px; background: rgba(196,230,60,0.4); }
    .center-circle { top: 48%; left: 50%; width: 66px; height: 66px; border: 1px solid rgba(196,230,60,0.3); border-radius: 50%; transform: translate(-50%,-50%); }
    .penalty-top   { top: 0; left: 50%; width: 140px; height: 58px; border: 1px solid rgba(196,230,60,0.3); border-top: none; transform: translateX(-50%); }
    .penalty-bot   { bottom: 0; left: 50%; width: 140px; height: 58px; border: 1px solid rgba(196,230,60,0.3); border-bottom: none; transform: translateX(-50%); }
    .goal-top      { top: 0; left: 50%; width: 52px; height: 16px; border: 1px solid rgba(196,230,60,0.3); border-top: none; transform: translateX(-50%); }
    .goal-bot      { bottom: 0; left: 50%; width: 52px; height: 16px; border: 1px solid rgba(196,230,60,0.3); border-bottom: none; transform: translateX(-50%); }

    /* Pitch rows */
    .pitch-row { display: flex; justify-content: center; align-items: center; gap: 4px; flex: 1; min-height: 0; position: relative; z-index: 1; }

    /* Bench strip */
    .bench-strip { background: rgba(0,0,0,0.35); border-top: 1px dashed rgba(255,255,255,0.15); flex-shrink: 0; padding: 4px 4px 4px; }
    .bench-strip-label { text-align: center; color: rgba(255,255,255,0.35); font-size: 8px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 3px; }
    .bench-strip-slots { display: flex; justify-content: center; gap: 6px; }

    /* Slot wrapper */
    .p-slot { display: flex; flex-direction: column; align-items: center; cursor: pointer; width: 72px; flex-shrink: 0; position: relative; }
    .p-slot.is-bench .p-card { opacity: 0.85; }
    .p-slot.is-bench:hover .p-card { opacity: 1; }
    .p-slot.p-active .p-card { outline: 2px solid #fff; outline-offset: 1px; }
    .p-slot.is-swap-target { cursor: pointer; }
    .p-slot.is-swap-target .p-card { outline: 2px solid #f59e0b; outline-offset: 1px; box-shadow: 0 0 8px rgba(245,158,11,0.5); }
    .swap-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 10; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #f59e0b; pointer-events: none; animation: swap-pulse 0.8s ease-in-out infinite alternate; }
    @keyframes swap-pulse { from { opacity: 0.6; } to { opacity: 1; } }

    /* ── FIFA-style CARD ── */
    .p-card {
      width: 68px;
      background: #1e2433;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      display: flex; flex-direction: column; align-items: center;
      padding: 0 0 3px;
      overflow: hidden;
      position: relative;
    }
    .p-card-empty {
      background: rgba(255,255,255,0.05);
      border: 1px dashed rgba(255,255,255,0.2);
      justify-content: center; padding: 4px 0;
    }
    .p-card-bench {
      background: #141824;
      border-color: rgba(255,255,255,0.08);
      opacity: 0.82;
    }

    /* ── Eliminated player card ── */
    .p-card-eliminated {
      border-color: #ef4444 !important;
      box-shadow: 0 0 0 1px rgba(239,68,68,0.6), 0 0 8px rgba(239,68,68,0.3);
    }
    .p-card-eliminated .p-name-bar { color: #fca5a5; }
    .p-card-eliminated .p-price-bar { background: #7f1d1d !important; }
    .elim-overlay {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(127,29,29,0.72);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      z-index: 5; border-radius: 5px; gap: 1px;
      pointer-events: none;
    }
    .elim-skull { font-size: 14px; line-height: 1; }
    .elim-text {
      font-size: 7px; font-weight: 900; letter-spacing: 1.5px;
      color: #fca5a5; text-transform: uppercase;
    }

    /* Header eliminated warning */
    .hb-elim-warn {
      display: flex; align-items: center; gap: 5px;
      background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px;
      padding: 5px 10px; color: #fca5a5; font-size: 11px; font-weight: 700;
    }
    .hb-elim-icon { font-size: 13px; }

    .bench-badge {
      position: absolute; top: 2px; left: 50%; transform: translateX(-50%);
      font-size: 6px; font-weight: 900; letter-spacing: 1px;
      color: #6b7280; background: rgba(0,0,0,0.4);
      padding: 1px 4px; border-radius: 3px; z-index: 3; white-space: nowrap;
    }

    /* Icon row at top of card */
    .p-card-icons {
      width: 100%; display: flex; justify-content: space-between; align-items: center;
      padding: 2px 3px 0; position: absolute; top: 0; left: 0; right: 0; z-index: 2;
    }
    .icon-btn { background: none; border: none; padding: 0; cursor: pointer; line-height: 1; }
    .icon-circle {
      width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; line-height: 1;
    }
    .minus-circle { border-color: #f87171; color: #f87171; background: rgba(239,68,68,0.15); }
    .minus-circle:hover { background: rgba(239,68,68,0.35); }

    .cap-badges { display: flex; gap: 2px; }
    .cap-icon {
      width: 14px; height: 14px; border-radius: 50%;
      font-size: 7px; font-weight: 900;
      display: flex; align-items: center; justify-content: center;
    }
    .c-icon  { background: #f59e0b; color: #000; }
    .vc-icon { background: #7c3aed; color: #fff; }

    /* Avatar silhouette */
    .p-avatar {
      width: 42px; height: 42px; border-radius: 50%;
      background: #2a2d3e; border: 2px solid rgba(255,255,255,0.15);
      position: relative; overflow: hidden; margin-top: 14px; flex-shrink: 0;
    }
    .p-avatar::before { content: ''; position: absolute; top: 7px; left: 50%; transform: translateX(-50%); width: 12px; height: 12px; background: rgba(255,255,255,0.7); border-radius: 50%; }
    .p-avatar::after  { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 24px; height: 14px; background: rgba(255,255,255,0.7); border-radius: 12px 12px 0 0; }
    .filled-av { background: #1a1d2e; border-color: var(--pc, rgba(255,255,255,0.25)); border-width: 2px; }
    .filled-av::before { background: rgba(255,255,255,0.9); }
    .filled-av::after  { background: rgba(255,255,255,0.9); }
    .empty-av { background: rgba(255,255,255,0.06); border: 1.5px dashed rgba(255,255,255,0.2); margin-top: 4px; }
    .empty-av::before, .empty-av::after { display: none; }
    .bench-av { background: rgba(255,255,255,0.03); }
    .p-plus-icon { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); color: rgba(255,255,255,0.4); font-size: 18px; font-weight: 200; }

    /* Name and price bars */
    .p-name-bar {
      width: 100%; text-align: center; color: #f3f4f6;
      font-size: 8.5px; font-weight: 700; padding: 2px 2px 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .dim-bar { color: rgba(255,255,255,0.35); font-size: 8px; padding: 6px 0; }
    .p-price-bar {
      width: calc(100% - 8px); text-align: center; color: #fff;
      font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 3px;
      margin-top: 2px; letter-spacing: .3px;
    }

    /* Action menu */
    .action-menu { background: #111827; border-top: 2px solid #1d4ed8; padding: 7px 10px; border-radius: 0 0 10px 10px; flex-shrink: 0; }
    .am-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .am-dot { width: 34px; height: 34px; border-radius: 7px; flex-shrink: 0; color: #fff; font-size: 9px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
    .am-info { flex: 1; }
    .am-name { color: #fff; font-size: 12px; font-weight: 700; }
    .am-meta { color: #6b7280; font-size: 10px; }
    .am-close { background: none; border: 1px solid #374151; color: #9ca3af; width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 11px; }
    .am-swap-hint { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 6px; padding: 5px 10px; margin-bottom: 6px; text-align: center; }
    .am-hint-text { color: #fbbf24; font-size: 11px; font-weight: 600; }
    .am-actions { display: flex; gap: 6px; }
    .am-btn { flex: 1; padding: 6px 4px; border-radius: 6px; border: none; font-size: 11px; font-weight: 800; cursor: pointer; }
    .am-remove { background: #1f2937; color: #f87171; }
    .am-cap    { background: #1f2937; color: #fbbf24; }
    .am-cap.am-sel { background: #f59e0b; color: #000; }
    .am-vc     { background: #1f2937; color: #c4b5fd; }
    .am-vc.am-sel  { background: #7c3aed; color: #fff; }

    /* Toolbar */
    .pitch-toolbar { display: flex; align-items: center; gap: 6px; padding: 5px 4px; background: rgba(0,0,0,0.3); flex-shrink: 0; }
    .cap-tags { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .cap-tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 115px; }
    .c-tag { background: rgba(245,158,11,.15); color: #fbbf24; border: 1px solid rgba(245,158,11,.3); }
    .v-tag { background: rgba(124,58,237,.2); color: #c4b5fd; border: 1px solid rgba(124,58,237,.4); }
    .pitch-display-select { position: absolute; top: 8px; right: 8px; z-index: 5; background: #1d4ed8; color: #fff; border: 2px solid #3b82f6; border-radius: 8px; padding: 5px 12px; font-size: 12px; font-weight: 800; cursor: pointer; outline: none; letter-spacing: .5px; }
    .pitch-display-select option { background: #1e2433; }
    .formation-select { background: #1f2937; color: #fff; border: 1px solid #374151; border-radius: 8px; padding: 5px 10px; font-size: 12px; font-weight: 800; cursor: pointer; outline: none; letter-spacing: .5px; }
    .formation-select:focus { border-color: #3b82f6; }
    .autopick-btn { background: #d4e600; color: #000; border: none; border-radius: 20px; padding: 7px 16px; font-size: 13px; font-weight: 900; cursor: pointer; letter-spacing: .5px; white-space: nowrap; transition: opacity .2s; }
    .autopick-btn:hover { opacity: .9; }
    .autopick-btn.picking { animation: pulse-scale .6s ease-in-out; }
    @keyframes pulse-scale { 0%,100%{transform:scale(1)} 50%{transform:scale(0.95)} }
    .clear-btn { background: rgba(0,0,0,.3); color: #fca5a5; border: 1px solid rgba(248,113,113,.2); border-radius: 8px; padding: 6px 10px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }

    /* Save */
    .save-row { padding: 5px 4px; flex-shrink: 0; }
    .window-closed-bar { background: #2d0a0a; color: #fca5a5; border: 1px solid #7f1d1d; border-radius: 6px; padding: 5px 10px; font-size: 11px; font-weight: 700; text-align: center; margin-bottom: 5px; }
    .save-btn { width: 100%; padding: 10px; background: #0d0d0d; color: #fff; border: 1px solid #333; border-radius: 8px; font-size: 13px; font-weight: 800; cursor: pointer; transition: all .15s; }
    .save-btn:not(:disabled):hover { background: #1a1a1a; border-color: #555; }
    .save-btn:disabled { opacity: .4; cursor: not-allowed; }
    .msg-bar { padding: 6px 10px; font-size: 11px; font-weight: 600; text-align: center; border-radius: 6px; margin: 0 4px; flex-shrink: 0; }
    .msg-ok  { background: #052e16; color: #86efac; }
    .msg-err { background: #450a0a; color: #fca5a5; }

    /* Key */
    .key-bar { display: flex; align-items: center; gap: 8px; padding: 5px 6px; background: rgba(0,0,0,.3); border-top: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; flex-wrap: wrap; }
    .key-title { color: rgba(255,255,255,.8); font-size: 10px; font-weight: 800; letter-spacing: .5px; flex-shrink: 0; }
    .key-items { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .key-item { display: flex; align-items: center; gap: 4px; color: rgba(255,255,255,.7); font-size: 9.5px; font-weight: 500; }
    .ki-btn { width: 15px; height: 15px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; border: 1.5px solid; }
    .ki-rem { border-color: #f87171; color: #f87171; }
    .ki-cap { width: 15px; height: 15px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 7px; font-weight: 900; color: #fff; flex-shrink: 0; }
    .c-cap  { background: #f59e0b; color: #000; }
    .vc-cap { background: #7c3aed; }
    .ki-dim { color: rgba(255,255,255,.35); font-size: 11px; }

    /* ── PLAYER POOL ── */
    .pool-col { width: 370px; flex-shrink: 0; min-height: 0; background: #0d0d0d; border-left: 1px solid #1f2937; display: flex; flex-direction: column; overflow: hidden; }
    .pool-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px 8px; border-bottom: 1px solid #1f2937; flex-shrink: 0; }
    .pool-title { color: #fff; font-size: 13px; font-weight: 900; letter-spacing: 1px; }
    .pool-reset { background: none; border: 1px solid #374151; color: #6b7280; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; }
    .pos-tabs { display: flex; border-bottom: 1px solid #1f2937; background: #080808; flex-shrink: 0; }
    .pos-tab { flex: 1; padding: 8px 0; background: none; border: none; border-bottom: 3px solid transparent; color: #6b7280; font-size: 10px; font-weight: 800; cursor: pointer; transition: all .15s; text-transform: uppercase; letter-spacing: .5px; line-height: 1.2; }
    .pos-tab.tab-active { color: var(--tc, #fff); border-bottom-color: var(--tc, #fff); }
    .pos-tab:hover:not(.tab-active) { color: #9ca3af; }
    .pos-count { font-size: 9px; opacity: .7; display: block; }
    .pool-controls { display: flex; gap: 6px; padding: 8px 10px; border-bottom: 1px solid #1f2937; flex-shrink: 0; }
    .pool-search { flex: 1; background: #111827; color: #fff; border: 1px solid #374151; border-radius: 6px; padding: 6px 10px; font-size: 11px; outline: none; }
    .pool-search::placeholder { color: #4b5563; }
    .pool-search:focus { border-color: #1d4ed8; }

    /* Custom sort dropdown */
    .sort-dropdown { position: relative; flex-shrink: 0; }
    .sort-trigger {
      background: #374151; color: #fff; border: none; border-radius: 6px;
      padding: 6px 10px; font-size: 11px; font-weight: 700;
      cursor: pointer; display: flex; align-items: center; gap: 8px;
      min-width: 100px; white-space: nowrap;
    }
    .sort-trigger:hover { background: #4b5563; }
    .sort-chevron { font-size: 9px; color: #9ca3af; }
    .sort-menu {
      position: absolute; top: calc(100% + 4px); right: 0;
      background: #1f2937; border: 1px solid #374151; border-radius: 8px;
      min-width: 130px; z-index: 100; overflow: hidden;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    .sort-option {
      padding: 10px 14px; color: #d1d5db; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: background .1s;
    }
    .sort-option:hover { background: #374151; color: #fff; }
    .sort-option.active { color: #fff; font-weight: 800; background: #111827; }
    .sort-dropdown.open .sort-trigger { background: #4b5563; }

    .pool-col-hdr { display: flex; align-items: center; padding: 5px 12px; background: #080808; border-bottom: 1px solid #1f2937; flex-shrink: 0; gap: 4px; }
    .pch-player { flex: 1; color: #6b7280; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
    .pch-sort-btn { background: none; border: none; cursor: pointer; color: #6b7280; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; padding: 3px 6px; border-radius: 4px; white-space: nowrap; transition: all .15s; }
    .pch-sort-btn:hover { color: #d1d5db; background: #111827; }
    .pch-sort-btn.pch-active { color: #fff; background: #1d4ed8; }
    .pch-player-btn { flex: 1; text-align: left; }
    .pch-action { color: #6b7280; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; min-width: 32px; text-align: center; }
    .pool-list { flex: 1; min-height: 0; overflow-y: auto; }
    .pool-list::-webkit-scrollbar { width: 4px; }
    .pool-list::-webkit-scrollbar-track { background: #0d0d0d; }
    .pool-list::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }
    .pool-empty { padding: 20px; text-align: center; color: #4b5563; font-size: 12px; }
    .pool-row { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid #111827; cursor: pointer; transition: background .1s; }
    .pool-row:hover { background: #111827; }
    .pool-row.is-picked { background: #0a1628; }
    .pool-row.pos-mismatch { opacity: .3; pointer-events: none; }
    .pr-pos-badge { width: 34px; height: 34px; border-radius: 6px; color: #fff; font-size: 8.5px; font-weight: 900; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .pr-info { flex: 1; min-width: 0; }
    .pr-name { color: #f3f4f6; font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pr-meta { color: #6b7280; font-size: 9px; }
    .pr-price { color: #34d399; font-size: 11px; font-weight: 700; white-space: nowrap; min-width: 52px; text-align: right; flex-shrink: 0; }
    .pr-pts   { color: #9ca3af; font-size: 11px; font-weight: 700; white-space: nowrap; min-width: 38px; text-align: right; flex-shrink: 0; }
    .pr-col-active { color: #fff; }
    .pr-circ-btn { width: 30px; height: 30px; border-radius: 50%; border: 2px solid; background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; font-size: 18px; font-weight: 300; line-height: 1; transition: all .15s; margin-left: 4px; }
    .pr-add-btn { border-color: #6b7280; color: #d1d5db; }
    .pr-add-btn:hover:not(:disabled) { border-color: #fff; color: #fff; background: rgba(255,255,255,0.08); }
    .pr-add-btn:disabled { opacity: .25; cursor: not-allowed; }
    .pr-rem-btn { border-color: #ef4444; color: #ef4444; }
    .pr-rem-btn:hover { border-color: #fca5a5; color: #fca5a5; background: rgba(239,68,68,0.1); }
    .pr-sub-btn { border-color: #f59e0b; color: #f59e0b; font-size: 14px; }
    .pr-sub-btn:hover { border-color: #fcd34d; color: #fcd34d; background: rgba(245,158,11,0.12); }

    /* ── View Team bar (pool footer, mobile only) ── */
    .view-team-bar { display: none; }

    /* ── RESPONSIVE ── */
    @media (max-width: 768px) {
      .page-wrap { top: 56px; }

      /* Default mobile: pitch fills full screen, pool hidden */
      .body-row { flex-direction: column; overflow-y: auto; overflow-x: hidden; }
      .pitch-col { flex: none; padding: 4px 8px 0; overflow: visible; }
      .pool-col  { display: none; border-left: none; border-top: none; }

      /* When pool view active: hide pitch, show pool full-screen */
      .body-row.mobile-show-pool .pitch-col { display: none; }
      .body-row.mobile-show-pool .pool-col  {
        display: flex; width: 100%; flex: 1; min-height: 0;
        border-top: 2px solid #1f2937;
      }

      /* View Team button */
      .view-team-bar {
        display: flex; flex-shrink: 0;
        padding: 8px 12px; background: #0d0d0d; border-top: 1px solid #1f2937;
      }
      .view-team-btn {
        width: 100%; padding: 12px;
        background: #1d4ed8; color: #fff; border: none; border-radius: 8px;
        font-size: 14px; font-weight: 800; cursor: pointer;
      }

      /* Compact header */
      .hb-brand { display: none; }
      .hb-deadline { margin-left: 0; }
      .hb-pill { min-width: 54px; padding: 5px 8px; }
      .hb-pill-val { font-size: 14px; }
      .cap-tags { display: none; }
      .pitch-toolbar { gap: 4px; }
      .key-items { gap: 6px; }
    }

    /* ── Formation Change Dialog ──────────────────────────────────────────── */
    .fm-backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
    }
    .fm-dialog {
      background: #fff; border-radius: 16px;
      width: 100%; max-width: 480px;
      max-height: 88vh; display: flex; flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 64px rgba(0,0,0,0.35);
    }
    .fm-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 16px 20px 12px;
      border-bottom: 1px solid #e0e0e0;
      gap: 12px;
    }
    .fm-header-left { display: flex; flex-direction: column; gap: 8px; }
    .fm-title { font-size: 17px; font-weight: 700; color: #1a237e; line-height: 1; }
    .fm-formation-row { display: flex; align-items: center; gap: 10px; }
    .fm-badge { font-size: 15px; font-weight: 800; padding: 4px 14px; border-radius: 20px; letter-spacing: 1px; }
    .fm-badge-old { background: #eeeeee; color: #555; }
    .fm-badge-new { background: #1a237e; color: #fff; }
    .fm-arrow { font-size: 18px; color: #9e9e9e; }
    .fm-close-btn {
      background: none; border: none; font-size: 18px; color: #9e9e9e;
      cursor: pointer; padding: 0 4px; line-height: 1; flex-shrink: 0;
    }
    .fm-close-btn:hover { color: #333; }

    .fm-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 16px; }

    .fm-section { display: flex; flex-direction: column; gap: 10px; }
    .fm-section-title {
      font-size: 13px; font-weight: 600; color: #333;
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    }
    .fm-pos-pill {
      font-size: 10px; font-weight: 800; color: #fff;
      padding: 2px 8px; border-radius: 10px; flex-shrink: 0;
    }
    .fm-section-conflict { background: #fff8e1; border: 1px solid #ffe082; border-radius: 12px; padding: 14px; }
    .fm-section-warn     { background: #fff3e0; border: 1px solid #ffcc80; border-radius: 12px; padding: 14px; }

    .fm-drop-info {
      font-size: 12px; color: #555;
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    }
    .fm-drop-counter {
      margin-left: auto; font-size: 11px; font-weight: 700;
      background: #ffcdd2; color: #c62828;
      padding: 2px 8px; border-radius: 10px;
    }
    .fm-drop-counter.fm-drop-done { background: #c8e6c9; color: #2e7d32; }

    .fm-pos-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

    .fm-candidates { display: flex; flex-direction: column; gap: 6px; }
    .fm-candidate-btn {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 14px; border-radius: 10px;
      border: 2px solid #e0e0e0; background: #fff;
      cursor: pointer; transition: border-color 0.15s, background 0.15s;
      text-align: left; width: 100%;
    }
    .fm-candidate-btn:hover:not(:disabled) { border-color: #90caf9; background: #f5f9ff; }
    .fm-cand-selected { border-color: #ef4444 !important; background: #fff5f5 !important; }
    .fm-cand-disabled { opacity: .35; cursor: not-allowed; }
    .fm-cand-name { flex: 1; font-size: 13px; font-weight: 600; color: #212121; text-align: left; }
    .fm-cand-tag  { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #e8eaf6; color: #3949ab; }
    .bench-tag    { background: #fff3e0; color: #e65100; }
    .fm-cand-drop-label { font-size: 10px; font-weight: 800; color: #ef4444; background: #ffebee; padding: 2px 8px; border-radius: 4px; white-space: nowrap; }
    .fm-bench-move-label { color: #1565c0; background: #e3f2fd; }

    .fm-bench-move-section { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #bbb; }
    .fm-bench-move-title { margin-bottom: 8px; }
    .fm-candidate-bench-move { border-color: #90caf9; }
    .fm-candidate-bench-move.fm-cand-selected { background: #e3f2fd; border-color: #1565c0; }

    .fm-empty-row {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: #555; padding: 4px 0;
    }
    .fm-transfer-badge {
      margin-left: auto; font-size: 11px; font-weight: 700;
      background: #ef4444; color: #fff; padding: 2px 8px; border-radius: 10px;
    }

    .fm-actions {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 14px 20px;
      border-top: 1px solid #e0e0e0;
    }
    .fm-btn { padding: 9px 22px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; border: none; }
    .fm-btn-cancel  { background: #f5f5f5; color: #555; }
    .fm-btn-cancel:hover  { background: #eeeeee; }
    .fm-btn-confirm { background: #1a237e; color: #fff; }
    .fm-btn-confirm:hover:not(:disabled) { background: #283593; }
    .fm-btn-confirm:disabled { opacity: .45; cursor: not-allowed; }
    .fm-btn-restore { background: #c62828; color: #fff; }
    .fm-btn-restore:hover { background: #b71c1c; }

    .fm-info-note {
      background: #e3f2fd; border: 1px solid #90caf9; border-radius: 10px;
      padding: 10px 14px; font-size: 12px; color: #1565c0; line-height: 1.5;
    }

    .fm-dialog-sm { max-width: 400px; }
    .fm-restore-body { align-items: center; text-align: center; padding: 20px 16px; gap: 12px; }
    .fm-restore-icon { font-size: 32px; line-height: 1; color: #c62828; }
    .fm-restore-msg { margin: 0; font-size: 14px; color: #212121; line-height: 1.5; }
    .fm-restore-sub { margin: 0; font-size: 12px; color: #757575; line-height: 1.5; }

    /* ── Formation Dialog — Mobile (bottom sheet) ─────────────────────────── */
    @media (max-width: 600px) {
      .fm-backdrop {
        align-items: flex-end;
        padding: 0;
      }
      .fm-dialog {
        max-width: 100%;
        max-height: 92vh;
        border-radius: 20px 20px 0 0;
        /* Subtle drag handle */
      }
      .fm-dialog::before {
        content: '';
        display: block;
        width: 36px; height: 4px;
        background: #ddd;
        border-radius: 2px;
        margin: 10px auto 0;
        flex-shrink: 0;
      }
      .fm-header {
        padding: 10px 16px 10px;
      }
      .fm-title { font-size: 15px; }
      .fm-badge { font-size: 13px; padding: 3px 10px; }
      .fm-close-btn { font-size: 16px; padding: 4px; }

      .fm-body { padding: 12px 14px; gap: 12px; }

      .fm-section-conflict,
      .fm-section-warn { padding: 10px 12px; }

      .fm-section-title { font-size: 12px; }
      .fm-pos-pill { font-size: 10px; padding: 2px 7px; }

      .fm-drop-info { font-size: 11px; gap: 4px; }
      .fm-drop-counter { font-size: 10px; padding: 2px 6px; }

      .fm-candidates { gap: 5px; }
      .fm-candidate-btn { padding: 9px 10px; gap: 6px; }
      .fm-cand-name { font-size: 12px; }
      .fm-cand-tag { font-size: 9px; padding: 2px 5px; }
      .fm-cand-drop-label { font-size: 9px; padding: 2px 6px; }

      .fm-empty-row { font-size: 12px; }
      .fm-transfer-badge { font-size: 10px; padding: 2px 6px; }

      .fm-actions {
        padding: 12px 14px;
        flex-direction: column-reverse;
        gap: 8px;
      }
      .fm-btn {
        width: 100%;
        padding: 13px;
        font-size: 15px;
        border-radius: 10px;
        text-align: center;
      }
    }
  `]
})
export class MyTeamComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);

  readonly BENCH_ROW  = BENCH_ROW;
  readonly FORMATIONS = Object.keys(FORMATIONS);
  readonly POS_LIST   = ['GK', 'DEF', 'MID', 'FWD'];

  allPlayers     = signal<Player[]>([]);
  poolLoading    = signal(true);
  existingTeam   = signal<UserTeam | null>(null);
  nextMatch      = signal<Match | null>(null);
  transferRecord = signal<UserTransferRecord | null>(null);
  roundConfigs        = signal<RoundConfig[]>([]);
  activeRoundConfig   = signal<RoundConfig | null>(null);

  starterSlots = signal<(number | null)[]>(Array(11).fill(null));
  benchSlots   = signal<(number | null)[]>(Array(4).fill(null));
  captainId    = signal<number | null>(null);
  vcId         = signal<number | null>(null);

  activeSlot     = signal<{ type: 'xi' | 'bench'; i: number; pos: string } | null>(null);
  poolPos        = signal('GK');
  poolSearch     = signal('');
  sortBy         = signal('price_desc');
  autoPicking    = signal(false);
  formation         = signal('4-4-2');
  selectedFormation = signal('4-4-2'); // tracks dropdown display; reverts on cancel
  pitchDisplay   = signal<'price' | 'pts'>('price');
  message        = signal('');
  msgOk          = signal(true);
  mobileView     = signal<'pitch' | 'pool'>('pitch');

  pitchRows = computed(() => buildRows(this.formation()));

  private originalSquadIds = new Set<number>();

  // ── Computed ──────────────────────────────────────────────────────────────

  starterIds   = computed(() => new Set(this.starterSlots().filter((id): id is number => id !== null)));
  benchIdsArr  = computed(() => this.benchSlots().filter((id): id is number => id !== null));
  allPickedIds = computed(() => new Set([...this.starterIds(), ...this.benchIdsArr()]));
  pickedCount  = computed(() => this.allPickedIds().size);
  xiCount      = computed(() => this.starterIds().size);
  benchCount   = computed(() => this.benchIdsArr().length);

  remainingBudget = computed(() => {
    const used = [...this.allPickedIds()].reduce((sum, id) => {
      const p = this.allPlayers().find(x => x.id === id);
      return sum + (p?.price ?? 6_000_000);
    }, 0);
    return BUDGET - used;
  });

  captainName = computed(() => {
    const id = this.captainId();
    return id ? (this.allPlayers().find(p => p.id === id)?.name ?? null) : null;
  });

  vcName = computed(() => {
    const id = this.vcId();
    return id ? (this.allPlayers().find(p => p.id === id)?.name ?? null) : null;
  });

  // Server-authoritative stage from roundStart.
  // Falls back to 'GROUP' (unlimited) — next match being R32 doesn't mean R32 rules are active yet.
  currentStage  = computed(() =>
    this.activeRoundConfig()?.stage ?? 'GROUP'
  );
  currentConfig = computed(() =>
    this.activeRoundConfig() ?? this.roundConfigs().find(c => c.stage === this.currentStage()) ?? null
  );

  freeTransfersForStage = computed(() => {
    const c = this.currentConfig();
    const v = c ? c.freeTransfers : (DEFAULT_FREE_TRANSFERS[this.currentStage()] ?? 2);
    return v >= 100 ? Infinity : v;
  });
  isUnlimitedStage = computed(() => this.freeTransfersForStage() === Infinity);

  countryLimitForStage = computed(() => {
    const c = this.currentConfig();
    return c ? c.countryLimit : (DEFAULT_COUNTRY_LIMIT[this.currentStage()] ?? 3);
  });

  deadlineLabel = computed(() => {
    const m = this.nextMatch();
    if (!m) return 'TBD';
    return new Date(m.matchTime).toLocaleDateString('en-US', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  });

  pendingTransfers = computed(() => {
    if (!this.existingTeam()) return 0;
    // Only count players new to the squad (not in the original saved 15) — swaps within the 15 are free
    return [...this.allPickedIds()].filter(id => !this.originalSquadIds.has(id)).length;
  });

  hasSubstitutionChanges = computed(() => {
    if (!this.existingTeam()) return false;
    if (this.pendingTransfers() > 0) return false;
    // Check if XI/bench order changed vs original (same 15, different split)
    const origStarters = new Set(this.existingTeam()!.starters.map((p: Player) => p.id));
    return [...this.starterIds()].some(id => !origStarters.has(id));
  });

  hasTeamChanges = computed(() => {
    const saved = this.existingTeam();
    if (!saved) return true; // new team — always saveable
    if (this.pendingTransfers() > 0) return true;
    if (this.hasSubstitutionChanges()) return true;
    if (this.formation() !== (saved.formation ?? '4-4-2')) return true;
    if (this.captainId() !== (saved.captain?.id ?? null)) return true;
    if (this.vcId() !== (saved.viceCaptain?.id ?? null)) return true;
    return false;
  });

  stageLabel = computed(() => STAGE_LABEL[this.currentStage()] ?? this.currentStage());

  saveButtonLabel = computed(() => {
    if (!this.existingTeam()) return 'Save My Team';
    if (this.hasSubstitutionChanges()) return 'Confirm Substitution';
    if (this.pendingTransfers() > 0) return 'Confirm Transfers';
    return 'Confirm Transfers';
  });

  transfersRemaining = computed(() => {
    if (this.isUnlimitedStage()) return Infinity;
    return Math.max(0, this.freeTransfersForStage() - (this.transferRecord()?.transfersMade ?? 0));
  });

  transferPenalty = computed(() => {
    const free             = this.freeTransfersForStage();
    const dbMade           = this.transferRecord()?.transfersMade ?? 0;
    const alreadyPenalised = Math.max(0, dbMade - free);
    const nowPenalised     = Math.max(0, dbMade + this.pendingTransfers() - free);
    return (nowPenalised - alreadyPenalised) * 3;
  });

  showActionMenu = computed(() => {
    const s = this.activeSlot();
    if (!s) return false;
    const id = s.type === 'xi' ? this.starterSlots()[s.i] : this.benchSlots()[s.i];
    return id !== null;
  });

  activePlayer = computed((): Player | null => {
    const s = this.activeSlot();
    if (!s) return null;
    const id = s.type === 'xi' ? this.starterSlots()[s.i] : this.benchSlots()[s.i];
    return id !== null ? (this.allPlayers().find(p => p.id === id) ?? null) : null;
  });


  filteredPool = computed(() => {
    const pos  = this.poolPos();
    const q    = this.poolSearch().toLowerCase().trim();
    let list   = this.allPlayers().filter(p => p.position === pos && !p.team?.eliminated);
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.team.name.toLowerCase().includes(q));
    const sort = this.sortBy();
    list = [...list]; // avoid mutating source
    if      (sort === 'price_desc') list.sort((a, b) => b.price - a.price);
    else if (sort === 'price_asc')  list.sort((a, b) => a.price - b.price);
    else if (sort === 'pts_desc')   list.sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0));
    else if (sort === 'pts_asc')    list.sort((a, b) => (a.totalPoints ?? 0) - (b.totalPoints ?? 0));
    else if (sort === 'name_asc')   list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'name_desc')  list.sort((a, b) => b.name.localeCompare(a.name));
    return list;
  });

  eliminatedPlayerIds = computed(() => {
    const ids = new Set<number>();
    this.allPlayers().forEach(p => { if (p.team?.eliminated) ids.add(p.id); });
    return ids;
  });

  squadEliminatedCount = computed(() => {
    const elim = this.eliminatedPlayerIds();
    return [...this.allPickedIds()].filter(id => elim.has(id)).length;
  });

  windowOpen = computed(() => {
    const c = this.currentConfig();
    const openHour  = c?.windowOpenHour  ?? 12;
    const closeHour = c?.windowCloseHour ?? 19;
    const tz        = c?.windowTimezone  ?? 'Asia/Kolkata';
    try {
      const hour = new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: tz });
      const h = parseInt(hour, 10);
      return h >= openHour && h < closeHour;
    } catch {
      // Fallback to IST offset if Intl timezone lookup fails
      const now = new Date();
      const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
      const h = new Date(utcMs + 5.5 * 3600 * 1000).getHours();
      return h >= openHour && h < closeHour;
    }
  });

  canSave = computed(() =>
    this.starterIds().size === 11 && this.benchIdsArr().length === 4 &&
    !!this.captainId() && !!this.vcId() && this.remainingBudget() >= 0 &&
    this.windowOpen() && this.hasTeamChanges()
  );

  // ── Init ──────────────────────────────────────────────────────────────────

  ngOnInit() {
    this.api.getRoundConfigs().subscribe({
      next: configs => this.roundConfigs.set(configs),
      error: () => {}
    });
    this.api.getActiveRoundConfig().subscribe({
      next: active => this.activeRoundConfig.set(active),
      error: () => {}
    });

    this.api.getAllPlayers().subscribe({
      next: players => {
        this.api.getPlayerPoints().subscribe({
          next: pts => {
            players.forEach(p => p.totalPoints = pts[p.id] ?? 0);
            this.allPlayers.set(players.sort((a, b) => b.price - a.price));
          },
          error: () => this.allPlayers.set(players.sort((a, b) => b.price - a.price))
        });
        this.poolLoading.set(false);
      },
      error: () => this.poolLoading.set(false)
    });

    this.api.getMatches().subscribe(matches => {
      const upcoming = matches.filter(m => m.status === 'UPCOMING' && m.stage !== 'GROUP')
        .sort((a, b) => new Date(a.matchTime).getTime() - new Date(b.matchTime).getTime());
      this.nextMatch.set(upcoming[0] ?? null);
      const userId = this.auth.getUserId();
      if (userId) {
        this.api.getTransferRecord(+userId, this.currentStage()).subscribe({ next: rec => this.transferRecord.set(rec), error: () => {} });
      }
    });

    const userId = this.auth.getUserId();
    if (userId) {
      this.api.getMyTeam(+userId).subscribe({
        next: team => { if (!team) return; this.existingTeam.set(team); this.loadTeamIntoSlots(team); },
        error: () => {}
      });
    }
  }

  private loadTeamIntoSlots(team: UserTeam) {
    // Restore formation first so pitchRows is correct before slots are set
    if (team.formation && FORMATIONS[team.formation]) {
      this.formation.set(team.formation);
      this.selectedFormation.set(team.formation);
    }
    // starters and bench are returned in slot_order from the backend — map directly by index
    const xi: (number | null)[] = [...team.starters.map((p: Player) => p.id), ...Array(11).fill(null)].slice(0, 11);
    const bn: (number | null)[] = [...team.bench.map((p: Player) => p.id),    ...Array(4).fill(null)].slice(0, 4);

    this.starterSlots.set(xi);
    this.benchSlots.set(bn);
    if (team.captain)     this.captainId.set(team.captain.id);
    if (team.viceCaptain) this.vcId.set(team.viceCaptain.id);
    this.originalSquadIds = new Set([...team.starters, ...team.bench].map((p: Player) => p.id));
  }

  // ── Slot interaction ──────────────────────────────────────────────────────

  isActiveSlot(slot: SlotRef): boolean {
    const s = this.activeSlot();
    return !!s && s.type === slot.type && s.i === slot.i && s.pos === slot.pos;
  }

  isSwapTarget(slot: SlotRef): boolean {
    const s = this.activeSlot();
    if (!s || s.type === slot.type || s.pos !== slot.pos) return false;
    const targetId = slot.type === 'xi' ? this.starterSlots()[slot.i] : this.benchSlots()[slot.i];
    return targetId !== null;
  }

  tapSlot(type: 'xi' | 'bench', i: number, pos: string) {
    if (!this.windowOpen()) return;
    const cur = this.activeSlot();
    // Tap opposite-group slot of same position → free substitution swap
    if (cur && cur.type !== type && cur.pos === pos) {
      this.doSwap(cur, { type, i, pos });
      this.activeSlot.set(null);
      return;
    }
    if (cur?.type === type && cur?.i === i) { this.activeSlot.set(null); return; }
    const id = type === 'xi' ? this.starterSlots()[i] : this.benchSlots()[i];
    this.activeSlot.set({ type, i, pos });
    if (id === null) {
      this.poolPos.set(pos);
      // On mobile: empty slot tap → show pool panel
      if (window.innerWidth <= 768) this.mobileView.set('pool');
    }
  }

  openPool(pos: string) {
    this.poolPos.set(pos);
    this.mobileView.set('pool');
  }

  viewTeam() {
    this.mobileView.set('pitch');
    this.activeSlot.set(null);
  }

  private doSwap(a: SlotRef, b: SlotRef) {
    const slots = [...this.starterSlots()];
    const bench = [...this.benchSlots()];
    const getVal = (s: SlotRef) => s.type === 'xi' ? slots[s.i] : bench[s.i];
    const setVal = (s: SlotRef, v: number | null) => {
      if (s.type === 'xi') slots[s.i] = v; else bench[s.i] = v;
    };
    const va = getVal(a), vb = getVal(b);
    setVal(a, vb); setVal(b, va);
    this.starterSlots.set(slots);
    this.benchSlots.set(bench);
  }

  canSubIntoActiveSlot(p: Player): boolean {
    const s = this.activeSlot();
    if (!s || p.position !== s.pos) return false;
    if (s.type === 'xi')    return this.benchIdsArr().includes(p.id);
    if (s.type === 'bench') return this.starterIds().has(p.id);
    return false;
  }

  subPlayerIntoActiveSlot(p: Player) {
    const s = this.activeSlot();
    if (!s) return;
    const slots = [...this.starterSlots()];
    const bench = [...this.benchSlots()];
    if (s.type === 'xi') {
      const benchIdx = bench.findIndex(id => id === p.id);
      if (benchIdx === -1) return;
      bench[benchIdx] = slots[s.i];
      slots[s.i] = p.id;
    } else {
      const xiIdx = slots.findIndex(id => id === p.id);
      if (xiIdx === -1) return;
      slots[xiIdx] = bench[s.i];
      bench[s.i] = p.id;
    }
    this.starterSlots.set(slots);
    this.benchSlots.set(bench);
    this.activeSlot.set(null);
  }

  removeSlot(slot: SlotRef) {
    if (slot.type === 'xi') {
      const slots = [...this.starterSlots()]; const removed = slots[slot.i]; slots[slot.i] = null; this.starterSlots.set(slots);
      if (removed === this.captainId()) this.captainId.set(null);
      if (removed === this.vcId()) this.vcId.set(null);
    } else {
      const bench = [...this.benchSlots()]; const removed = bench[slot.i]; bench[slot.i] = null; this.benchSlots.set(bench);
      if (removed === this.captainId()) this.captainId.set(null);
      if (removed === this.vcId()) this.vcId.set(null);
    }
    this.activeSlot.set(null);
  }

  @HostListener('document:keydown.escape')
  closePanel() { this.activeSlot.set(null); }

  // ── Player pool ───────────────────────────────────────────────────────────

  addPlayerFromPool(player: Player) {
    const s = this.activeSlot();
    if (s) {
      if (player.position !== s.pos) return;
      if (s.type === 'xi') { const slots = [...this.starterSlots()]; slots[s.i] = player.id; this.starterSlots.set(slots); }
      else { const bench = [...this.benchSlots()]; bench[s.i] = player.id; this.benchSlots.set(bench); }
      this.activeSlot.set(null);
    } else {
      this.autoPlace(player);
    }
    if (!this.captainId()) this.captainId.set(player.id);
    else if (!this.vcId() && this.vcId() !== player.id) this.vcId.set(player.id);
    // On mobile return to pitch after picking a player
    if (window.innerWidth <= 768) this.mobileView.set('pitch');
  }

  private autoPlace(player: Player) {
    const pos = player.position;
    const starterRange: Record<string, number[]> = { GK: [0], DEF: [1,2,3,4], MID: [5,6,7,8], FWD: [9,10] };
    const benchIdx: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    const slots = [...this.starterSlots()];
    for (const idx of (starterRange[pos] ?? [])) {
      if (slots[idx] === null) { slots[idx] = player.id; this.starterSlots.set(slots); return; }
    }
    const bench = [...this.benchSlots()];
    const bi = benchIdx[pos];
    if (bi !== undefined && bench[bi] === null) { bench[bi] = player.id; this.benchSlots.set(bench); }
  }

  removeActive() {
    const s = this.activeSlot();
    if (!s) return;
    this.removeSlot(s);
  }

  removeById(id: number) {
    this.starterSlots.set(this.starterSlots().map(s => s === id ? null : s));
    this.benchSlots.set(this.benchSlots().map(b => b === id ? null : b));
    if (this.captainId() === id) this.captainId.set(null);
    if (this.vcId() === id) this.vcId.set(null);
  }

  setCaptain(id: number) { if (this.vcId() === id) this.vcId.set(null); this.captainId.set(id); this.activeSlot.set(null); }
  setVC(id: number)      { if (this.captainId() === id) this.captainId.set(null); this.vcId.set(id); this.activeSlot.set(null); }

  toggleSort(key: string) {
    const cur = this.sortBy();
    if (cur === key + '_desc') this.sortBy.set(key + '_asc');
    else this.sortBy.set(key + '_desc');
  }
  sortArrow(key: string): string {
    const cur = this.sortBy();
    if (cur === key + '_desc') return '▼';
    if (cur === key + '_asc')  return '▲';
    return '';
  }

  // ── Autopick ──────────────────────────────────────────────────────────────

  autoPick() {
    if (this.autoPicking()) return;
    this.autoPicking.set(true); this.activeSlot.set(null);

    const players = this.allPlayers();
    const limit   = this.countryLimitForStage();

    // Sorted pools per position: descending price, exclude eliminated teams
    const byPos: Record<string, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    players.filter(p => !p.team?.eliminated).forEach(p => byPos[p.position]?.push(p));
    Object.values(byPos).forEach(arr => arr.sort((a, b) => b.price - a.price));

    // Cheapest available price per position (fallback 5m) — used to reserve budget for unfilled slots
    const cheapest = (pos: string) =>
      byPos[pos].length ? byPos[pos][byPos[pos].length - 1].price : 5_000_000;

    const [formDef, formMid, formFwd] = FORMATIONS[this.formation()] ?? FORMATIONS['4-4-2'];
    const quota = quotaFor(this.formation()); // { GK:2, DEF: formDef+1, MID: formMid+1, FWD: formFwd+1 }

    const picked    = new Set<number>();
    const teamCount = new Map<number, number>();
    let budget      = BUDGET;

    // Remaining slots needed (decremented as we pick)
    const remaining: Record<string, number> = { GK: quota['GK'], DEF: quota['DEF'], MID: quota['MID'], FWD: quota['FWD'] };

    // Budget floor = sum of cheapest player × unfilled slots EXCLUDING the slot we're about to fill
    const minReserve = (excludePos: string) => {
      let reserve = 0;
      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        const slots = pos === excludePos ? remaining[pos] - 1 : remaining[pos];
        reserve += slots * cheapest(pos);
      }
      return reserve;
    };

    const pickN = (pos: string, needed: number): Player[] => {
      const pool   = byPos[pos];
      const result: Player[] = [];
      for (const p of pool) {
        if (result.length >= needed) break;
        if (picked.has(p.id)) continue;
        if ((teamCount.get(p.team.id) ?? 0) >= limit) continue;
        if (p.price > budget - minReserve(pos)) continue;
        result.push(p);
        picked.add(p.id);
        budget -= p.price;
        remaining[pos]--;
        teamCount.set(p.team.id, (teamCount.get(p.team.id) ?? 0) + 1);
      }
      return result;
    };

    const gks  = pickN('GK',  2);
    const defs = pickN('DEF', quota['DEF']);
    const mids = pickN('MID', quota['MID']);
    const fwds = pickN('FWD', quota['FWD']);

    // Fill XI slots: GK slot 0, then formDef DEF, formMid MID, formFwd FWD
    const newXI: (number | null)[] = Array(11).fill(null);
    if (gks[0]) newXI[0] = gks[0].id;
    defs.slice(0, formDef).forEach((p, j) => { newXI[1 + j] = p.id; });
    mids.slice(0, formMid).forEach((p, j) => { newXI[1 + formDef + j] = p.id; });
    fwds.slice(0, formFwd).forEach((p, j) => { newXI[1 + formDef + formMid + j] = p.id; });

    // Fill bench: 1 GK sub + 1 of each outfield position
    const newBn: (number | null)[] = Array(4).fill(null);
    if (gks[1])             newBn[0] = gks[1].id;
    if (defs[formDef])      newBn[1] = defs[formDef].id;
    if (mids[formMid])      newBn[2] = mids[formMid].id;
    if (fwds[formFwd])      newBn[3] = fwds[formFwd].id;

    const starters = [gks[0], ...defs.slice(0, formDef), ...mids.slice(0, formMid), ...fwds.slice(0, formFwd)]
      .filter((p): p is Player => !!p)
      .sort((a, b) => b.price - a.price);

    this.starterSlots.set(newXI);
    this.benchSlots.set(newBn);
    this.captainId.set(starters[0]?.id ?? null);
    this.vcId.set(starters[1]?.id ?? null);
    setTimeout(() => this.autoPicking.set(false), 600);
  }

  clearAll() {
    this.starterSlots.set(Array(11).fill(null)); this.benchSlots.set(Array(4).fill(null));
    this.captainId.set(null); this.vcId.set(null); this.activeSlot.set(null); this.message.set('');
  }

  // ── Formation-change dialog state ────────────────────────────────────────
  // ── Formation-change dialog state ────────────────────────────────────────
  restoreDlg = signal<{ savedFormation: string } | null>(null);

  fmDlg = signal<{
    from: string;
    to: string;
    conflicts: {
      pos: string;
      newQuota: number;
      dropCount: number;
      newXICount: number;             // XI slots for this pos in new formation
      xiCount: number;                // current XI count for this pos
      candidates: { id: number; name: string; isXI: boolean }[];
      selectedDrops: Set<number>;
      selectedBenchMoves: Set<number>; // XI players chosen to move to bench
    }[];
    emptySlots: { pos: string; count: number }[];
    restoredFromSaved: boolean; // true when unsaved state was discarded before computing diff
  } | null>(null);

  changeFormation(f: string) {
    if (!FORMATIONS[f]) return;
    if (f === this.formation()) return;

    // If user selects the already-saved formation while there are unsaved changes,
    // offer to restore the saved team rather than running the normal formation-change flow.
    const saved = this.existingTeam();
    const savedFormation = saved?.formation ?? null;
    const hasUnsaved = this.formation() !== savedFormation ||
      this.pendingTransfers() > 0 || this.hasSubstitutionChanges();

    if (saved && f === savedFormation && hasUnsaved) {
      this.restoreDlg.set({ savedFormation });
      return;
    }

    this.selectedFormation.set(f); // show selection in dropdown immediately

    // When unsaved changes exist, always base the conflict calculation on the saved
    // team — not the current in-memory state — so stacked unconfirmed formation
    // changes don't compound (e.g. saved 5-4-1 → unsaved 5-3-2 → pick 3-4-3
    // should diff 5-4-1 vs 3-4-3, not 5-3-2 vs 3-4-3).
    let restoredFromSaved = false;
    if (saved && hasUnsaved) {
      this.loadTeamIntoSlots(saved);
      this.selectedFormation.set(f); // loadTeamIntoSlots resets selectedFormation, restore it
      this.showRestoreMsg();
      restoredFromSaved = true;
    }

    const [newDef, newMid, newFwd] = FORMATIONS[f];
    const curFormation = this.formation();
    const slots  = this.starterSlots();
    const bench  = this.benchSlots();
    const name   = (id: number) => this.allPlayers().find(p => p.id === id)?.name ?? `#${id}`;

    // Collect ALL current players by position (XI + bench)
    const xiByPos:    Record<string, number[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    const benchByPos: Record<string, number[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    slots.forEach((id, i) => { if (id !== null) xiByPos[slotPos(i, curFormation)]?.push(id); });
    const benchPosMap: Record<number, string> = { 0: 'GK', 1: 'DEF', 2: 'MID', 3: 'FWD' };
    bench.forEach((id, i) => { if (id !== null) benchByPos[benchPosMap[i]]?.push(id); });

    // New quota per position (starters + 1 bench each, GK always 2)
    const newQuota: Record<string, number> = { GK: 2, DEF: newDef + 1, MID: newMid + 1, FWD: newFwd + 1 };

    // Build conflicts: positions where total held > new quota
    type FmConflict = {
      pos: string; newQuota: number; dropCount: number;
      newXICount: number; xiCount: number;
      candidates: { id: number; name: string; isXI: boolean }[];
      selectedDrops: Set<number>; selectedBenchMoves: Set<number>;
    };
    const conflicts: FmConflict[] = [];
    const newXINeed: Record<string, number> = { DEF: newDef, MID: newMid, FWD: newFwd };
    for (const pos of ['DEF', 'MID', 'FWD']) {
      const allHeld  = [...xiByPos[pos], ...benchByPos[pos]];
      const dropCount = allHeld.length - newQuota[pos];
      if (dropCount > 0) {
        conflicts.push({
          pos,
          newQuota: newQuota[pos],
          dropCount,
          newXICount: newXINeed[pos],
          xiCount: xiByPos[pos].length,
          candidates: [
            ...xiByPos[pos].map(id   => ({ id, name: name(id), isXI: true  })),
            ...benchByPos[pos].map(id => ({ id, name: name(id), isXI: false })),
          ],
          selectedDrops: new Set(),
          selectedBenchMoves: new Set(),
        });
      }
    }

    // Positions where formation needs more starters than the XI currently has
    const emptySlots: { pos: string; count: number }[] = [];
    const xiNeed: Record<string, number> = { DEF: newDef, MID: newMid, FWD: newFwd };
    for (const pos of ['DEF', 'MID', 'FWD']) {
      const gap = xiNeed[pos] - xiByPos[pos].length;
      if (gap > 0) emptySlots.push({ pos, count: gap });
    }

    if (conflicts.length === 0 && emptySlots.length === 0) {
      this.applyFormationChange(f, [], [], curFormation);
      return;
    }

    this.fmDlg.set({ from: curFormation, to: f, conflicts, emptySlots, restoredFromSaved });
  }

  fmDlgToggleDrop(conflictIdx: number, playerId: number) {
    const dlg = this.fmDlg();
    if (!dlg) return;
    const conflict = dlg.conflicts[conflictIdx];
    const drops = new Set(conflict.selectedDrops);
    if (drops.has(playerId)) {
      drops.delete(playerId);
    } else if (drops.size < conflict.dropCount) {
      drops.add(playerId);
    }
    // When drops change, bench-move selections may be stale — reset them
    const updated = {
      ...dlg,
      conflicts: dlg.conflicts.map((c, i) =>
        i === conflictIdx ? { ...c, selectedDrops: drops, selectedBenchMoves: new Set<number>() } : c
      ),
    };
    this.fmDlg.set(updated);
  }

  fmBenchMoveCountFor(conflict: { dropCount: number; newXICount: number; xiCount: number; selectedDrops: Set<number>; candidates: { id: number; isXI: boolean }[] }): number {
    const droppedXICount = [...conflict.selectedDrops].filter(
      id => conflict.candidates.find(c => c.id === id)?.isXI
    ).length;
    const remainingXI = conflict.xiCount - droppedXICount;
    return Math.max(0, remainingXI - conflict.newXICount);
  }

  fmDlgToggleBenchMove(conflictIdx: number, playerId: number) {
    const dlg = this.fmDlg();
    if (!dlg) return;
    const conflict = dlg.conflicts[conflictIdx];
    const needed = this.fmBenchMoveCountFor(conflict);
    const moves = new Set(conflict.selectedBenchMoves);
    if (moves.has(playerId)) {
      moves.delete(playerId);
    } else if (moves.size < needed) {
      moves.add(playerId);
    }
    this.fmDlg.set({
      ...dlg,
      conflicts: dlg.conflicts.map((c, i) => i === conflictIdx ? { ...c, selectedBenchMoves: moves } : c),
    });
  }

  fmDlgCanConfirm(): boolean {
    const dlg = this.fmDlg();
    if (!dlg) return false;
    return dlg.conflicts.every(c => {
      if (c.selectedDrops.size !== c.dropCount) return false;
      const needed = this.fmBenchMoveCountFor(c);
      return c.selectedBenchMoves.size === needed;
    });
  }

  fmDlgConfirm() {
    const dlg = this.fmDlg();
    if (!dlg || !this.fmDlgCanConfirm()) return;
    const droppedIds = dlg.conflicts.flatMap(c => [...c.selectedDrops]);
    const benchMoveIds = dlg.conflicts.flatMap(c => [...c.selectedBenchMoves]);
    this.fmDlg.set(null);
    this.applyFormationChange(dlg.to, droppedIds, benchMoveIds, dlg.from);
  }

  fmDlgCancel() {
    this.selectedFormation.set(this.formation()); // revert dropdown to actual formation
    this.fmDlg.set(null);
  }

  restoreDlgConfirm() {
    const saved = this.existingTeam();
    if (saved) this.loadTeamIntoSlots(saved);
    this.restoreDlg.set(null);
    this.showRestoreMsg();
  }

  private showRestoreMsg() {
    this.msgOk.set(true);
    this.message.set('Restored to your saved team — no transfers counted.');
    setTimeout(() => this.message.set(''), 3500);
  }

  restoreDlgCancel() {
    this.selectedFormation.set(this.formation()); // revert dropdown to actual formation
    this.restoreDlg.set(null);
  }

  private applyFormationChange(f: string, droppedIds: number[], benchMoveIds: number[], _prevFormation: string) {
    const [newDef, newMid, newFwd] = FORMATIONS[f];
    const curFormation = this.formation();
    const slots = this.starterSlots();
    const bench = this.benchSlots();

    // Collect XI players by position, excluding dropped and bench-moved
    const xiByPos: Record<string, number[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    slots.forEach((id, i) => {
      if (id !== null && !droppedIds.includes(id) && !benchMoveIds.includes(id))
        xiByPos[slotPos(i, curFormation)]?.push(id);
    });

    // Rebuild XI slots for new formation
    const newSlots: (number | null)[] = Array(11).fill(null);
    newSlots[0] = xiByPos['GK'][0] ?? null;
    for (let i = 0; i < newDef; i++) newSlots[1 + i]                    = xiByPos['DEF'][i] ?? null;
    for (let i = 0; i < newMid; i++) newSlots[1 + newDef + i]           = xiByPos['MID'][i] ?? null;
    for (let i = 0; i < newFwd; i++) newSlots[1 + newDef + newMid + i]  = xiByPos['FWD'][i] ?? null;

    // Rebuild bench: remove dropped, keep existing, place bench-moved players into freed slots
    const benchPosOrder = ['GK', 'DEF', 'MID', 'FWD'];
    const newBench: (number | null)[] = bench.map(id =>
      id !== null && droppedIds.includes(id) ? null : id
    );
    // Place each bench-moved player into the correct positional bench slot
    benchMoveIds.forEach(id => {
      const pos = slotPos(slots.indexOf(id), curFormation);
      const benchIdx = benchPosOrder.indexOf(pos);
      if (benchIdx >= 0) newBench[benchIdx] = id;
    });

    droppedIds.forEach(id => {
      if (this.captainId() === id) this.captainId.set(null);
      if (this.vcId()     === id) this.vcId.set(null);
    });

    this.formation.set(f);
    this.selectedFormation.set(f);
    this.starterSlots.set(newSlots);
    this.benchSlots.set(newBench);
    this.activeSlot.set(null);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  confirmSave() {
    const penalty = this.transferPenalty();
    const pending = this.pendingTransfers();
    const free    = this.transfersRemaining();
    const stage   = this.stageLabel();

    if (!this.isUnlimitedStage() && pending > 0 && penalty > 0) {
      const used   = this.transferRecord()?.transfersMade ?? 0;
      const total  = this.freeTransfersForStage();
      const overBy = pending - Math.max(0, free);
      const msg =
        `⚠️ Penalty Transfer Warning\n\n` +
        `Stage: ${stage}\n` +
        `Free transfers allowed: ${total}\n` +
        `Already used this stage: ${used}\n` +
        `Free remaining: ${free}\n` +
        `You're making: ${pending} transfer${pending > 1 ? 's' : ''}\n` +
        `Transfers beyond free limit: ${overBy}\n\n` +
        `This will cost you −${penalty} points (${overBy} × 3 pts each).\n\n` +
        `Confirm?`;
      if (!confirm(msg)) return;
    } else if (!this.isUnlimitedStage() && pending > 0) {
      const msg =
        `Confirm ${pending} free transfer${pending > 1 ? 's' : ''}?\n\n` +
        `Stage: ${stage}  |  Free remaining after this: ${Math.max(0, free - pending)}\n` +
        `No points penalty.`;
      if (!confirm(msg)) return;
    }
    this.saveTeam();
  }

  saveTeam() {
    const cap = this.captainId(); const vc = this.vcId();
    if (!cap || !vc) return;
    const userId = this.auth.getUserId();
    if (!userId) { this.msgOk.set(false); this.message.set('Please log in to save your team'); return; }
    const starterIds = this.starterSlots().filter((id): id is number => id !== null);
    const benchIds   = this.benchSlots().filter((id): id is number => id !== null);
    this.message.set('');
    this.api.saveMyTeam(+userId, starterIds, benchIds, cap, vc, this.currentStage(), this.formation()).subscribe({
      next: team => {
        this.existingTeam.set(team);
        this.originalSquadIds = new Set([...team.starters, ...team.bench].map((p: Player) => p.id));
        this.msgOk.set(true);
        this.message.set(this.pendingTransfers() > 0
          ? `Team saved! ${this.transferPenalty() > 0 ? '−' + this.transferPenalty() + ' pt penalty applied.' : 'All transfers free.'}`
          : 'Team saved successfully!');
        const uid = this.auth.getUserId();
        if (uid) {
          this.api.getTransferRecord(+uid, this.currentStage()).subscribe({ next: rec => this.transferRecord.set(rec), error: () => {} });
        }
      },
      error: err => { this.msgOk.set(false); this.message.set(err.error?.message || err.error?.error || 'Failed to save team'); }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getSlotPlayer(slot: SlotRef): Player | null {
    const id = slot.type === 'xi' ? this.starterSlots()[slot.i] : this.benchSlots()[slot.i];
    return id !== null ? (this.allPlayers().find(p => p.id === id) ?? null) : null;
  }

  inSquad(id: number): boolean { return this.allPickedIds().has(id); }

  canAdd(p: Player): boolean {
    if (this.inSquad(p.id)) return false;
    if (p.team?.eliminated) return false;
    if (this.remainingBudget() < p.price) return false;
    if (this.posQuotaFull(p.position)) return false;
    const slot = this.activeSlot();
    if (slot && p.position !== slot.pos) return false;
    return true;
  }

  totalQuotaFor(pos: string): number { return quotaFor(this.formation())[pos] ?? 0; }
  posQuotaFull(pos: string): boolean { return this.countInSquad(pos) >= this.totalQuotaFor(pos); }
  countInSquad(pos: string): number {
    return [...this.allPickedIds()].filter(id => this.allPlayers().find(p => p.id === id)?.position === pos).length;
  }
  setPoolPos(pos: string) { this.poolPos.set(pos); }
  resetFilters() { this.poolSearch.set(''); this.sortBy.set('price_desc'); }
  posColor(pos: string): string { return POS_COLOR[pos] ?? '#6b7280'; }
  fmtHour(h: number): string {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:00 ${ampm} IST`;
  }

  fmtM(val: number): string { if (val < 0) return '-' + this.fmtM(-val); return '$' + (val / 1_000_000).toFixed(1) + 'm'; }
  shortName(name: string): string { const parts = name.trim().split(' '); return parts.length > 1 ? parts[parts.length - 1] : name; }
}
