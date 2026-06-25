import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Player, UserSquad, Match } from '../../models/models';

@Component({
  selector: 'app-live-match',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatChipsModule, MatProgressSpinnerModule],
  template: `
    <h3 class="page-title">🔴 Live Match</h3>

    @if (loading()) {
      <div class="center"><mat-spinner diameter="40"></mat-spinner></div>
    }

    @if (match()) {
      <mat-card class="match-banner">
        <div class="match-score">
          <span class="team">{{ match()!.teamA.name }}</span>
          <span class="score">{{ match()!.scoreA }} - {{ match()!.scoreB }}</span>
          <span class="team">{{ match()!.teamB.name }}</span>
        </div>
        <div class="status-chip" [class.live]="match()!.status === 'LIVE'">
          {{ match()!.status }}
        </div>
      </mat-card>
    }

    @if (squad()) {
      <!-- Captain change section -->
      <mat-card class="section-card">
        <div class="section-title">🎖️ Captain Change
          <span class="hint">(new captain must not have played; old must have finished)</span>
        </div>
        <div class="player-grid">
          @for (p of squad()!.players; track p.id) {
            <div class="player-tile"
              [class.is-captain]="squad()!.captain.id === p.id"
              [class.is-vc]="squad()!.viceCaptain.id === p.id"
              (click)="selectNewCaptain(p)">
              <span class="pos" [class]="p.position">{{ p.position }}</span>
              <span class="pname">{{ p.name }}</span>
              @if (squad()!.captain.id === p.id) { <span class="badge cap">C</span> }
              @if (squad()!.viceCaptain.id === p.id) { <span class="badge vc">V</span> }
            </div>
          }
        </div>
        @if (capMessage()) {
          <div class="feedback" [class.error]="capMessage().startsWith('❌')">{{ capMessage() }}</div>
        }
      </mat-card>

      <!-- Manual substitution section -->
      <mat-card class="section-card">
        <div class="section-title">🔄 Manual Substitution
          <span class="hint">(bench player not yet played ↔ starter not currently playing)</span>
        </div>
        <div class="sub-layout">
          <div class="sub-col">
            <div class="sub-label">Remove from XI</div>
            @for (p of squad()!.players; track p.id) {
              <div class="player-tile selectable"
                [class.selected]="subOut()?.id === p.id"
                (click)="selectSubOut(p)">
                <span class="pos" [class]="p.position">{{ p.position }}</span>
                <span class="pname">{{ p.name }}</span>
              </div>
            }
          </div>
          <div class="sub-col">
            <div class="sub-label">Bring in from bench</div>
            @for (p of squad()!.bench; track p.id) {
              <div class="player-tile selectable"
                [class.selected]="subIn()?.id === p.id"
                (click)="selectSubIn(p)">
                <span class="pos" [class]="p.position">{{ p.position }}</span>
                <span class="pname">{{ p.name }}</span>
                <span class="bench-tag">B{{ (squad()!.bench.indexOf(p) + 1) }}</span>
              </div>
            }
            @if (!squad()!.bench.length) {
              <div class="hint-text">No bench players</div>
            }
          </div>
        </div>
        <button mat-flat-button color="accent"
          [disabled]="!subOut() || !subIn() || saving()"
          (click)="confirmSub()">
          Confirm Substitution
        </button>
        @if (subMessage()) {
          <div class="feedback" [class.error]="subMessage().startsWith('❌')">{{ subMessage() }}</div>
        }
      </mat-card>

      <!-- Warning -->
      @if (squad()!.manualChangesMade) {
        <div class="warn-banner">⚠️ Manual changes made — automatic substitutions are disabled for this round.</div>
      }
    }

    @if (!loading() && !squad()) {
      <div class="center hint-text">No squad found for this match.</div>
    }
  `,
  styles: [`
    .page-title { color: #c62828; font-size: 20px; font-weight: 700; margin: 0 0 16px; }
    .center { text-align: center; padding: 32px; }
    .match-banner { padding: 16px; margin-bottom: 12px; text-align: center; }
    .match-score { display: flex; align-items: center; justify-content: center; gap: 16px; }
    .team { font-size: 16px; font-weight: 600; }
    .score { font-size: 28px; font-weight: 800; color: #1a237e; }
    .status-chip { display: inline-block; margin-top: 8px; padding: 2px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; background: #e0e0e0; }
    .status-chip.live { background: #ffcdd2; color: #c62828; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
    .section-card { padding: 16px; margin-bottom: 12px; }
    .section-title { font-size: 14px; font-weight: 700; color: #1a237e; margin-bottom: 12px; }
    .hint { font-size: 11px; color: #888; font-weight: 400; display: block; margin-top: 2px; }
    .player-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .player-tile { display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: #f5f5f5; border-radius: 8px; cursor: pointer; border: 2px solid transparent; font-size: 13px; }
    .player-tile.is-captain { border-color: #f57c00; background: #fff3e0; }
    .player-tile.is-vc { border-color: #7b1fa2; background: #f3e5f5; }
    .player-tile.selected { border-color: #1a237e; background: #e8eaf6; }
    .player-tile.selectable:hover { border-color: #1a237e; }
    .pos { font-size: 10px; font-weight: 700; padding: 1px 4px; border-radius: 3px; background: #e3f2fd; color: #1565c0; }
    .pos.GK { background: #fff3e0; color: #e65100; }
    .pos.DEF { background: #e8f5e9; color: #2e7d32; }
    .pos.FWD { background: #fce4ec; color: #c62828; }
    .pname { font-size: 12px; }
    .badge { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 8px; }
    .badge.cap { background: #f57c00; color: white; }
    .badge.vc { background: #7b1fa2; color: white; }
    .bench-tag { font-size: 10px; color: #e65100; font-weight: 700; }
    .sub-layout { display: flex; gap: 12px; margin-bottom: 12px; }
    .sub-col { flex: 1; }
    .sub-label { font-size: 11px; font-weight: 700; color: #666; margin-bottom: 6px; text-transform: uppercase; }
    .feedback { margin-top: 8px; font-size: 12px; font-weight: 500; color: #2e7d32; }
    .feedback.error { color: #c62828; }
    .hint-text { font-size: 12px; color: #888; }
    .warn-banner { background: #fff3e0; border-left: 3px solid #ff7043; padding: 10px 14px; font-size: 12px; color: #bf360c; border-radius: 4px; }
  `]
})
export class LiveMatchComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  match = signal<Match | null>(null);
  squad = signal<UserSquad | null>(null);
  loading = signal(true);
  saving = signal(false);

  subOut = signal<Player | null>(null);
  subIn = signal<Player | null>(null);
  capMessage = signal('');
  subMessage = signal('');

  private pollInterval: any;

  ngOnInit() {
    const matchId = +this.route.snapshot.params['matchId'];
    this.loadData(matchId);
    // Poll every 30s to refresh live scores and squad state
    this.pollInterval = setInterval(() => this.loadData(matchId), 30_000);
  }

  ngOnDestroy() { clearInterval(this.pollInterval); }

  loadData(matchId: number) {
    const userId = this.auth.getUserId();
    this.api.getMatches().subscribe(matches => {
      const m = matches.find(x => x.id === matchId) ?? null;
      this.match.set(m);
    });
    if (userId) {
      this.api.getSquad(userId, matchId).subscribe({
        next: s => { this.squad.set(s); this.loading.set(false); },
        error: () => this.loading.set(false)
      });
    } else {
      this.loading.set(false);
    }
  }

  selectNewCaptain(p: Player) {
    const s = this.squad();
    if (!s) return;
    this.capMessage.set('');
    this.api.changeCaptain(s.id, p.id).subscribe({
      next: updated => {
        this.squad.set(updated);
        this.capMessage.set(`✅ Captain changed to ${p.name}`);
      },
      error: err => this.capMessage.set('❌ ' + (err.error?.message || 'Failed to change captain'))
    });
  }

  selectSubOut(p: Player) { this.subOut.set(p); }
  selectSubIn(p: Player) { this.subIn.set(p); }

  confirmSub() {
    const s = this.squad();
    const out = this.subOut();
    const inn = this.subIn();
    if (!s || !out || !inn) return;
    this.saving.set(true);
    this.subMessage.set('');
    this.api.manualSub(s.id, out.id, inn.id).subscribe({
      next: updated => {
        this.squad.set(updated);
        this.subOut.set(null);
        this.subIn.set(null);
        this.saving.set(false);
        this.subMessage.set(`✅ ${inn.name} on for ${out.name}`);
      },
      error: err => {
        this.saving.set(false);
        this.subMessage.set('❌ ' + (err.error?.message || 'Substitution failed'));
      }
    });
  }
}
