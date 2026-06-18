import { Component, inject, OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../services/api.service';
import { Match } from '../../models/models';

@Component({
  selector: 'app-admin-scores',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTableModule, MatChipsModule],
  template: `
    @if (globalLoading()) {
      <div class="overlay">
        <mat-spinner diameter="50"></mat-spinner>
        <p>{{ loadingMessage() }}</p>
      </div>
    }
    <h3 class="page-title">⚡ Admin - Score Update Panel</h3>

    @if (loading()) {
      <div class="loading"><mat-spinner diameter="40"></mat-spinner></div>
    }

    @for (match of matches(); track match.id) {
      <mat-card class="match-card" appearance="outlined">
        <div class="match-header">
          <span class="match-stage">{{ match.stage }}</span>
          <span class="match-time">{{ formatDate(match.matchTime) }}</span>
          <mat-chip [class]="match.status.toLowerCase()">{{ match.status }}</mat-chip>
        </div>
        <div class="teams">
          <span class="team-name">{{ match.teamA.name }}</span>
          @if (match.status === 'COMPLETED') {
            <span class="score">{{ match.scoreA }} - {{ match.scoreB }}</span>
          } @else {
            <span class="vs">VS</span>
          }
          <span class="team-name">{{ match.teamB.name }}</span>
        </div>
        <div class="actions">
          <button mat-flat-button color="primary" class="update-btn"
                  [disabled]="updating() === match.id"
                  (click)="updateScores(match.id)">
              🚀 {{ match.status === 'COMPLETED' ? 'Re-Update Scores' : 'Auto-Update Scores' }}
          </button>
          @if (updating() === match.id) {
            <mat-spinner diameter="20"></mat-spinner>
          }
          @if (match.status === 'COMPLETED') {
            <button mat-stroked-button (click)="viewStats(match.id)">📊 View Stats</button>
          }
          <button mat-stroked-button (click)="viewSquads(match.id)">👥 View Teams</button>
        </div>

        @if (loadingStats() && updating() === null) {
          <div class="loading"><mat-spinner diameter="24"></mat-spinner></div>
        }
        @if (statsForMatch() === match.id && playerStats().length > 0) {
          <div class="stats-table">
            <table mat-table [dataSource]="playerStats()">
              <ng-container matColumnDef="player">
                <th mat-header-cell *matHeaderCellDef>Player</th>
                <td mat-cell *matCellDef="let s">{{ s.player.name }}</td>
              </ng-container>
              <ng-container matColumnDef="goals">
                <th mat-header-cell *matHeaderCellDef>⚽</th>
                <td mat-cell *matCellDef="let s">{{ s.goals }}</td>
              </ng-container>
              <ng-container matColumnDef="assists">
                <th mat-header-cell *matHeaderCellDef>🅰️</th>
                <td mat-cell *matCellDef="let s">{{ s.assists }}</td>
              </ng-container>
              <ng-container matColumnDef="yellowCards">
                <th mat-header-cell *matHeaderCellDef>🟨</th>
                <td mat-cell *matCellDef="let s">{{ s.yellowCards }}</td>
              </ng-container>
              <ng-container matColumnDef="cleanSheet">
                <th mat-header-cell *matHeaderCellDef>🧤</th>
                <td mat-cell *matCellDef="let s">{{ s.cleanSheet ? '✓' : '' }}</td>
              </ng-container>
              <ng-container matColumnDef="mom">
                <th mat-header-cell *matHeaderCellDef>⭐</th>
                <td mat-cell *matCellDef="let s">{{ s.manOfMatch ? 'MOM' : '' }}</td>
              </ng-container>
              <ng-container matColumnDef="points">
                <th mat-header-cell *matHeaderCellDef>Pts</th>
                <td mat-cell *matCellDef="let s" class="pts-cell">{{ calcPoints(s) }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
            </table>
          </div>
        }

        @if (resultMessage() && resultMatchId() === match.id) {
          <div class="result-msg">{{ resultMessage() }}</div>
        }

        @if (loadingSquads() && updating() === null) {
          <div class="loading"><mat-spinner diameter="24"></mat-spinner></div>
        }
        @if (squadsForMatch() === match.id && matchSquads().length > 0) {
          <div class="squads-section">
            @for (squad of matchSquads(); track squad.id) {
              <div class="squad-card">
                <strong>{{ squad.user.displayName || squad.user.username }}</strong>
                <span class="pts">{{ squad.pointsEarned }} pts</span>
                <div class="squad-players">
                  @for (p of squad.players; track p.id) {
                    <span class="player-chip" [class.captain]="p.id === squad.captain?.id">
                      {{ p.name }} ({{ p.position }}){{ p.id === squad.captain?.id ? ' ⓒ' : '' }}
                    </span>
                  }
                </div>
              </div>
            }
          </div>
        }
        @if (squadsForMatch() === match.id && matchSquads().length === 0) {
          <div class="result-msg">No user teams for this match</div>
        }
      </mat-card>
    }
  `,
  styles: [`
    .page-title { color: #1a237e; font-size: 20px; font-weight: 700; margin: 0 0 20px; }
    .overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 9999; }
    .overlay p { color: #fff; margin-top: 16px; font-size: 16px; font-weight: 500; }
    .loading { text-align: center; padding: 32px; }
    .match-card { margin-bottom: 16px; padding: 16px; border-radius: 12px !important; }
    .match-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .match-stage { font-size: 11px; color: #666; font-weight: 600; text-transform: uppercase; }
    .match-time { font-size: 11px; color: #1a237e; font-weight: 500; }
    .teams { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 12px 0; }
    .team-name { font-size: 16px; font-weight: 600; }
    .vs { color: #999; font-size: 12px; }
    .score { font-size: 20px; font-weight: 700; color: #1a237e; }
    .actions { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; }
    .update-btn { font-weight: 600; }
    .btn-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 4px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .result-msg { text-align: center; color: #2e7d32; margin-top: 8px; font-weight: 500; font-size: 13px; }
    .stats-table { margin-top: 12px; overflow-x: auto; }
    table { width: 100%; }
    .completed { background: #c8e6c9 !important; }
    .upcoming { background: #fff3e0 !important; }
    .live { background: #ffcdd2 !important; }
    .squads-section { margin-top: 12px; }
    .squad-card { background: #f5f5f5; border-radius: 8px; padding: 10px; margin-bottom: 8px; }
    .squad-card strong { font-size: 14px; }
    .pts { float: right; font-weight: 600; color: #1a237e; }
    .squad-players { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
    .player-chip { font-size: 11px; background: #e0e0e0; padding: 2px 8px; border-radius: 10px; }
    .player-chip.captain { background: #fff9c4; font-weight: 600; }
    .pts-cell { font-weight: 700; color: #1a237e; }
  `]
})
export class AdminScoresComponent implements OnInit {
  private api = inject(ApiService);

  matches = signal<Match[]>([]);
  loading = signal(true);
  updating = signal<number | null>(null);
  globalLoading = signal(false);
  loadingMessage = signal('Loading...');
  playerStats = signal<any[]>([]);
  statsForMatch = signal<number | null>(null);
  resultMessage = signal('');
  resultMatchId = signal<number | null>(null);
  displayedColumns = ['player', 'goals', 'assists', 'yellowCards', 'cleanSheet', 'mom', 'points'];
  matchSquads = signal<any[]>([]);
  squadsForMatch = signal<number | null>(null);
  loadingStats = signal(false);
  loadingSquads = signal(false);

  ngOnInit() {
    this.loadMatches();
  }

  loadMatches() {
    this.globalLoading.set(true);
    this.loadingMessage.set('Loading matches...');
    this.api.adminGetMatches().subscribe({
      next: (m) => { this.matches.set(m); this.loading.set(false); this.globalLoading.set(false); },
      error: () => { this.loading.set(false); this.globalLoading.set(false); }
    });
  }

  updateScores(matchId: number) {
    this.updating.set(matchId);
    this.globalLoading.set(true);
    this.loadingMessage.set('Fetching real scores from ESPN...');
    this.resultMessage.set('');
    this.api.adminUpdateScores(matchId).subscribe({
      next: (res) => {
        this.updating.set(null);
        this.globalLoading.set(false);
        if (res.status === 'success') {
          this.resultMessage.set(`✅ ${res.scoreA} - ${res.scoreB} | ${res.statsCount} player stats`);
          this.resultMatchId.set(matchId);
          this.loadMatches();
          // Show detailed breakdown
          this.loadingStats.set(true);
          this.loadingSquads.set(true);
          this.api.adminGetMatchStats(matchId).subscribe(stats => {
            this.playerStats.set(stats);
            this.statsForMatch.set(matchId);
            this.loadingStats.set(false);
          });
          this.api.adminGetMatchSquads(matchId).subscribe(squads => {
            this.matchSquads.set(squads);
            this.squadsForMatch.set(matchId);
            this.loadingSquads.set(false);
          });
        } else {
          this.resultMessage.set('❌ ' + res.message);
          this.resultMatchId.set(matchId);
        }
      },
      error: (err) => {
        this.updating.set(null);
        this.globalLoading.set(false);
        this.resultMessage.set('❌ Error: ' + (err.error?.message || 'Failed to update'));
        this.resultMatchId.set(matchId);
      }
    });
  }

  formatDate(dateTime: string): string {
    return new Date(dateTime).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  calcPoints(s: any): number {
    let pts = 0;
    pts += (s.goals || 0) * 6;
    pts += (s.assists || 0) * 4;
    if (s.cleanSheet) pts += 4;
    pts -= (s.yellowCards || 0);
    pts -= (s.redCards || 0) * 3;
    if (s.manOfMatch) pts += 3;
    if (s.minutesPlayed > 0) pts += 1;
    return pts;
  }

  viewStats(matchId: number) {
    if (this.statsForMatch() === matchId) {
      this.statsForMatch.set(null);
      return;
    }
    this.globalLoading.set(true);
    this.loadingMessage.set('Loading player stats...');
    this.loadingStats.set(true);
    this.api.adminGetMatchStats(matchId).subscribe(stats => {
      this.playerStats.set(stats);
      this.statsForMatch.set(matchId);
      this.loadingStats.set(false);
      this.globalLoading.set(false);
    });
  }

  viewSquads(matchId: number) {
    if (this.squadsForMatch() === matchId) {
      this.squadsForMatch.set(null);
      return;
    }
    this.globalLoading.set(true);
    this.loadingMessage.set('Loading user teams...');
    this.loadingSquads.set(true);
    this.api.adminGetMatchSquads(matchId).subscribe(squads => {
      this.matchSquads.set(squads);
      this.squadsForMatch.set(matchId);
      this.loadingSquads.set(false);
      this.globalLoading.set(false);
    });
  }
}
