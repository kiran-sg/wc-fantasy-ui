import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { UserSquad } from '../../models/models';

interface PlayerBreakdown {
  name: string;
  position: string;
  isCaptain: boolean;
  isVC: boolean;
  isBench: boolean;
  mins: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  saves: number;
  shotsOnTarget: number;
  goalsConceded: number;
  basePts: number;
  finalPts: number;
  hasStats: boolean;
}

@Component({
  selector: 'app-my-picks',
  standalone: true,
  imports: [RouterLink, MatCardModule, MatIconModule, MatButtonModule, FormsModule],
  template: `
    <h3 class="page-title">My Picks</h3>

    @if (loading()) {
      <div class="empty"><p>Loading your squads...</p></div>
    } @else if (squads().length === 0) {
      <div class="empty">
        <mat-icon>sports_soccer</mat-icon>
        <p>No squads picked yet.</p>
        <a mat-flat-button color="primary" routerLink="/matches">View Matches</a>
      </div>
    } @else {

      <!-- Summary bar -->
      <div class="summary-bar">
        <div class="summary-item">
          <span class="s-num">{{ squads().length }}</span>
          <span class="s-lbl">Squads</span>
        </div>
        <div class="summary-item">
          <span class="s-num">{{ scoredCount() }}</span>
          <span class="s-lbl">Scored</span>
        </div>
        <div class="summary-item hi">
          <span class="s-num">{{ totalPoints() }}</span>
          <span class="s-lbl">Total pts</span>
        </div>
        <div class="summary-item">
          <span class="s-num">{{ bestPoints() }}</span>
          <span class="s-lbl">Best match</span>
        </div>
      </div>

      <!-- Search bar -->
      <div class="search-bar">
        <mat-icon class="search-icon">search</mat-icon>
        <input class="search-input" placeholder="Search by team or date…"
          [(ngModel)]="searchText" (ngModelChange)="filterSquads()">
        @if (searchText) {
          <button class="clear-btn" (click)="searchText=''; filterSquads()">
            <mat-icon>close</mat-icon>
          </button>
        }
      </div>

      @if (filteredSquads().length === 0) {
        <div class="empty small">
          <mat-icon>search_off</mat-icon>
          <p>No squads match "{{ searchText }}"</p>
        </div>
      }

      @for (sq of filteredSquads(); track sq.id) {
        <mat-card class="squad-card" appearance="outlined">

          <!-- Card header -->
          <div class="card-header"
            [class.scored]="sq.pointsEarned > 0"
            [class.completed]="sq.match.status === 'COMPLETED'">
            <div class="header-left">
              <div class="match-teams">
                @if (sq.match.teamA.flagUrl) {
                  <img class="flag" [src]="sq.match.teamA.flagUrl" [alt]="sq.match.teamA.name">
                }
                <span class="team-name">{{ sq.match.teamA.name }}</span>
                @if (sq.match.status === 'COMPLETED') {
                  <span class="score-inline">{{ sq.match.scoreA }} – {{ sq.match.scoreB }}</span>
                } @else {
                  <span class="vs-inline">vs</span>
                }
                <span class="team-name">{{ sq.match.teamB.name }}</span>
                @if (sq.match.teamB.flagUrl) {
                  <img class="flag" [src]="sq.match.teamB.flagUrl" [alt]="sq.match.teamB.name">
                }
              </div>
              <div class="meta-row">
                <span class="status-chip" [class]="sq.match.status.toLowerCase()">{{ statusLabel(sq.match.status) }}</span>
                <span class="match-date">{{ formatDate(sq.match.matchTime) }}</span>
                <span class="stage-tag">{{ sq.match.stage }}</span>
              </div>
            </div>
            <div class="pts-box"
              [class.zero]="sq.match.status === 'COMPLETED' && sq.pointsEarned === 0"
              [class.pending]="sq.match.status !== 'COMPLETED'">
              @if (sq.match.status === 'COMPLETED') {
                <span class="pts-num">{{ sq.pointsEarned }}</span>
                <span class="pts-lbl">pts</span>
              } @else {
                <mat-icon class="pending-icon">schedule</mat-icon>
                <span class="pts-lbl">pending</span>
              }
            </div>
          </div>

          <!-- Players by position -->
          <div class="players-body">
            @for (pos of positions; track pos) {
              @let posPlayers = byPos(sq.players, pos);
              @if (posPlayers.length > 0) {
                <div class="pos-row">
                  <span class="pos-badge" [class]="pos.toLowerCase()">{{ pos }}</span>
                  <div class="player-chips">
                    @for (p of posPlayers; track p.id) {
                      <span class="p-chip"
                        [class.is-captain]="p.id === sq.captain.id"
                        [class.is-vc]="p.id === sq.viceCaptain.id">
                        {{ p.name }}
                        @if (p.id === sq.captain.id) { <span class="role-tag c">C</span> }
                        @if (p.id === sq.viceCaptain.id) { <span class="role-tag vc">VC</span> }
                      </span>
                    }
                  </div>
                </div>
              }
            }
            @if (sq.bench.length) {
              <div class="pos-row bench-row">
                <span class="pos-badge bench">BENCH</span>
                <div class="player-chips">
                  @for (p of sq.bench; track p.id) {
                    <span class="p-chip p-bench">{{ p.name }}</span>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Points breakdown (completed only) -->
          @if (sq.match.status === 'COMPLETED') {
            <div class="breakdown-toggle" (click)="toggleBreakdown(sq)">
              <mat-icon class="breakdown-icon">analytics</mat-icon>
              <span>{{ breakdownOpen() === sq.id ? 'Hide' : 'View' }} Points Breakdown</span>
              <mat-icon class="chevron">{{ breakdownOpen() === sq.id ? 'expand_less' : 'expand_more' }}</mat-icon>
            </div>

            @if (breakdownOpen() === sq.id) {
              @if (loadingBreakdown()) {
                <div class="breakdown-loading">Loading stats...</div>
              } @else {
                @let rows = breakdownRows();
                @if (rows.length === 0) {
                  <div class="breakdown-loading">No stats available for this match yet.</div>
                } @else {
                  <div class="breakdown-section">

                    <!-- Column headers -->
                    <div class="bd-header">
                      <span class="bd-player">Player</span>
                      <span class="bd-col" title="Minutes Played">Mins</span>
                      <span class="bd-col" title="Goals">⚽</span>
                      <span class="bd-col" title="Assists">🅰️</span>
                      <span class="bd-col" title="Clean Sheet">🛡️</span>
                      <span class="bd-col" title="Yellow Card">🟨</span>
                      <span class="bd-col" title="Red Card">🟥</span>
                      <span class="bd-col" title="Bonus (saves / shots on target / goals conceded)">★</span>
                      <span class="bd-pts">Pts</span>
                    </div>

                    @for (r of rows; track r.name) {
                      <div class="bd-row" [class.no-stats]="!r.hasStats" [class.bench-row-bd]="r.isBench">
                        <!-- Player name + role -->
                        <span class="bd-player">
                          <span class="bd-pos" [class]="r.position.toLowerCase()">{{ r.position }}</span>
                          <span class="bd-name">{{ r.name }}</span>
                          @if (r.isCaptain) { <span class="role-tag c">C</span> }
                          @if (r.isVC)      { <span class="role-tag vc">VC</span> }
                          @if (r.isBench)   { <span class="bench-tag">BENCH</span> }
                        </span>

                        @if (!r.hasStats) {
                          <span class="bd-col no-data" colspan="7">—</span>
                          <span class="bd-col no-data"></span>
                          <span class="bd-col no-data"></span>
                          <span class="bd-col no-data"></span>
                          <span class="bd-col no-data"></span>
                          <span class="bd-col no-data"></span>
                          <span class="bd-col no-data"></span>
                        } @else {
                          <span class="bd-col">{{ r.mins }}</span>
                          <span class="bd-col" [class.val-pos]="r.goals > 0">{{ r.goals || '—' }}</span>
                          <span class="bd-col" [class.val-pos]="r.assists > 0">{{ r.assists || '—' }}</span>
                          <span class="bd-col" [class.val-pos]="r.cleanSheet">{{ r.cleanSheet ? '✓' : '—' }}</span>
                          <span class="bd-col" [class.val-neg]="r.yellowCards > 0">{{ r.yellowCards || '—' }}</span>
                          <span class="bd-col" [class.val-neg]="r.redCards > 0">{{ r.redCards || '—' }}</span>
                          <span class="bd-col" [class.val-pos]="bonusPts(r) > 0" [class.val-neg]="bonusPts(r) < 0">
                            {{ bonusPts(r) !== 0 ? bonusPts(r) : '—' }}
                          </span>
                        }

                        <!-- Final pts -->
                        <span class="bd-pts" [class.pts-pos]="r.finalPts > 0" [class.pts-neg]="r.finalPts < 0">
                          {{ r.hasStats ? r.finalPts : '—' }}
                          @if (r.isCaptain && r.hasStats) { <span class="x2-tag">×2</span> }
                        </span>
                      </div>
                    }

                    <!-- Total row -->
                    <div class="bd-total">
                      <span class="bd-player">
                        <mat-icon class="total-icon">calculate</mat-icon>
                        Total (starters)
                      </span>
                      <span class="bd-col"></span>
                      <span class="bd-col"></span>
                      <span class="bd-col"></span>
                      <span class="bd-col"></span>
                      <span class="bd-col"></span>
                      <span class="bd-col"></span>
                      <span class="bd-col"></span>
                      <span class="bd-pts total-pts">{{ sq.pointsEarned }}</span>
                    </div>

                  </div>
                }
              }
            }
          }

          <!-- Footer -->
          <div class="card-footer">
            @if (sq.match.status === 'UPCOMING') {
              <a mat-stroked-button [routerLink]="['/squad', sq.match.id]" class="edit-btn">
                <mat-icon>edit</mat-icon> Edit Squad
              </a>
            }
            @if (sq.match.status === 'LIVE') {
              <a mat-flat-button color="warn" [routerLink]="['/live', sq.match.id]">🔴 Go Live</a>
            }
            @if (sq.match.status === 'COMPLETED') {
              <a mat-stroked-button routerLink="/leaderboard" class="lb-btn">
                <mat-icon>leaderboard</mat-icon> Leaderboard
              </a>
            }
          </div>

        </mat-card>
      }
    }
  `,
  styles: [`
    .page-title { color: #1a237e; font-size: 20px; font-weight: 700; margin: 0 0 16px; }

    .empty {
      text-align: center; padding: 48px 16px; color: #9e9e9e;
      display: flex; flex-direction: column; align-items: center; gap: 12px;
    }
    .empty.small { padding: 24px; }
    .empty mat-icon { font-size: 48px; width: 48px; height: 48px; opacity: 0.4; }
    .empty p { margin: 0; font-size: 14px; }

    /* Summary */
    .summary-bar {
      display: flex; gap: 0; margin-bottom: 16px;
      background: #1a237e; border-radius: 12px; overflow: hidden;
    }
    .summary-item {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      padding: 14px 8px; border-right: 1px solid rgba(255,255,255,0.12);
    }
    .summary-item:last-child { border-right: none; }
    .summary-item.hi { background: rgba(255,255,255,0.1); }
    .s-num { font-size: 24px; font-weight: 800; color: #fff; line-height: 1; }
    .s-lbl { font-size: 10px; color: rgba(255,255,255,0.7); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Search */
    .search-bar {
      display: flex; align-items: center; gap: 8px; background: #fff;
      border-radius: 10px; padding: 10px 12px; border: 1px solid #e0e0e0;
      margin-bottom: 16px; min-height: 44px; transition: border-color 0.15s;
    }
    .search-bar:focus-within { border-color: #1a237e; }
    .search-icon { color: #999; font-size: 20px; width: 20px; height: 20px; flex-shrink: 0; }
    .search-input { flex: 1; border: none; outline: none; background: transparent; font-size: 14px; color: #222; }
    .clear-btn {
      border: none; background: none; cursor: pointer; padding: 4px;
      display: flex; align-items: center; color: #aaa; border-radius: 50%;
    }
    .clear-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .clear-btn:hover { color: #555; background: #f0f0f0; }

    /* Card */
    .squad-card { margin-bottom: 14px; padding: 0 !important; overflow: hidden; border-radius: 14px !important; }

    .card-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      padding: 14px 16px; background: #fafafa; border-bottom: 1px solid #f0f0f0; gap: 12px;
    }
    .card-header.completed { background: #f5f9ff; }
    .card-header.scored { background: #f1f8e9; }
    .header-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .match-teams { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .flag { width: 22px; height: 16px; object-fit: cover; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .team-name { font-size: 14px; font-weight: 700; color: #1a1a1a; }
    .vs-inline { font-size: 11px; color: #aaa; font-weight: 600; }
    .score-inline { font-size: 16px; font-weight: 900; color: #1a237e; padding: 0 2px; }
    .meta-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .status-chip { font-size: 10px; padding: 2px 7px; border-radius: 10px; font-weight: 700; }
    .status-chip.upcoming { background: #c8e6c9; color: #2e7d32; }
    .status-chip.live { background: #ffcdd2; color: #c62828; }
    .status-chip.completed { background: #e3f2fd; color: #1565c0; }
    .match-date { font-size: 11px; color: #888; }
    .stage-tag { font-size: 10px; color: #999; font-weight: 600; text-transform: uppercase; }

    .pts-box {
      display: flex; flex-direction: column; align-items: center;
      background: #1a237e; border-radius: 10px; padding: 10px 14px;
      min-width: 60px; flex-shrink: 0;
    }
    .pts-box.zero { background: #ef9a9a; }
    .pts-box.pending { background: #eeeeee; }
    .pts-num { font-size: 26px; font-weight: 900; color: #fff; line-height: 1; }
    .pts-lbl { font-size: 10px; color: rgba(255,255,255,0.75); margin-top: 2px; text-transform: uppercase; }
    .pts-box.pending .pts-lbl { color: #888; }
    .pending-icon { font-size: 22px; width: 22px; height: 22px; color: #aaa; }

    /* Players */
    .players-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
    .pos-row { display: flex; align-items: flex-start; gap: 10px; }
    .bench-row { border-top: 1px dashed #e0e0e0; padding-top: 8px; margin-top: 2px; }
    .pos-badge {
      font-size: 9px; font-weight: 800; padding: 3px 6px; border-radius: 5px;
      min-width: 34px; text-align: center; flex-shrink: 0; margin-top: 3px;
    }
    .pos-badge.gk  { background: #fff3e0; color: #e65100; }
    .pos-badge.def { background: #e8f5e9; color: #2e7d32; }
    .pos-badge.mid { background: #e3f2fd; color: #1565c0; }
    .pos-badge.fwd { background: #fce4ec; color: #c62828; }
    .pos-badge.bench { background: #f5f5f5; color: #757575; }
    .player-chips { display: flex; flex-wrap: wrap; gap: 5px; }
    .p-chip {
      display: inline-flex; align-items: center; gap: 4px;
      background: #f5f5f5; border-radius: 20px; padding: 4px 10px;
      font-size: 12px; font-weight: 500; color: #333; border: 1px solid #eeeeee;
    }
    .p-chip.is-captain { background: #fff9c4; border-color: #ffe082; }
    .p-chip.is-vc { background: #f3e5f5; border-color: #ce93d8; }
    .p-chip.p-bench { color: #888; background: #fafafa; }
    .role-tag { font-size: 9px; font-weight: 900; padding: 1px 4px; border-radius: 4px; line-height: 1.4; }
    .role-tag.c  { background: #f9a825; color: #fff; }
    .role-tag.vc { background: #9c27b0; color: #fff; }

    /* Breakdown toggle */
    .breakdown-toggle {
      display: flex; align-items: center; gap: 6px;
      padding: 10px 16px; border-top: 1px solid #f0f0f0;
      cursor: pointer; font-size: 13px; font-weight: 600; color: #1a237e;
      background: #f5f7ff; user-select: none; transition: background 0.15s;
    }
    .breakdown-toggle:hover { background: #eef1ff; }
    .breakdown-icon { font-size: 18px; width: 18px; height: 18px; }
    .breakdown-toggle span { flex: 1; }
    .chevron { font-size: 18px; width: 18px; height: 18px; color: #888; }

    .breakdown-loading {
      padding: 16px; text-align: center; font-size: 13px; color: #888;
      border-top: 1px solid #f0f0f0;
    }

    /* Breakdown table */
    .breakdown-section { border-top: 1px solid #e8eaf6; overflow-x: auto; }

    .bd-header, .bd-row, .bd-total {
      display: grid;
      grid-template-columns: 1fr 42px 32px 32px 32px 32px 32px 36px 52px;
      align-items: center; padding: 7px 12px; gap: 2px;
    }
    .bd-header {
      background: #e8eaf6; font-size: 10px; font-weight: 700;
      color: #3949ab; text-transform: uppercase; letter-spacing: 0.3px;
    }
    .bd-row { border-bottom: 1px solid #f5f5f5; font-size: 12px; }
    .bd-row:hover { background: #fafafa; }
    .bd-row.no-stats { opacity: 0.5; }
    .bd-row.bench-row-bd { background: #fffde7; }
    .bd-total {
      background: #e8eaf6; font-size: 12px; font-weight: 700; color: #1a237e;
      border-top: 2px solid #c5cae9;
    }

    .bd-player {
      display: flex; align-items: center; gap: 5px;
      min-width: 0; overflow: hidden;
    }
    .bd-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bd-pos {
      font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 3px; flex-shrink: 0;
    }
    .bd-pos.gk  { background: #fff3e0; color: #e65100; }
    .bd-pos.def { background: #e8f5e9; color: #2e7d32; }
    .bd-pos.mid { background: #e3f2fd; color: #1565c0; }
    .bd-pos.fwd { background: #fce4ec; color: #c62828; }
    .bench-tag { font-size: 8px; background: #f5f5f5; color: #888; padding: 1px 4px; border-radius: 3px; }

    .bd-col { text-align: center; font-size: 12px; color: #444; }
    .no-data { color: #ccc; }
    .val-pos { color: #2e7d32; font-weight: 700; }
    .val-neg { color: #c62828; font-weight: 700; }

    .bd-pts {
      text-align: right; font-size: 13px; font-weight: 800;
      color: #555; display: flex; align-items: center; justify-content: flex-end; gap: 3px;
    }
    .pts-pos { color: #2e7d32; }
    .pts-neg { color: #c62828; }
    .total-pts { font-size: 15px; color: #1a237e; }
    .x2-tag {
      font-size: 9px; background: #f9a825; color: #fff;
      padding: 1px 4px; border-radius: 4px; font-weight: 800;
    }
    .total-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 4px; }

    /* Footer */
    .card-footer { padding: 10px 16px; border-top: 1px solid #f0f0f0; display: flex; gap: 8px; }
    .edit-btn { font-size: 13px; }
    .lb-btn { font-size: 13px; }
  `]
})
export class MyPicksComponent implements OnInit {
  private api  = inject(ApiService);
  private auth = inject(AuthService);

  squads         = signal<UserSquad[]>([]);
  filteredSquads = signal<UserSquad[]>([]);
  loading        = signal(true);
  searchText     = '';
  positions      = ['GK', 'DEF', 'MID', 'FWD'];

  // Breakdown state
  breakdownOpen    = signal<number | null>(null);
  breakdownRows    = signal<PlayerBreakdown[]>([]);
  loadingBreakdown = signal(false);
  private statsCache = new Map<number, any[]>();
  private currentSq: UserSquad | null = null;

  totalPoints = computed(() => this.squads().reduce((s, sq) => s + (sq.pointsEarned ?? 0), 0));
  scoredCount = computed(() => this.squads().filter(sq => sq.match.status === 'COMPLETED').length);
  bestPoints  = computed(() => this.squads().reduce((m, sq) => Math.max(m, sq.pointsEarned ?? 0), 0));

  ngOnInit() {
    const userId = this.auth.getUserId();
    if (!userId) { this.loading.set(false); return; }
    this.api.getUserSquads(+userId).subscribe({
      next: squads => {
        const sorted = [...squads].sort(
          (a, b) => new Date(b.match.matchTime).getTime() - new Date(a.match.matchTime).getTime()
        );
        this.squads.set(sorted);
        this.filteredSquads.set(sorted);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  // ── Breakdown ─────────────────────────────────────────────────────────────

  toggleBreakdown(sq: UserSquad) {
    if (this.breakdownOpen() === sq.id) {
      this.breakdownOpen.set(null);
      return;
    }
    this.breakdownOpen.set(sq.id);
    this.currentSq = sq;
    if (this.statsCache.has(sq.match.id)) {
      this.buildBreakdown(sq, this.statsCache.get(sq.match.id)!);
      return;
    }
    this.loadingBreakdown.set(true);
    this.breakdownRows.set([]);
    this.api.adminGetMatchStats(sq.match.id).subscribe({
      next: stats => {
        this.statsCache.set(sq.match.id, stats);
        this.buildBreakdown(sq, stats);
        this.loadingBreakdown.set(false);
      },
      error: () => this.loadingBreakdown.set(false)
    });
  }

  private buildBreakdown(sq: UserSquad, stats: any[]) {
    const statsById = new Map<number, any>(stats.map(s => [s.player.id, s]));
    const allPlayers = [
      ...(sq.players || []).map(p => ({ p, bench: false })),
      ...(sq.bench   || []).map(p => ({ p, bench: true  })),
    ];

    const rows: PlayerBreakdown[] = allPlayers.map(({ p, bench }) => {
      const s = statsById.get(p.id);
      const isCaptain = p.id === sq.captain.id;
      const isVC      = p.id === sq.viceCaptain.id;

      if (!s) {
        return {
          name: p.name, position: p.position,
          isCaptain, isVC, isBench: bench,
          mins: 0, goals: 0, assists: 0, cleanSheet: false,
          yellowCards: 0, redCards: 0, ownGoals: 0,
          saves: 0, shotsOnTarget: 0, goalsConceded: 0,
          basePts: 0, finalPts: 0, hasStats: false
        };
      }

      // Use totalPoints from DB — populated by backend after calculatePoints()
      const base  = s.totalPoints ?? 0;
      // Bench players never contribute to squad total; captain gets ×2
      const final = bench ? 0 : (isCaptain ? base * 2 : base);
      return {
        name: p.name, position: p.position,
        isCaptain, isVC, isBench: bench,
        mins:          s.minutesPlayed   ?? 0,
        goals:         s.goals           ?? 0,
        assists:       s.assists         ?? 0,
        cleanSheet:    s.cleanSheet      ?? false,
        yellowCards:   s.yellowCards     ?? 0,
        redCards:      s.redCards        ?? 0,
        ownGoals:      s.ownGoals        ?? 0,
        saves:         s.saves           ?? 0,
        shotsOnTarget: s.shotsOnTarget   ?? 0,
        goalsConceded: s.goalsConceded   ?? 0,
        basePts: base, finalPts: final, hasStats: true
      };
    });

    // Sort: starters first (by position order), then bench
    const order: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    rows.sort((a, b) => {
      if (a.isBench !== b.isBench) return a.isBench ? 1 : -1;
      return (order[a.position] ?? 9) - (order[b.position] ?? 9);
    });

    this.breakdownRows.set(rows);
  }

  private computeBase(s: any): number {
    const mins = s.minutesPlayed ?? 0;
    if (mins === 0) return 0; // DNP — no points, no penalties
    let pts = 0;
    const pos = s.player?.position || '';
    if (mins >= 60) pts += 2; else pts += 1;
    const gp: Record<string, number> = { GK: 9, DEF: 7, MID: 6, FWD: 5 };
    pts += (s.goals ?? 0) * (gp[pos] ?? 6);
    pts += (s.assists ?? 0) * 3;
    if (s.cleanSheet) {
      if (pos === 'GK' || pos === 'DEF') pts += 5;
      else if (pos === 'MID') pts += 1;
    }
    if (pos === 'GK' || pos === 'DEF') {
      const gc = s.goalsConceded ?? 0;
      if (gc > 1) pts -= (gc - 1);
    }
    pts -= (s.yellowCards ?? 0);
    pts -= (s.redCards ?? 0) * 2;
    pts -= (s.ownGoals ?? 0) * 2;
    if (pos === 'GK') pts += Math.floor((s.saves ?? 0) / 3);
    if (pos === 'FWD') pts += Math.floor((s.shotsOnTarget ?? 0) / 2);
    return pts;
  }

  bonusPts(r: PlayerBreakdown): number {
    if (r.mins === 0 || r.isBench) return 0;
    let b = 0;
    const pos = r.position;
    if (pos === 'GK' || pos === 'DEF') {
      const gc = r.goalsConceded;
      if (gc > 1) b -= (gc - 1);
    }
    if (pos === 'GK') b += Math.floor(r.saves / 3);
    if (pos === 'FWD') b += Math.floor(r.shotsOnTarget / 2);
    b -= r.ownGoals * 2;
    return b;
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  filterSquads() {
    const q = this.searchText.trim().toLowerCase();
    if (!q) { this.filteredSquads.set(this.squads()); return; }
    const norm = (s: string) => s.toLowerCase()
      .replace(/\bjanuary\b/, 'jan').replace(/\bfebruary\b/, 'feb')
      .replace(/\bmarch\b/, 'mar').replace(/\bapril\b/, 'apr')
      .replace(/\bjune\b/, 'jun').replace(/\bjuly\b/, 'jul')
      .replace(/\baugust\b/, 'aug').replace(/\bseptember\b/, 'sep')
      .replace(/\boctober\b/, 'oct').replace(/\bnovember\b/, 'nov')
      .replace(/\bdecember\b/, 'dec');
    const nq = norm(q);
    this.filteredSquads.set(this.squads().filter(sq => {
      const teams = `${sq.match.teamA.name} ${sq.match.teamB.name}`.toLowerCase();
      const date  = norm(this.formatDate(sq.match.matchTime).toLowerCase());
      return teams.includes(nq) || date.includes(nq);
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  byPos(players: any[], pos: string): any[] {
    return (players || []).filter(p => p.position === pos);
  }

  statusLabel(status: string): string {
    if (status === 'LIVE') return '🔴 LIVE';
    if (status === 'COMPLETED') return '✅ Full Time';
    return '🟢 Open';
  }

  formatDate(dt: string): string {
    return new Date(dt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
