import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-points-guide',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="guide-wrap" [class.compact]="compact()">

      <div class="guide-header" (click)="toggle()" [class.clickable]="collapsible()">
        <div class="guide-title">
          <mat-icon class="title-icon">emoji_events</mat-icon>
          How Points Work
        </div>
        @if (collapsible()) {
          <mat-icon class="chevron">{{ open ? 'expand_less' : 'expand_more' }}</mat-icon>
        }
      </div>

      @if (open) {
        <div class="guide-body">

          <!-- Column 1: Appearance + Goals -->
          <div class="col">
            <div class="card-section">
              <div class="section-title">🕐 Appearance</div>
              <div class="rows">
                <div class="row"><span class="label">Up to 60 min</span><span class="pts pos">+1</span></div>
                <div class="row highlight-row"><span class="label">60+ min</span><span class="pts pos">+1</span></div>
              </div>
            </div>

            <div class="card-section">
              <div class="section-title">⭐ Bonus</div>
              <div class="rows">
                <div class="row"><span class="pos-tag gk">GK</span><span class="label">Every 3 saves</span><span class="pts pos">+1</span></div>
                <div class="row"><span class="pos-tag fwd">FWD</span><span class="label">Every 2 shots on target</span><span class="pts pos">+1</span></div>
              </div>
            </div>

            <div class="card-section">
              <div class="section-title">🅰️ Assists</div>
              <div class="rows">
                <div class="row"><span class="label">Any position</span><span class="pts pos">+3</span></div>
              </div>
            </div>
          </div>

          <!-- Column 2: Goals Scored -->
          <div class="col">
            <div class="card-section full-col">
              <div class="section-title">⚽ Goals Scored</div>
              <div class="goal-grid">
                <div class="goal-cell gk-cell"><span class="pos-tag gk">GK</span><span class="goal-pts">+9</span></div>
                <div class="goal-cell def-cell"><span class="pos-tag def">DEF</span><span class="goal-pts">+7</span></div>
                <div class="goal-cell mid-cell"><span class="pos-tag mid">MID</span><span class="goal-pts">+6</span></div>
                <div class="goal-cell fwd-cell"><span class="pos-tag fwd">FWD</span><span class="goal-pts">+5</span></div>
              </div>
            </div>

            <div class="card-section">
              <div class="section-title">🟨 Discipline</div>
              <div class="rows">
                <div class="row"><span class="label">Yellow card</span><span class="pts neg">−1</span></div>
                <div class="row"><span class="label">Red card</span><span class="pts neg">−2</span></div>
                <div class="row"><span class="label">Own goal</span><span class="pts neg">−2</span></div>
              </div>
            </div>
          </div>

          <!-- Column 3: Clean Sheet + Goals Conceded + Captain -->
          <div class="col">
            <div class="card-section">
              <div class="section-title">🛡️ Clean Sheet <span class="section-hint">60+ min</span></div>
              <div class="rows">
                <div class="row"><span class="pos-tag gk">GK</span><span class="pos-tag def">DEF</span><span class="pts pos" style="margin-left:auto">+5</span></div>
                <div class="row"><span class="pos-tag mid">MID</span><span class="pts pos" style="margin-left:auto">+1</span></div>
                <div class="row"><span class="pos-tag fwd">FWD</span><span class="pts neutral" style="margin-left:auto">0</span></div>
              </div>
            </div>

            <div class="card-section">
              <div class="section-title">🚨 Goals Conceded <span class="section-hint">GK &amp; DEF</span></div>
              <div class="rows">
                <div class="row"><span class="label">0–1 conceded</span><span class="pts neutral">0</span></div>
                <div class="row"><span class="label">Each goal after 1st</span><span class="pts neg">−1</span></div>
              </div>
            </div>

            <div class="captain-banner">
              <div class="captain-left">
                <span class="c-badge">C</span>
                <div>
                  <div class="c-title">Captain Bonus</div>
                  <div class="c-sub">VC gets ×2 if captain didn't play</div>
                </div>
              </div>
              <span class="c-pts">×2</span>
            </div>
          </div>

        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .guide-wrap {
      background: #f8f9ff;
      border: 1px solid #e0e0e0;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(26,35,126,0.07);
    }

    .guide-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 13px 20px;
      background: linear-gradient(135deg, #1a237e 0%, #3949ab 100%);
    }
    .guide-header.clickable { cursor: pointer; user-select: none; }
    .guide-header.clickable:hover { filter: brightness(1.08); }
    .guide-title {
      display: flex; align-items: center; gap: 10px;
      font-size: 15px; font-weight: 800; color: #fff;
    }
    .title-icon { font-size: 20px; width: 20px; height: 20px; color: #ffd54f; }
    .chevron { color: rgba(255,255,255,0.8); }

    /* 3-column body */
    .guide-body {
      padding: 12px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      align-items: start;
    }

    .col { display: flex; flex-direction: column; gap: 10px; }

    .card-section {
      background: #fff;
      border: 1px solid #e8eaf6;
      border-radius: 12px;
      padding: 10px 12px;
    }

    .section-title {
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: 0.7px; color: #3949ab; margin-bottom: 8px;
      display: flex; align-items: center; gap: 5px;
    }
    .section-hint {
      font-size: 9px; font-weight: 700; background: #e8eaf6;
      color: #5c6bc0; border-radius: 4px; padding: 1px 5px;
      text-transform: none; letter-spacing: 0;
    }

    /* Goal grid */
    .goal-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }
    .goal-cell {
      display: flex; flex-direction: column; align-items: center;
      border-radius: 10px; padding: 8px 4px; gap: 5px;
      border: 1px solid transparent;
    }
    .gk-cell  { background: #fff8f0; border-color: #ffe0b2; }
    .def-cell { background: #f1f8f1; border-color: #c8e6c9; }
    .mid-cell { background: #e8f4fd; border-color: #bbdefb; }
    .fwd-cell { background: #fdf0f3; border-color: #f8bbd0; }
    .goal-pts { font-size: 18px; font-weight: 900; color: #1b5e20; }

    /* Rows */
    .rows { display: flex; flex-direction: column; gap: 5px; }
    .row {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 8px; border-radius: 8px;
      background: #f8f9ff; border: 1px solid #e8eaf6;
    }
    .highlight-row { background: #f1f8e9; border-color: #c8e6c9; }
    .label { flex: 1; font-size: 12px; color: #333; font-weight: 500; }
    .muted { font-size: 10px; color: #999; font-weight: 400; }

    .pts { font-size: 13px; font-weight: 900; min-width: 28px; text-align: right; }
    .pts.pos { color: #2e7d32; }
    .pts.neg { color: #c62828; }
    .pts.neutral { color: #9e9e9e; }

    .pos-tag {
      font-size: 9px; font-weight: 800; padding: 2px 5px;
      border-radius: 4px; flex-shrink: 0;
    }
    .pos-tag.gk  { background: #fff3e0; color: #e65100; }
    .pos-tag.def { background: #e8f5e9; color: #2e7d32; }
    .pos-tag.mid { background: #e3f2fd; color: #1565c0; }
    .pos-tag.fwd { background: #fce4ec; color: #c62828; }

    /* Captain banner */
    .captain-banner {
      display: flex; align-items: center; justify-content: space-between;
      background: linear-gradient(135deg, #fff8e1, #fff9c4);
      border: 1.5px solid #ffe082; border-radius: 12px; padding: 10px 14px;
    }
    .captain-left { display: flex; align-items: center; gap: 10px; }
    .c-badge {
      width: 34px; height: 34px; border-radius: 50%;
      background: linear-gradient(135deg, #f9a825, #ffb300);
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 900; flex-shrink: 0;
      box-shadow: 0 2px 6px rgba(249,168,37,0.35);
    }
    .c-title { font-size: 12px; font-weight: 800; color: #5d4037; }
    .c-sub { font-size: 10px; color: #8d6e00; margin-top: 2px; }
    .c-pts { font-size: 22px; font-weight: 900; color: #f9a825; }

    @media (max-width: 700px) {
      .guide-body { grid-template-columns: 1fr; }
    }
  `]
})
export class PointsGuideComponent {
  compact = input(false);
  collapsible = input(false);
  open = true;

  toggle() {
    if (this.collapsible()) this.open = !this.open;
  }

  ngOnInit() {
    this.open = !this.collapsible();
  }
}
