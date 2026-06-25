import { Component, inject, OnInit, signal, computed, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Player, UserTeam, Match, UserTransferRecord } from '../../models/models';

const BUDGET = 105_000_000;
const TOTAL_QUOTA = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const TOTAL_PLAYERS = 15;
const STAGE_LIMIT: Record<string, number> = { GROUP: 3, R32: 3, R16: 4, QF: 5, SF: 6, FINAL: 8 };
const UNLIMITED = Infinity;
const FREE_TRANSFERS: Record<string, number> = { GROUP: UNLIMITED, R32: UNLIMITED, R16: 4, QF: 4, SF: 5, FINAL: 6 };
const POS_COLOR: Record<string, string> = { GK: '#f59e0b', DEF: '#10b981', MID: '#3b82f6', FWD: '#ef4444' };

type SlotRef = { pos: string; type: 'xi' | 'bench'; i: number };

const FIXED_ROWS: SlotRef[][] = [
  [{ pos: 'GK', type: 'xi', i: 0 }, { pos: 'GK', type: 'bench', i: 0 }],
  [
    { pos: 'DEF', type: 'xi', i: 1 }, { pos: 'DEF', type: 'xi', i: 2 },
    { pos: 'DEF', type: 'xi', i: 3 }, { pos: 'DEF', type: 'xi', i: 4 },
    { pos: 'DEF', type: 'bench', i: 1 },
  ],
  [
    { pos: 'MID', type: 'xi', i: 5 }, { pos: 'MID', type: 'xi', i: 6 },
    { pos: 'MID', type: 'xi', i: 7 }, { pos: 'MID', type: 'xi', i: 8 },
    { pos: 'MID', type: 'bench', i: 2 },
  ],
  [
    { pos: 'FWD', type: 'xi', i: 9 }, { pos: 'FWD', type: 'xi', i: 10 },
    { pos: 'FWD', type: 'bench', i: 3 },
  ],
];

const STARTER_COUNT = { GK: 1, DEF: 4, MID: 4, FWD: 2 };

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
      <div class="hb-dl-lbl">Transfers deadline</div>
      <div class="hb-dl-val">{{ deadlineLabel() }}</div>
    </div>
    <div class="hb-pills">
      <div class="hb-pill">
        <div class="hb-pill-val" [class.over-budget]="remainingBudget() < 0">{{ fmtM(remainingBudget()) }}</div>
        <div class="hb-pill-lbl">Budget</div>
      </div>
      <div class="hb-pill">
        <div class="hb-pill-val">{{ pickedCount() }}/{{ TOTAL_PLAYERS }}</div>
        <div class="hb-pill-lbl">Selected</div>
      </div>
    </div>
    @if (existingTeam() && transferRecord()) {
      <div class="hb-transfers" [class.penalty]="(transferRecord()?.penaltyPoints ?? 0) > 0">
        <span class="tf-count">{{ isUnlimitedStage() ? '∞ free' : transfersRemaining() + ' free left' }}</span>
        @if ((transferRecord()?.penaltyPoints ?? 0) > 0) {
          <span class="tf-penalty">−{{ transferRecord()?.penaltyPoints }}pts spent</span>
        } @else {
          <span class="tf-free">{{ currentStage() }}</span>
        }
      </div>
    }
  </div>

  <!-- ═══════════════════ BODY ═══════════════════ -->
  <div class="body-row">

    <!-- ── LEFT: PITCH ── -->
    <div class="pitch-col" (click)="$event.stopPropagation()">

      <!-- Transfer panel — only for limited stages with pending transfers -->
      @if (existingTeam() && !isUnlimitedStage()) {
        <div class="transfer-panel">
          <div class="tp-stage">
            <span class="tp-stage-badge">{{ currentStage() }}</span>
            <span class="tp-stage-lbl">Stage</span>
          </div>
          <div class="tp-divider"></div>
          <div class="tp-stat">
            <div class="tp-val">{{ transferRecord()?.transfersMade ?? 0 }}</div>
            <div class="tp-lbl">Used</div>
          </div>
          <div class="tp-stat">
            <div class="tp-val free" [class.zero]="transfersRemaining() === 0">{{ transfersRemaining() }}</div>
            <div class="tp-lbl">Free Left</div>
          </div>
          <div class="tp-stat">
            <div class="tp-val" [class.pending]="pendingTransfers() > 0">{{ pendingTransfers() }}</div>
            <div class="tp-lbl">Pending</div>
          </div>
          @if (transferPenalty() > 0) {
            <div class="tp-penalty-pill">−{{ transferPenalty() }} pts penalty</div>
          } @else if (pendingTransfers() > 0) {
            <div class="tp-free-pill">Free transfers</div>
          }
        </div>
      }

      <!-- Pitch canvas -->
      <div class="pitch">
        <div class="pitch-markings">
          <div class="pm halfway"></div>
          <div class="pm center-circle"></div>
          <div class="pm penalty-top"></div>
          <div class="pm penalty-bot"></div>
          <div class="pm goal-top"></div>
          <div class="pm goal-bot"></div>
        </div>

        @for (row of FIXED_ROWS; track $index) {
          <div class="pitch-row">
            @for (slot of row; track slot.type + slot.i) {
              @if (slot.type === 'bench') {
                <div class="bench-sep"></div>
              }

              <div class="p-slot"
                   [class.p-active]="isActiveSlot(slot)"
                   [class.is-bench]="slot.type === 'bench'"
                   (click)="$event.stopPropagation(); tapSlot(slot.type, slot.i, slot.pos)">

                @if (getSlotPlayer(slot); as p) {
                  <!-- Filled card -->
                  <div class="p-card">
                    <!-- Top icon bar: minus left, C/VC right -->
                    <div class="p-card-icons">
                      <button class="icon-btn minus-btn" (click)="$event.stopPropagation(); removeSlot(slot)" title="Remove">
                        <span class="icon-circle minus-circle">−</span>
                      </button>
                      <div class="cap-badges">
                        @if (captainId() === p.id) {
                          <span class="cap-icon c-icon">C</span>
                        }
                        @if (vcId() === p.id) {
                          <span class="cap-icon vc-icon">V</span>
                        }
                      </div>
                    </div>
                    <!-- Player silhouette -->
                    <div class="p-avatar filled-av" [style.--pc]="posColor(p.position)"></div>
                    <!-- Name + price bar -->
                    <div class="p-name-bar">{{ shortName(p.name) }}</div>
                    <div class="p-price-bar" [style.background]="posColor(p.position)">
                      {{ sortBy() === 'pts_desc' ? (p.totalPoints ?? 0) + ' pts' : fmtM(p.price) }}
                    </div>
                  </div>
                } @else {
                  <!-- Empty card -->
                  <div class="p-card p-card-empty">
                    <div class="p-avatar empty-av" [class.bench-av]="slot.type === 'bench'">
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
          <div class="am-actions">
            <button class="am-btn am-remove" (click)="removeActive()">Remove</button>
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
        <button class="autopick-btn" [class.picking]="autoPicking()" (click)="autoPick()">⚡ AUTOPICK</button>
        <button class="clear-btn" (click)="clearAll()">✕ Clear</button>
      </div>

      <!-- Save button -->
      <div class="save-row" (click)="$event.stopPropagation()">
        <button class="save-btn" [disabled]="!canSave()" (click)="saveTeam()">
          {{ existingTeam() ? 'Confirm Transfers' : 'Save My Team' }}
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
          <div class="pool-row" [class.is-picked]="inSquad(p.id)">
            <div class="pr-pos-badge" [style.background]="posColor(p.position)">{{ p.position }}</div>
            <div class="pr-info">
              <div class="pr-name">{{ p.name }}</div>
              <div class="pr-meta">{{ p.team.name }}</div>
            </div>
            <div class="pr-price" [class.pr-col-active]="sortBy() === 'price_desc'">{{ fmtM(p.price) }}</div>
            <div class="pr-pts"   [class.pr-col-active]="sortBy() === 'pts_desc'">{{ p.totalPoints ?? 0 }}</div>
            @if (inSquad(p.id)) {
              <button class="pr-circ-btn pr-rem-btn" (click)="removeById(p.id)" title="Remove"><span>−</span></button>
            } @else {
              <button class="pr-circ-btn pr-add-btn" [disabled]="!canAdd(p)" (click)="addPlayerFromPool(p)" title="Add"><span>+</span></button>
            }
          </div>
        }
      </div>
    </div>

  </div>
</div>
  `,
  styles: [`
    :host { display: block; }

    .page-wrap {
      position: fixed; top: 64px; left: 0; right: 0; bottom: 0;
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
    .hb-dl-val { color: #fbbf24; font-size: 13px; font-weight: 800; }
    .hb-pills { display: flex; gap: 6px; }
    .hb-pill { background: #1a1a1a; border: 1px solid #333; border-radius: 10px; padding: 6px 14px; text-align: center; min-width: 70px; }
    .hb-pill-val { color: #fff; font-size: 17px; font-weight: 900; line-height: 1; }
    .hb-pill-val.over-budget { color: #ef4444; }
    .hb-pill-lbl { color: #6b7280; font-size: 9px; text-transform: uppercase; margin-top: 2px; }
    .hb-transfers { background: #052e16; border: 1px solid #16a34a; border-radius: 10px; padding: 5px 12px; display: flex; flex-direction: column; align-items: center; }
    .hb-transfers.penalty { background: #2d0a0a; border-color: #ef4444; }
    .tf-count   { color: #fff; font-size: 11px; font-weight: 700; }
    .tf-free    { color: #4ade80; font-size: 10px; font-weight: 600; }
    .tf-penalty { color: #f87171; font-size: 10px; font-weight: 700; }

    /* ── BODY ── */
    .body-row { display: flex; flex: 1; min-height: 0; overflow: hidden; }

    /* ── PITCH COLUMN ── */
    .pitch-col { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 6px 10px 0; overflow: hidden; }

    /* Transfer panel */
    .transfer-panel { display: flex; align-items: center; background: #0d0d0d; border: 1px solid #1f2937; border-radius: 8px; padding: 5px 10px; margin-bottom: 5px; flex-shrink: 0; }
    .tp-stage { display: flex; align-items: center; gap: 6px; margin-right: 8px; }
    .tp-stage-badge { background: #1d4ed8; color: #fff; font-size: 10px; font-weight: 900; padding: 2px 8px; border-radius: 4px; }
    .tp-stage-lbl { color: #6b7280; font-size: 9px; text-transform: uppercase; }
    .tp-divider { width: 1px; background: #1f2937; height: 26px; margin: 0 10px; flex-shrink: 0; }
    .tp-stat { display: flex; flex-direction: column; align-items: center; min-width: 42px; }
    .tp-val { color: #fff; font-size: 16px; font-weight: 900; line-height: 1.1; }
    .tp-val.free  { color: #4ade80; }
    .tp-val.free.zero { color: #f87171; }
    .tp-val.pending { color: #fbbf24; }
    .tp-lbl { color: #6b7280; font-size: 8px; text-transform: uppercase; }
    .tp-penalty-pill { margin-left: auto; background: #450a0a; color: #fca5a5; border: 1px solid #7f1d1d; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 800; white-space: nowrap; }
    .tp-free-pill { margin-left: auto; background: #052e16; color: #4ade80; border: 1px solid #14532d; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }

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

    /* Bench separator */
    .bench-sep { width: 1px; height: 64px; background: rgba(255,255,255,0.15); margin: 0 2px; flex-shrink: 0; }

    /* Slot wrapper */
    .p-slot { display: flex; flex-direction: column; align-items: center; cursor: pointer; width: 72px; flex-shrink: 0; }
    .p-slot.is-bench { opacity: 0.75; }
    .p-slot.is-bench:hover { opacity: 1; }
    .p-slot.p-active .p-card { outline: 2px solid #fff; outline-offset: 1px; }

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
    .autopick-btn { background: #d4e600; color: #000; border: none; border-radius: 20px; padding: 7px 16px; font-size: 13px; font-weight: 900; cursor: pointer; letter-spacing: .5px; white-space: nowrap; transition: opacity .2s; }
    .autopick-btn:hover { opacity: .9; }
    .autopick-btn.picking { animation: pulse-scale .6s ease-in-out; }
    @keyframes pulse-scale { 0%,100%{transform:scale(1)} 50%{transform:scale(0.95)} }
    .clear-btn { background: rgba(0,0,0,.3); color: #fca5a5; border: 1px solid rgba(248,113,113,.2); border-radius: 8px; padding: 6px 10px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }

    /* Save */
    .save-row { padding: 5px 4px; flex-shrink: 0; }
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

    /* ── RESPONSIVE ── */
    @media (max-width: 768px) {
      .page-wrap { top: 56px; }
      .body-row { flex-direction: column; }
      .pool-col { width: 100%; border-left: none; border-top: 2px solid #1f2937; flex: 0 0 320px; }
      .pitch-col { flex: 1; min-height: 0; }
      .key-items { gap: 6px; }
    }
  `]
})
export class MyTeamComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);

  readonly FIXED_ROWS    = FIXED_ROWS;
  readonly POS_LIST      = ['GK', 'DEF', 'MID', 'FWD'];
  readonly TOTAL_QUOTA   = TOTAL_QUOTA;
  readonly TOTAL_PLAYERS = TOTAL_PLAYERS;

  allPlayers     = signal<Player[]>([]);
  poolLoading    = signal(true);
  existingTeam   = signal<UserTeam | null>(null);
  nextMatch      = signal<Match | null>(null);
  transferRecord = signal<UserTransferRecord | null>(null);

  starterSlots = signal<(number | null)[]>(Array(11).fill(null));
  benchSlots   = signal<(number | null)[]>(Array(4).fill(null));
  captainId    = signal<number | null>(null);
  vcId         = signal<number | null>(null);

  activeSlot     = signal<{ type: 'xi' | 'bench'; i: number; pos: string } | null>(null);
  poolPos        = signal('GK');
  poolSearch     = signal('');
  sortBy         = signal('price_desc');
  autoPicking    = signal(false);
  message        = signal('');
  msgOk          = signal(true);

  private originalSquadIds = new Set<number>();

  // ── Computed ──────────────────────────────────────────────────────────────

  starterIds   = computed(() => new Set(this.starterSlots().filter((id): id is number => id !== null)));
  benchIdsArr  = computed(() => this.benchSlots().filter((id): id is number => id !== null));
  allPickedIds = computed(() => new Set([...this.starterIds(), ...this.benchIdsArr()]));
  pickedCount  = computed(() => this.allPickedIds().size);

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

  currentStage          = computed(() => this.nextMatch()?.stage ?? 'R32');
  freeTransfersForStage = computed(() => FREE_TRANSFERS[this.currentStage()] ?? 2);
  isUnlimitedStage      = computed(() => this.freeTransfersForStage() === Infinity);

  deadlineLabel = computed(() => {
    const m = this.nextMatch();
    if (!m) return 'TBD';
    return new Date(m.matchTime).toLocaleDateString('en-US', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  });

  pendingTransfers = computed(() => {
    if (!this.existingTeam()) return 0;
    // Count any player in the current 15 that wasn't in the original saved 15
    return [...this.allPickedIds()].filter(id => !this.originalSquadIds.has(id)).length;
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
    let list   = this.allPlayers().filter(p => p.position === pos);
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

  canSave = computed(() =>
    this.starterIds().size === 11 && this.benchIdsArr().length === 4 &&
    !!this.captainId() && !!this.vcId() && this.remainingBudget() >= 0
  );

  // ── Init ──────────────────────────────────────────────────────────────────

  ngOnInit() {
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
      const upcoming = matches.filter(m => m.status === 'UPCOMING')
        .sort((a, b) => new Date(a.matchTime).getTime() - new Date(b.matchTime).getTime());
      this.nextMatch.set(upcoming[0] ?? null);
      const userId = this.auth.getUserId();
      const stage  = upcoming[0]?.stage ?? 'R32';
      if (userId) {
        this.api.getTransferRecord(+userId, stage).subscribe({ next: rec => this.transferRecord.set(rec), error: () => {} });
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
    // Split starters only by position to fill fixed XI slots
    const xiByPos: Record<string, number[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    team.starters.forEach((p: Player) => xiByPos[p.position]?.push(p.id));

    // Split bench only by position to fill fixed bench slots
    const bnByPos: Record<string, number[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    team.bench.forEach((p: Player) => bnByPos[p.position]?.push(p.id));

    const xi: (number | null)[] = Array(11).fill(null);
    if (xiByPos['GK'][0]  != null) xi[0] = xiByPos['GK'][0];
    xiByPos['DEF'].slice(0, 4).forEach((id, j) => { xi[1 + j] = id; });
    xiByPos['MID'].slice(0, 4).forEach((id, j) => { xi[5 + j] = id; });
    xiByPos['FWD'].slice(0, 2).forEach((id, j) => { xi[9 + j] = id; });

    const bn: (number | null)[] = Array(4).fill(null);
    if (bnByPos['GK'][0]  != null) bn[0] = bnByPos['GK'][0];
    if (bnByPos['DEF'][0] != null) bn[1] = bnByPos['DEF'][0];
    if (bnByPos['MID'][0] != null) bn[2] = bnByPos['MID'][0];
    if (bnByPos['FWD'][0] != null) bn[3] = bnByPos['FWD'][0];

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

  tapSlot(type: 'xi' | 'bench', i: number, pos: string) {
    const cur = this.activeSlot();
    if (cur?.type === type && cur?.i === i && cur?.pos === pos) { this.activeSlot.set(null); return; }
    const id = type === 'xi' ? this.starterSlots()[i] : this.benchSlots()[i];
    this.activeSlot.set({ type, i, pos });
    if (id === null) this.poolPos.set(pos);
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
      if (s.type === 'xi') { const slots = [...this.starterSlots()]; slots[s.i] = player.id; this.starterSlots.set(slots); }
      else { const bench = [...this.benchSlots()]; bench[s.i] = player.id; this.benchSlots.set(bench); }
      this.activeSlot.set(null);
    } else {
      this.autoPlace(player);
    }
    if (!this.captainId()) this.captainId.set(player.id);
    else if (!this.vcId() && this.vcId() !== player.id) this.vcId.set(player.id);
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

    const players     = this.allPlayers();
    const stage       = this.currentStage();
    const stageLim    = STAGE_LIMIT[stage] ?? 3;
    const uniqueTeams = new Set(players.map(p => p.team.id)).size || 2;
    const limit       = Math.max(stageLim, Math.ceil(15 / uniqueTeams));

    // Sorted pools per position: descending price
    const byPos: Record<string, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    players.forEach(p => byPos[p.position]?.push(p));
    Object.values(byPos).forEach(arr => arr.sort((a, b) => b.price - a.price));

    // Cheapest available price per position (fallback 5m) — used to reserve budget for unfilled slots
    const cheapest = (pos: string) =>
      byPos[pos].length ? byPos[pos][byPos[pos].length - 1].price : 5_000_000;

    const picked    = new Set<number>();
    const teamCount = new Map<number, number>();
    let budget      = BUDGET;

    // Remaining slots needed (decremented as we pick)
    const remaining = { GK: 2, DEF: 5, MID: 5, FWD: 3 };

    // Budget floor = sum of cheapest player × unfilled slots EXCLUDING the slot we're about to fill
    const minReserve = (excludePos: string) => {
      let reserve = 0;
      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        const slots = pos === excludePos ? remaining[pos as keyof typeof remaining] - 1 : remaining[pos as keyof typeof remaining];
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
        // Only pick if this player's price still leaves enough for all remaining slots
        if (p.price > budget - minReserve(pos)) continue;
        result.push(p);
        picked.add(p.id);
        budget -= p.price;
        remaining[pos as keyof typeof remaining]--;
        teamCount.set(p.team.id, (teamCount.get(p.team.id) ?? 0) + 1);
      }
      return result;
    };

    const gks  = pickN('GK',  2);
    const defs = pickN('DEF', 5);
    const mids = pickN('MID', 5);
    const fwds = pickN('FWD', 3);

    const newXI: (number | null)[] = Array(11).fill(null);
    if (gks[0])  newXI[0] = gks[0].id;
    defs.slice(0, 4).forEach((p, j) => { newXI[1 + j] = p.id; });
    mids.slice(0, 4).forEach((p, j) => { newXI[5 + j] = p.id; });
    fwds.slice(0, 2).forEach((p, j) => { newXI[9 + j] = p.id; });

    const newBn: (number | null)[] = Array(4).fill(null);
    if (gks[1])  newBn[0] = gks[1].id;
    if (defs[4]) newBn[1] = defs[4].id;
    if (mids[4]) newBn[2] = mids[4].id;
    if (fwds[2]) newBn[3] = fwds[2].id;

    const starters = [gks[0], ...defs.slice(0, 4), ...mids.slice(0, 4), ...fwds.slice(0, 2)]
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

  // ── Save ──────────────────────────────────────────────────────────────────

  saveTeam() {
    const cap = this.captainId(); const vc = this.vcId();
    if (!cap || !vc) return;
    const userId = this.auth.getUserId();
    if (!userId) { this.msgOk.set(false); this.message.set('Please log in to save your team'); return; }
    const starterIds = this.starterSlots().filter((id): id is number => id !== null);
    const benchIds   = this.benchSlots().filter((id): id is number => id !== null);
    this.message.set('');
    console.log('[transfer] pendingTransfers=', this.pendingTransfers(), 'originalSquadIds=', [...this.originalSquadIds], 'newAll=', [...starterIds, ...benchIds]);
    this.api.saveMyTeam(+userId, starterIds, benchIds, cap, vc, this.currentStage()).subscribe({
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
    if (this.remainingBudget() < p.price) return false;
    if (this.posQuotaFull(p.position)) return false;
    return true;
  }

  totalQuotaFor(pos: string): number { return TOTAL_QUOTA[pos as keyof typeof TOTAL_QUOTA] ?? 0; }
  posQuotaFull(pos: string): boolean { return this.countInSquad(pos) >= this.totalQuotaFor(pos); }
  countInSquad(pos: string): number {
    return [...this.allPickedIds()].filter(id => this.allPlayers().find(p => p.id === id)?.position === pos).length;
  }
  setPoolPos(pos: string) { this.poolPos.set(pos); }
  resetFilters() { this.poolSearch.set(''); this.sortBy.set('price_desc'); }
  posColor(pos: string): string { return POS_COLOR[pos] ?? '#6b7280'; }
  fmtM(val: number): string { if (val < 0) return '-' + this.fmtM(-val); return '$' + (val / 1_000_000).toFixed(1) + 'm'; }
  shortName(name: string): string { const parts = name.trim().split(' '); return parts.length > 1 ? parts[parts.length - 1] : name; }
}
