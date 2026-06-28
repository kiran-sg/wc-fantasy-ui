import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Match } from '../../models/models';
import { PointsGuideComponent } from '../points-guide/points-guide.component';

@Component({
  selector: 'app-match-list',
  standalone: true,
  imports: [RouterLink, MatCardModule, MatButtonModule, MatChipsModule, MatIconModule, PointsGuideComponent],
  template: `
    <h3 class="page-title">FIFA WC 2026 — Fantasy League</h3>

    <app-points-guide [collapsible]="true" [compact]="true" />

    @if (loading()) {
      <div class="loading">Loading matches...</div>
    }

    @for (match of matches(); track match.id) {
      <mat-card class="match-card" [class.locked]="match.status !== 'UPCOMING'" appearance="outlined">
        <div class="match-header">
          <span class="match-stage">{{ matchLabel(match) }}</span>
          @if (match.status !== 'UPCOMING') {
            <span class="status-badge" [class]="match.status.toLowerCase()">
              {{ statusLabel(match) }}
            </span>
          }
        </div>
        <div class="teams">
          <div class="team">
            @if (match.teamA?.flagUrl) {
              <img class="team-flag" [src]="match.teamA!.flagUrl" [alt]="match.teamA!.name">
            }
            <span class="team-name">{{ teamName(match, 'A') }}</span>
          </div>
          <div class="vs-col">
            @if (match.status === 'COMPLETED' || match.status === 'LIVE') {
              <span class="score">{{ match.scoreA }} – {{ match.scoreB }}</span>
            } @else {
              <span class="vs">VS</span>
            }
          </div>
          <div class="team">
            @if (match.teamB?.flagUrl) {
              <img class="team-flag" [src]="match.teamB!.flagUrl" [alt]="match.teamB!.name">
            }
            <span class="team-name">{{ teamName(match, 'B') }}</span>
          </div>
        </div>
        <div class="match-info">
          <span>🕐 {{ formatDate(match.matchTime) }}</span>
          <span>🏟️ {{ cleanVenue(match.venue) }}</span>
        </div>
        <div class="actions">
          @if (match.status === 'LIVE') {
            <a mat-flat-button color="warn" [routerLink]="['/live', match.id]">🔴 Go Live</a>
          }
          @if (match.status === 'COMPLETED') {
            <a mat-stroked-button [routerLink]="['/leaderboard']">🏆 Leaderboard</a>
          }
        </div>
      </mat-card>
    }

    @if (!loading() && matches().length === 0) {
      <div class="loading">No matches found</div>
    }
  `,
  styles: [`
    .loading { text-align: center; padding: 32px; color: #666; }
    .match-card { margin-bottom: 10px; padding: 14px; border-radius: 12px !important; }
    .match-card.locked { opacity: 0.85; }
    .match-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .match-stage { font-size: 11px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .status-badge { font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; white-space: nowrap; }
    .status-badge.upcoming { background: #c8e6c9; color: #2e7d32; }
    .status-badge.live { background: #ffcdd2; color: #c62828; animation: pulse 1.5s infinite; }
    .status-badge.completed { background: #e3f2fd; color: #1565c0; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
    .teams { display: flex; align-items: center; justify-content: space-between; margin: 12px 0; gap: 8px; }
    .team { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; min-width: 0; }
    .team-flag { width: 36px; height: 24px; object-fit: cover; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .team-name { font-size: 13px; font-weight: 700; color: #333; text-align: center; word-break: break-word; }
    .vs-col { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
    .vs { color: #999; font-size: 11px; font-weight: 700; }
    .score { font-size: 22px; font-weight: 800; color: #1a237e; white-space: nowrap; }
    .match-info { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: #666; margin-top: 2px; }
    .actions { margin-top: 10px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
    .actions a, .actions button { font-size: 13px !important; min-height: 36px; }
  `]
})
export class MatchListComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  matches = signal<Match[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.api.getMatches().subscribe({
      next: (m) => {
        const STAGE_ORDER: Record<string, number> = { R32: 1, R16: 2, QF: 3, SF: 4, LF: 5, FINAL: 6 };
        const sorted = m
          .filter(x => x.stage !== 'GROUP')
          .sort((a, b) => {
            const so = (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99);
            if (so !== 0) return so;
            return new Date(a.matchTime).getTime() - new Date(b.matchTime).getTime();
          });
        this.matches.set(sorted);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  private readonly STAGE_LABELS: Record<string, string> = {
    GROUP: 'Group Stage', R32: 'Round of 32', R16: 'Round of 16',
    QF: 'Quarter-Final', SF: 'Semi-Final', LF: "Losers' Final", FINAL: 'Final'
  };

  private readonly STAGE_SHORT: Record<string, string> = {
    R32: 'R32', R16: 'R16', QF: 'QF', SF: 'SF', LF: 'LF', FINAL: 'Final'
  };

  stageLabel(stage: string): string {
    return this.STAGE_LABELS[stage] ?? stage;
  }

  matchLabel(match: Match): string {
    if (match.stage === 'GROUP' || !match.matchNumber) return this.stageLabel(match.stage);
    return `${this.stageLabel(match.stage)} · Match ${match.matchNumber}`;
  }

  // Converts "Round of 32 3 Winner" → "R32 M3 Winner", "Quarterfinal 2 Winner" → "QF M2 Winner" etc.
  formatBracketLabel(label: string | null): string {
    if (!label) return 'TBD';
    return label
      .replace(/Round of 32\s+(\d+)/i,   'R32 M$1')
      .replace(/Round of 16\s+(\d+)/i,   'R16 M$1')
      .replace(/Quarterfinal\s+(\d+)/i,  'QF M$1')
      .replace(/Semifinal\s+(\d+)/i,     'SF M$1')
      .replace(/Winner$/i, 'Winner')
      .replace(/Loser$/i,  'Loser');
  }

  teamName(match: Match, side: 'A' | 'B'): string {
    const team  = side === 'A' ? match.teamA  : match.teamB;
    const label = side === 'A' ? match.teamALabel : match.teamBLabel;
    return team?.name ?? this.formatBracketLabel(label);
  }

  statusLabel(match: Match): string {
    if (match.status === 'LIVE') return '🔴 LIVE';
    if (match.status === 'COMPLETED') return '✅ Full Time';
    return '';
  }

  formatDate(dt: string): string {
    return new Date(dt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  cleanVenue(venue: string): string {
    return venue?.replace(/\s*\[#\d+\]/, '') || '';
  }
}
