import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Player, Match } from '../../models/models';

const BUDGET = 105_000_000;
const FORMATIONS = ['4-3-3', '4-4-2', '4-5-1', '3-4-3', '3-5-2', '5-4-1', '5-3-2'];
const STAGE_LIMIT: Record<string, number> = { GROUP: 3, R32: 3, R16: 4, QF: 5, SF: 6, FINAL: 8 };
const POS_BG: Record<string, string> = { GK: '#e65100', DEF: '#2e7d32', MID: '#1565c0', FWD: '#b71c1c' };

function parseFormation(f: string): string[] {
  const parts = f.split('-').map(Number);
  const pos: string[] = ['GK'];
  for (let i = 0; i < parts[0]; i++) pos.push('DEF');
  for (let i = 0; i < parts[1]; i++) pos.push('MID');
  for (let i = 0; i < parts[2]; i++) pos.push('FWD');
  return pos;
}

@Component({
  selector: 'app-squad-builder',
  standalone: true,
  imports: [],
  template: `
<div class="sw" (click)="bgClick()">

  <!-- TOP BAR -->
  <div class="top-bar">
    @if (match()) {
      <div class="match-row">
        <span class="team-a">{{ match()!.teamA.name }}</span>
        <span class="vs-sep">vs</span>
        <span class="team-b">{{ match()!.teamB.name }}</span>
        <span class="stage-tag">{{ match()!.stage }}</span>
      </div>
    }
    <div class="budget-row">
      <div class="bud-left">
        <span class="bud-lbl">Budget</span>
        <span class="bud-val" [class.over]="remainingBudget() < 0">{{ fmtM(remainingBudget()) }} rem</span>
      </div>
      <div class="bud-bar-wrap">
        <div class="bud-bar" [style.width.%]="budgetPct()" [class.over-bar]="remainingBudget() < 0"></div>
      </div>
      <div class="bud-right">
        <span class="squad-ct">{{ startingIds().size }}/11</span>
        <span class="bench-ct">+{{ benchIds().length }}/4</span>
      </div>
    </div>
  </div>

  <!-- PITCH -->
  <div class="pitch">
    <!-- Decorative markings -->
    <div class="fm halfway-line"></div>
    <div class="fm center-dot"></div>
    <div class="fm penalty-box top-box"></div>
    <div class="fm penalty-box bot-box"></div>

    <!-- Formation rows: FWD top → GK bottom -->
    @for (row of pitchRows(); track $index) {
      <div class="prow">
        @for (slot of row; track slot.si) {
          <div class="pslot" [class.slot-active]="isActive('xi', slot.si)"
               (click)="$event.stopPropagation(); tapSlot('xi', slot.si)">
            @if (getPlayer(slot.si); as p) {
              <div class="token">
                <div class="timg" [style.background]="posColor(slot.pos)">
                  @if (captainId() === p.id) { <span class="cbadge">C</span> }
                  @if (vcId() === p.id) { <span class="vbadge">V</span> }
                  <span class="shirt-ico">&#128085;</span>
                </div>
                <div class="tname">{{ shortName(p.name) }}</div>
                <div class="tprice">{{ fmtM(p.price) }}</div>
              </div>
            } @else {
              <div class="token empty-tok" (click)="$event.stopPropagation(); tapSlot('xi', slot.si)">
                <div class="timg empty-timg">
                  <span class="plus-ico">+</span>
                </div>
                <div class="tname dim-lbl">{{ slot.pos }}</div>
              </div>
            }
          </div>
        }
      </div>
    }

    <!-- BENCH STRIP -->
    <div class="bench-strip">
      <div class="bench-lbl">SUBSTITUTES</div>
      <div class="bench-row">
        @for (i of [0,1,2,3]; track i) {
          <div class="pslot" [class.slot-active]="isActive('bench', i)"
               (click)="$event.stopPropagation(); tapSlot('bench', i)">
            @if (getBenchPlayer(i); as p) {
              <div class="token">
                <div class="timg" [style.background]="posColor(p.position)">
                  @if (captainId() === p.id) { <span class="cbadge">C</span> }
                  @if (vcId() === p.id) { <span class="vbadge">V</span> }
                  <span class="shirt-ico">&#128085;</span>
                </div>
                <div class="tname">{{ shortName(p.name) }}</div>
                <div class="bench-num">B{{ i + 1 }}</div>
              </div>
            } @else {
              <div class="token empty-tok">
                <div class="timg empty-timg bench-empty">
                  <span class="plus-ico">+</span>
                </div>
                <div class="tname dim-lbl">B{{ i + 1 }}</div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  </div>

  <!-- ACTION MENU (tap filled token) -->
  @if (showActionMenu() && activePlayer(); as p) {
    <div class="action-menu" (click)="$event.stopPropagation()">
      <div class="am-head">
        <div class="am-dot" [style.background]="posColor(p.position)"></div>
        <div class="am-info">
          <span class="am-name">{{ p.name }}</span>
          <span class="am-meta">{{ p.team.name }} &middot; {{ fmtM(p.price) }}</span>
        </div>
        <button class="am-close" (click)="activeSlot.set(null)">&#10005;</button>
      </div>
      <div class="am-btns">
        <button class="am-btn rem-btn" (click)="removePlayer()">Remove</button>
        <button class="am-btn cap-btn" [class.am-selected]="captainId() === p.id" (click)="setCaptain(p.id)">
          Captain{{ captainId() === p.id ? ' ✓' : '' }}
        </button>
        <button class="am-btn vc-btn" [class.am-selected]="vcId() === p.id" (click)="setVC(p.id)">
          Vice-C{{ vcId() === p.id ? ' ✓' : '' }}
        </button>
      </div>
    </div>
  }

  <!-- PLAYER PICKER -->
  @if (pickerOpen()) {
    <div class="picker" (click)="$event.stopPropagation()">
      <div class="picker-hd">
        <span class="picker-title">Pick Player</span>
        <button class="am-close" (click)="activeSlot.set(null)">&#10005;</button>
      </div>
      <div class="pos-tabs">
        @for (pos of ['GK','DEF','MID','FWD']; track pos) {
          <button class="pos-tab" [class.ptab-active]="pickerPos() === pos"
            [style.--tc]="posColor(pos)"
            (click)="pickerPos.set(pos)">{{ pos }}</button>
        }
      </div>
      <div class="picker-list">
        @if (pickerPlayers().length === 0) {
          <div class="empty-pick">No {{ pickerPos() }} players available</div>
        }
        @for (p of pickerPlayers(); track p.id) {
          <div class="pick-item" (click)="selectPlayer(p)">
            <div class="pi-dot" [style.background]="posColor(p.position)">{{ p.position }}</div>
            <div class="pi-info">
              <span class="pi-name">{{ p.name }}</span>
              <span class="pi-team">{{ p.team.name }}</span>
            </div>
            <span class="pi-price">{{ fmtM(p.price) }}</span>
            <div class="pi-add">+</div>
          </div>
        }
      </div>
    </div>
  }

  <!-- AUTO-PICK / CLEAR TOOLBAR -->
  <div class="toolbar" (click)="$event.stopPropagation()">
    <button class="tb-btn auto-btn" [class.spinning]="autoPicking()" (click)="autoPick()">
      <span class="tb-ico">&#9889;</span> Auto Pick
    </button>
    <div class="footer-caps">
      <span class="c-tag">C: {{ captainName() ?? '&#8212;' }}</span>
      <span class="v-tag">V: {{ vcName() ?? '&#8212;' }}</span>
    </div>
    <button class="tb-btn clear-btn" (click)="clearAll()">
      <span class="tb-ico">&#10005;</span> Clear
    </button>
  </div>

  <!-- FOOTER -->
  <div class="footer" (click)="$event.stopPropagation()">
    <div class="footer-left">
      <label class="form-lbl">Formation</label>
      <select class="form-sel" [value]="formation()" (change)="setFormation($event)">
        @for (f of formations; track f) {
          <option [value]="f">{{ f }}</option>
        }
      </select>
    </div>
    <div class="footer-info">
      <span class="bud-footer">{{ fmtM(remainingBudget()) }} left</span>
      <span class="ct-footer">{{ startingIds().size }}/11 picked</span>
    </div>
    <button class="save-btn" [disabled]="!canSave()" (click)="saveSquad()">
      Save Squad
    </button>
  </div>

  @if (message()) {
    <div class="msg-bar" [class.msg-ok]="isSuccess()" [class.msg-err]="!isSuccess()">
      {{ message() }}
    </div>
  }
</div>
  `,
  styles: [`
    :host { display: block; }

    /* pull out of 700px container to go full-width */
    .sw { margin: -24px -16px 0; font-family: 'Roboto', sans-serif; background: #0d1117; }

    /* TOP BAR */
    .top-bar { background: #0a0f1e; padding: 10px 16px 8px; border-bottom: 1px solid #1e2d4a; }
    .match-row { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; flex-wrap: wrap; }
    .team-a, .team-b { color: #fff; font-size: 14px; font-weight: 700; }
    .vs-sep { color: #5c7a9e; font-size: 11px; font-weight: 600; }
    .stage-tag { background: #1e3a5f; color: #82b1ff; font-size: 10px; font-weight: 700;
                 padding: 2px 7px; border-radius: 8px; letter-spacing: .5px; text-transform: uppercase; }
    .budget-row { display: flex; align-items: center; gap: 8px; }
    .bud-left { display: flex; flex-direction: column; min-width: 80px; }
    .bud-lbl { color: #5c7a9e; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; }
    .bud-val { color: #4caf50; font-size: 13px; font-weight: 700; }
    .bud-val.over { color: #f44336; }
    .bud-bar-wrap { flex: 1; height: 5px; background: #1e2d4a; border-radius: 3px; overflow: hidden; }
    .bud-bar { height: 100%; background: #4caf50; border-radius: 3px; transition: width .3s; }
    .bud-bar.over-bar { background: #f44336; }
    .bud-right { display: flex; flex-direction: column; align-items: flex-end; min-width: 44px; }
    .squad-ct { color: #fff; font-size: 12px; font-weight: 700; }
    .bench-ct { color: #5c7a9e; font-size: 10px; }

    /* PITCH */
    .pitch { position: relative; background: linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%);
             padding: 6px 4px 0; overflow: hidden; }

    /* Field markings */
    .fm { position: absolute; pointer-events: none; }
    .halfway-line { left: 0; right: 0; top: 48%; height: 1px; background: rgba(255,255,255,0.2); }
    .center-dot { left: 50%; top: 48%; width: 56px; height: 56px; border-radius: 50%;
                  border: 1px solid rgba(255,255,255,0.18); transform: translate(-50%,-50%); }
    .penalty-box { left: 50%; width: 120px; height: 52px; border: 1px solid rgba(255,255,255,0.15);
                   transform: translateX(-50%); }
    .top-box { top: 0; border-top: none; }
    .bot-box { bottom: 64px; border-bottom: none; }

    /* Pitch rows */
    .prow { display: flex; justify-content: center; align-items: flex-end; gap: 4px;
            padding: 4px 8px; position: relative; z-index: 1; }

    /* Player slot */
    .pslot { display: flex; flex-direction: column; align-items: center; cursor: pointer; width: 60px; }
    .pslot.slot-active .token .timg { box-shadow: 0 0 0 3px #fff, 0 0 12px 4px rgba(255,255,255,0.6); }

    /* Token */
    .token { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .timg { width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center;
            justify-content: center; position: relative; border: 2px solid rgba(255,255,255,0.4);
            transition: box-shadow .2s; }
    .shirt-ico { font-size: 20px; line-height: 1; }
    .tname { color: #fff; font-size: 9.5px; font-weight: 600; text-align: center; max-width: 58px;
             white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
             background: rgba(0,0,0,0.55); padding: 1px 4px; border-radius: 3px; }
    .tprice { color: #b2dfdb; font-size: 8.5px; text-align: center; }
    .bench-num { color: #ffb300; font-size: 8px; font-weight: 700; }

    /* Empty token */
    .empty-tok .timg.empty-timg { background: rgba(255,255,255,0.12) !important;
                                   border: 2px dashed rgba(255,255,255,0.4); }
    .empty-tok .timg.bench-empty { background: rgba(255,255,255,0.07) !important; }
    .plus-ico { color: rgba(255,255,255,0.7); font-size: 20px; font-weight: 300; line-height: 1; }
    .dim-lbl { color: rgba(255,255,255,0.5) !important; background: transparent !important; }

    /* Captain / VC badges */
    .cbadge, .vbadge { position: absolute; bottom: -4px; left: -4px; width: 18px; height: 18px;
                        border-radius: 50%; font-size: 9px; font-weight: 800; display: flex;
                        align-items: center; justify-content: center; border: 2px solid #0d1117;
                        z-index: 10; }
    .cbadge { background: #ffd600; color: #000; }
    .vbadge { background: #7b1fa2; color: #fff; }

    /* BENCH STRIP */
    .bench-strip { background: rgba(0,0,0,0.35); padding: 6px 8px 10px; margin-top: 6px;
                   border-top: 1px solid rgba(255,255,255,0.15); }
    .bench-lbl { color: rgba(255,255,255,0.5); font-size: 9px; font-weight: 700; letter-spacing: 1px;
                 text-align: center; margin-bottom: 4px; text-transform: uppercase; }
    .bench-row { display: flex; justify-content: center; gap: 4px; }

    /* ACTION MENU */
    .action-menu { background: #0a0f1e; border-top: 2px solid #1e3a5f; padding: 12px 16px; }
    .am-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .am-dot { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; }
    .am-info { flex: 1; display: flex; flex-direction: column; }
    .am-name { color: #fff; font-size: 14px; font-weight: 700; }
    .am-meta { color: #5c7a9e; font-size: 11px; }
    .am-close { background: none; border: 1px solid #2a3d5a; color: #7a8fa6; width: 28px; height: 28px;
                border-radius: 50%; cursor: pointer; font-size: 12px; flex-shrink: 0;
                display: flex; align-items: center; justify-content: center; }
    .am-btns { display: flex; gap: 8px; }
    .am-btn { flex: 1; padding: 8px 4px; border-radius: 8px; border: none; font-size: 12px;
              font-weight: 700; cursor: pointer; transition: all .15s; }
    .rem-btn { background: #1e2d4a; color: #ef5350; }
    .rem-btn:hover { background: #2a1f1f; }
    .cap-btn { background: #1e2d4a; color: #ffd600; }
    .cap-btn.am-selected { background: #ffd600; color: #000; }
    .vc-btn { background: #1e2d4a; color: #ce93d8; }
    .vc-btn.am-selected { background: #7b1fa2; color: #fff; }

    /* PLAYER PICKER */
    .picker { background: #0d1117; border-top: 2px solid #1e3a5f; }
    .picker-hd { display: flex; justify-content: space-between; align-items: center;
                  padding: 10px 16px 6px; }
    .picker-title { color: #fff; font-size: 14px; font-weight: 700; }
    .pos-tabs { display: flex; border-bottom: 1px solid #1e2d4a; padding: 0 16px; gap: 4px; }
    .pos-tab { flex: 1; padding: 7px 0; background: none; border: none; border-bottom: 3px solid transparent;
               color: #5c7a9e; font-size: 12px; font-weight: 700; cursor: pointer;
               transition: all .15s; text-transform: uppercase; letter-spacing: .5px; }
    .pos-tab.ptab-active { color: var(--tc, #fff); border-bottom-color: var(--tc, #fff); }
    .picker-list { max-height: 220px; overflow-y: auto; }
    .pick-item { display: flex; align-items: center; gap: 10px; padding: 9px 16px;
                 border-bottom: 1px solid #0f1923; cursor: pointer; transition: background .1s; }
    .pick-item:hover { background: #131c2b; }
    .pi-dot { width: 32px; height: 32px; border-radius: 6px; color: #fff; font-size: 9px; font-weight: 800;
              display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .pi-info { flex: 1; display: flex; flex-direction: column; }
    .pi-name { color: #e0e0e0; font-size: 13px; font-weight: 600; }
    .pi-team { color: #5c7a9e; font-size: 10px; }
    .pi-price { color: #4caf50; font-size: 12px; font-weight: 700; min-width: 40px; text-align: right; }
    .pi-add { width: 28px; height: 28px; border-radius: 50%; background: #1e3a5f;
              color: #82b1ff; font-size: 18px; display: flex; align-items: center;
              justify-content: center; flex-shrink: 0; font-weight: 300; }
    .empty-pick { padding: 20px; text-align: center; color: #5c7a9e; font-size: 13px; }

    /* AUTO-PICK / CLEAR TOOLBAR */
    .toolbar { background: #0f1923; border-top: 1px solid #1e2d4a;
               padding: 8px 16px; display: flex; align-items: center; gap: 8px; min-height: 60px; }
    .tb-btn { display: flex; align-items: center; gap: 5px; padding: 7px 14px; border: none;
              border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
              transition: all .2s; white-space: nowrap; }
    .tb-ico { font-size: 14px; }
    .auto-btn { background: linear-gradient(135deg, #1a6b3c, #0d4726); color: #69f0ae;
                border: 1px solid rgba(105,240,174,0.3); }
    .auto-btn:hover { background: linear-gradient(135deg, #1e8047, #125930); }
    .auto-btn.spinning { animation: spin-pulse 1s ease-in-out; pointer-events: none; opacity: 0.8; }
    @keyframes spin-pulse { 0%{transform:scale(1)} 30%{transform:scale(0.96)} 70%{transform:scale(1.02)} 100%{transform:scale(1)} }
    .clear-btn { background: #1e2d4a; color: #ef9a9a; border: 1px solid rgba(239,154,154,0.2); }
    .clear-btn:hover { background: #2a1a1a; color: #ef5350; }

    /* FOOTER */
    .footer { background: #0a0f1e; border-top: 1px solid #1e2d4a;
              padding: 10px 16px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .footer-left { display: flex; align-items: center; gap: 6px; }
    .form-lbl { color: #5c7a9e; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
    .form-sel { background: #1e2d4a; color: #fff; border: 1px solid #2a3d5a; border-radius: 6px;
                padding: 5px 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
    .footer-info { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .bud-footer { color: #4caf50; font-size: 11px; font-weight: 700; }
    .ct-footer { color: #5c7a9e; font-size: 10px; }
    .footer-caps { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 5px; overflow: hidden; }
    .c-tag, .v-tag { width: 100%; padding: 4px 10px; border-radius: 10px; font-size: 11px; font-weight: 700;
                     overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
    .c-tag { background: rgba(255,214,0,0.15); color: #ffd600; border: 1px solid rgba(255,214,0,0.35); }
    .v-tag { background: rgba(123,31,162,0.2); color: #ce93d8; border: 1px solid rgba(123,31,162,0.45); }
    .save-btn { background: linear-gradient(135deg, #1976d2, #0d47a1); color: #fff;
                border: none; border-radius: 8px; padding: 9px 20px; font-size: 13px;
                font-weight: 700; cursor: pointer; white-space: nowrap; transition: opacity .15s; }
    .save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .save-btn:not(:disabled):hover { opacity: 0.9; }
    .msg-bar { text-align: center; padding: 10px 16px; font-size: 13px; font-weight: 600; line-height: 1.4; }
    .msg-ok  { background: #1b5e20; color: #c8e6c9; }
    .msg-err { background: #b71c1c; color: #ffcdd2; }

    /* scrollbar */
    .picker-list::-webkit-scrollbar { width: 4px; }
    .picker-list::-webkit-scrollbar-track { background: #0d1117; }
    .picker-list::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 2px; }
  `]
})
export class SquadBuilderComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  match = signal<Match | null>(null);
  allPlayers = signal<Player[]>([]);

  startingSlots = signal<(number | null)[]>(Array(11).fill(null));
  benchSlots    = signal<(number | null)[]>(Array(4).fill(null));

  captainId = signal<number | null>(null);
  vcId      = signal<number | null>(null);
  formation = signal('4-3-3');

  activeSlot  = signal<{ type: 'xi' | 'bench'; index: number } | null>(null);
  pickerPos   = signal('GK');
  message     = signal('');
  autoPicking = signal(false);

  readonly formations = FORMATIONS;

  slotPositions = computed(() => parseFormation(this.formation()));

  pitchRows = computed(() => {
    const positions = this.slotPositions();
    const defCount = positions.filter(p => p === 'DEF').length;
    const midCount = positions.filter(p => p === 'MID').length;
    const fwdCount = positions.filter(p => p === 'FWD').length;
    const gkRow  = [{ pos: 'GK',  si: 0 }];
    const defRow = Array.from({ length: defCount }, (_, j) => ({ pos: 'DEF', si: 1 + j }));
    const midRow = Array.from({ length: midCount }, (_, j) => ({ pos: 'MID', si: 1 + defCount + j }));
    const fwdRow = Array.from({ length: fwdCount }, (_, j) => ({ pos: 'FWD', si: 1 + defCount + midCount + j }));
    return [fwdRow, midRow, defRow, gkRow]; // FWD top, GK bottom
  });

  startingIds = computed(() => new Set(this.startingSlots().filter((id): id is number => id !== null)));
  benchIds    = computed(() => this.benchSlots().filter((id): id is number => id !== null));

  remainingBudget = computed(() => {
    const used = [...this.startingIds(), ...this.benchIds()].reduce((sum, id) => {
      const p = this.allPlayers().find(x => x.id === id);
      return sum + (p?.price ?? 6_000_000);
    }, 0);
    return BUDGET - used;
  });

  budgetPct = computed(() => Math.min(100, Math.round((1 - this.remainingBudget() / BUDGET) * 100)));

  captainName = computed(() => {
    const id = this.captainId();
    return id ? (this.allPlayers().find(p => p.id === id)?.name ?? null) : null;
  });

  vcName = computed(() => {
    const id = this.vcId();
    return id ? (this.allPlayers().find(p => p.id === id)?.name ?? null) : null;
  });

  countryLimit = computed(() => STAGE_LIMIT[this.match()?.stage ?? 'GROUP'] ?? 3);

  pickerOpen = computed(() => {
    const s = this.activeSlot();
    if (!s) return false;
    const id = s.type === 'xi' ? this.startingSlots()[s.index] : this.benchSlots()[s.index];
    return id === null;
  });

  showActionMenu = computed(() => {
    const s = this.activeSlot();
    if (!s) return false;
    const id = s.type === 'xi' ? this.startingSlots()[s.index] : this.benchSlots()[s.index];
    return id !== null;
  });

  activePlayer = computed((): Player | null => {
    const s = this.activeSlot();
    if (!s) return null;
    return s.type === 'xi' ? this.getPlayer(s.index) : this.getBenchPlayer(s.index);
  });

  pickerPlayers = computed(() => {
    const pos  = this.pickerPos();
    const used = new Set([...this.startingIds(), ...this.benchIds()]);
    return this.allPlayers().filter(p => p.position === pos && !used.has(p.id));
  });

  getPlayer(slotIndex: number): Player | null {
    const id = this.startingSlots()[slotIndex];
    return id !== null ? (this.allPlayers().find(p => p.id === id) ?? null) : null;
  }

  getBenchPlayer(index: number): Player | null {
    const id = this.benchSlots()[index];
    return id !== null ? (this.allPlayers().find(p => p.id === id) ?? null) : null;
  }

  isActive(type: 'xi' | 'bench', index: number): boolean {
    const s = this.activeSlot();
    return s?.type === type && s?.index === index;
  }

  tapSlot(type: 'xi' | 'bench', index: number) {
    const cur = this.activeSlot();
    if (cur?.type === type && cur?.index === index) { this.activeSlot.set(null); return; }
    this.activeSlot.set({ type, index });
    const id = type === 'xi' ? this.startingSlots()[index] : this.benchSlots()[index];
    if (id === null) {
      const pos = type === 'xi' ? (this.slotPositions()[index] ?? 'GK') : 'GK';
      this.pickerPos.set(pos);
    }
  }

  bgClick() { this.activeSlot.set(null); }

  selectPlayer(player: Player) {
    const s = this.activeSlot();
    if (!s) return;
    if (s.type === 'xi') {
      const slots = [...this.startingSlots()];
      slots[s.index] = player.id;
      this.startingSlots.set(slots);
    } else {
      const bench = [...this.benchSlots()];
      bench[s.index] = player.id;
      this.benchSlots.set(bench);
    }
    this.activeSlot.set(null);
  }

  removePlayer() {
    const s = this.activeSlot();
    if (!s) return;
    if (s.type === 'xi') {
      const slots = [...this.startingSlots()];
      const removed = slots[s.index];
      slots[s.index] = null;
      this.startingSlots.set(slots);
      if (removed === this.captainId()) this.captainId.set(null);
      if (removed === this.vcId()) this.vcId.set(null);
    } else {
      const bench = [...this.benchSlots()];
      bench[s.index] = null;
      this.benchSlots.set(bench);
    }
    this.activeSlot.set(null);
  }

  setCaptain(id: number) {
    if (this.vcId() === id) this.vcId.set(null);
    this.captainId.set(id);
    this.activeSlot.set(null);
  }

  setVC(id: number) {
    if (this.captainId() === id) this.captainId.set(null);
    this.vcId.set(id);
    this.activeSlot.set(null);
  }

  setFormation(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    const oldPos  = this.slotPositions();
    this.formation.set(v);
    const newPos  = this.slotPositions();
    // Remap players to new slots by position
    const byPos: Record<string, number[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    this.startingSlots().forEach(id => {
      if (id !== null) {
        const p = this.allPlayers().find(x => x.id === id);
        if (p) byPos[p.position].push(id);
      }
    });
    this.startingSlots.set(newPos.map(pos => byPos[pos]?.shift() ?? null));
  }

  clearAll() {
    this.startingSlots.set(Array(11).fill(null));
    this.benchSlots.set(Array(4).fill(null));
    this.captainId.set(null);
    this.vcId.set(null);
    this.activeSlot.set(null);
    this.message.set('');
  }

  autoPick() {
    if (this.autoPicking()) return;
    this.autoPicking.set(true);
    this.activeSlot.set(null);

    const players   = this.allPlayers();
    const positions = this.slotPositions(); // 11 positions in formation order

    // Country limit: the configured stage limit assumes picking from 32 teams.
    // In a 2-team match we must distribute 15 slots across only 2 teams,
    // so the effective cap is max(stageLimit, ceil(15 / numTeams)).
    const stageLimit  = this.countryLimit();
    const uniqueTeams = new Set(players.map(p => p.team.id)).size || 2;
    const limit       = Math.max(stageLimit, Math.ceil(15 / uniqueTeams));

    // Need: 11 starters (match formation) + 4 bench (any pos mix, at least 1 GK)
    const posCounts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    positions.forEach(p => posCounts[p] = (posCounts[p] ?? 0) + 1);

    // Sort players by price descending within each position
    const byPos: Record<string, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    players.forEach(p => byPos[p.position]?.push(p));
    Object.keys(byPos).forEach(pos => byPos[pos].sort((a, b) => b.price - a.price));

    const picked: Player[] = [];
    const teamCount = new Map<number, number>();
    let budget = BUDGET;

    const tryPick = (pool: Player[], needed: number): Player[] => {
      const result: Player[] = [];
      for (const p of pool) {
        if (result.length >= needed) break;
        if (picked.find(x => x.id === p.id)) continue;
        if (p.price > budget) continue;
        if ((teamCount.get(p.team.id) ?? 0) >= limit) continue;
        result.push(p);
        picked.push(p);
        budget -= p.price;
        teamCount.set(p.team.id, (teamCount.get(p.team.id) ?? 0) + 1);
      }
      return result;
    };

    // Pick starters per formation
    const startersByPos: Record<string, Player[]> = {};
    for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
      startersByPos[pos] = tryPick(byPos[pos], posCounts[pos] ?? 0);
    }

    // Map starters into slots following formation order
    const starterMap: Record<string, Player[]> = { GK: [...startersByPos['GK']], DEF: [...startersByPos['DEF']], MID: [...startersByPos['MID']], FWD: [...startersByPos['FWD']] };
    const newXiSlots: (number | null)[] = positions.map(pos => starterMap[pos]?.shift()?.id ?? null);

    // Pick bench: 1 GK first, then fill remaining 3 with best available any position
    const benchPicked: Player[] = [];
    const gkForBench = tryPick(byPos['GK'].filter(p => !picked.find(x => x.id === p.id)), 1);
    benchPicked.push(...gkForBench);

    const remaining = [...byPos['DEF'], ...byPos['MID'], ...byPos['FWD'], ...byPos['GK']]
      .filter(p => !picked.find(x => x.id === p.id))
      .sort((a, b) => b.price - a.price);
    const bench3 = tryPick(remaining, 3);
    benchPicked.push(...bench3);

    const newBenchSlots: (number | null)[] = Array(4).fill(null);
    benchPicked.slice(0, 4).forEach((p, i) => { newBenchSlots[i] = p.id; });

    // Auto-assign captain = highest priced starter, VC = second highest
    const allStarters = newXiSlots.filter((id): id is number => id !== null)
      .map(id => players.find(p => p.id === id)!)
      .filter(Boolean)
      .sort((a, b) => b.price - a.price);

    this.startingSlots.set(newXiSlots);
    this.benchSlots.set(newBenchSlots);
    this.captainId.set(allStarters[0]?.id ?? null);
    this.vcId.set(allStarters[1]?.id ?? null);

    // Brief animation then clear flag
    setTimeout(() => this.autoPicking.set(false), 600);
  }

  canSave(): boolean {
    return this.startingIds().size === 11 && !!this.captainId() && !!this.vcId() && this.remainingBudget() >= 0;
  }

  msgSuccess = signal(true);

  isSuccess(): boolean { return this.msgSuccess(); }

  saveSquad() {
    const m = this.match();
    const cap = this.captainId();
    const vc  = this.vcId();
    if (!m || !cap || !vc) return;
    this.message.set('');
    this.api.saveSquad(this.auth.getUserId(), m.id, [...this.startingIds()], cap, vc, this.benchIds())
      .subscribe({
        next: () => { this.msgSuccess.set(true); this.message.set('Squad saved successfully!'); },
        error: err => {
          this.msgSuccess.set(false);
          const msg = err.error?.message || err.error?.error || err.message || 'Failed to save squad';
          this.message.set(msg);
        }
      });
  }

  ngOnInit() {
    const matchId = +this.route.snapshot.params['matchId'];
    this.api.getMatches().subscribe(matches => {
      const m = matches.find(x => x.id === matchId) ?? null;
      this.match.set(m);
      if (!m) return;
      const players: Player[] = [];
      this.api.getPlayersByTeam(m.teamA.id).subscribe(pa => {
        players.push(...pa);
        this.api.getPlayersByTeam(m.teamB.id).subscribe(pb => {
          players.push(...pb);
          this.allPlayers.set(players);
          const uid = this.auth.getUserId();
          if (uid) {
            this.api.getSquad(uid, matchId).subscribe({
              next: squad => {
                if (!squad?.players?.length) return;
                const positions = this.slotPositions();
                const byPos: Record<string, number[]> = { GK: [], DEF: [], MID: [], FWD: [] };
                squad.players.forEach((p: Player) => byPos[p.position]?.push(p.id));
                this.startingSlots.set(positions.map(pos => byPos[pos]?.shift() ?? null));
                if (squad.bench) {
                  const bench: (number | null)[] = Array(4).fill(null);
                  squad.bench.forEach((p: Player, i: number) => { if (i < 4) bench[i] = p.id; });
                  this.benchSlots.set(bench);
                }
                if (squad.captain) this.captainId.set(squad.captain.id);
                if (squad.viceCaptain) this.vcId.set(squad.viceCaptain.id);
              },
              error: () => {}
            });
          }
        });
      });
    });
  }

  posColor(pos: string): string { return POS_BG[pos] ?? '#555'; }

  fmtM(val: number): string {
    if (val < 0) return '-' + this.fmtM(-val);
    return '$' + (val / 1_000_000).toFixed(1) + 'm';
  }

  shortName(name: string): string {
    const parts = name.trim().split(' ');
    return parts.length > 1 ? parts[parts.length - 1] : name;
  }
}
