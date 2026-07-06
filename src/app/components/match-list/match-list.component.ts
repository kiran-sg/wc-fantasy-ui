import { Component, inject, OnInit, signal, computed } from '@angular/core';
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

    @if (pastMatches().length > 0) {
      <div class="past-banner" (click)="showPast.set(!showPast())">
        <span>🕘 {{ pastMatches().length }} previous match{{ pastMatches().length > 1 ? 'es' : '' }}</span>
        <span class="past-chevron">{{ showPast() ? '▲' : '▼' }}</span>
      </div>
      @if (showPast()) {
        @for (match of pastMatches(); track match.id) {
          <mat-card class="match-card past-match-card" appearance="outlined">
            <div class="match-header">
              <span class="match-stage">{{ matchLabel(match) }}</span>
              <span class="status-badge" [class]="match.status.toLowerCase()">{{ statusLabel(match) || '✅ Full Time' }}</span>
            </div>
            <div class="teams">
              <div class="team">
                @if (match.teamA?.flagUrl) { <img class="team-flag" [src]="match.teamA!.flagUrl" [alt]="match.teamA!.name"> }
                <span class="team-name">{{ teamName(match, 'A') }}</span>
              </div>
              <div class="vs-col">
                <span class="score">{{ match.scoreA ?? '?' }} – {{ match.scoreB ?? '?' }}</span>
              </div>
              <div class="team">
                @if (match.teamB?.flagUrl) { <img class="team-flag" [src]="match.teamB!.flagUrl" [alt]="match.teamB!.name"> }
                <span class="team-name">{{ teamName(match, 'B') }}</span>
              </div>
            </div>
            @if (hasStats(match.id)) {
              <div class="scorers-row">
                <div class="scorers-side scorers-left">
                  @for (s of scorers(match.id, match.teamA?.id); track s.name) {
                    <span class="scorer-entry">⚽ {{ s.name }}{{ s.count > 1 ? ' ×' + s.count : '' }}{{ s.og ? ' (OG)' : '' }}</span>
                  }
                </div>
                <div class="scorers-divider"></div>
                <div class="scorers-side scorers-right">
                  @for (s of scorers(match.id, match.teamB?.id); track s.name) {
                    <span class="scorer-entry">⚽ {{ s.name }}{{ s.count > 1 ? ' ×' + s.count : '' }}{{ s.og ? ' (OG)' : '' }}</span>
                  }
                </div>
              </div>
            }
            <div class="match-info">
              <span>🕐 {{ formatDate(match.matchTime) }}</span>
              <span>🏟️ {{ cleanVenue(match.venue) }}</span>
            </div>
          </mat-card>
        }
      }
    }

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
              <span class="match-time-center">{{ formatDate(match.matchTime) }}</span>
            }
          </div>
          <div class="team">
            @if (match.teamB?.flagUrl) {
              <img class="team-flag" [src]="match.teamB!.flagUrl" [alt]="match.teamB!.name">
            }
            <span class="team-name">{{ teamName(match, 'B') }}</span>
          </div>
        </div>

        <!-- Goal scorers row — shown for COMPLETED/LIVE matches with stats -->
        @if ((match.status === 'COMPLETED' || match.status === 'LIVE') && hasStats(match.id)) {
          <div class="scorers-row">
            <div class="scorers-side scorers-left">
              @for (s of scorers(match.id, match.teamA?.id); track s.name) {
                <span class="scorer-entry">⚽ {{ s.name }}{{ s.count > 1 ? ' ×' + s.count : '' }}{{ s.og ? ' (OG)' : '' }}</span>
              }
            </div>
            <div class="scorers-divider"></div>
            <div class="scorers-side scorers-right">
              @for (s of scorers(match.id, match.teamB?.id); track s.name) {
                <span class="scorer-entry">⚽ {{ s.name }}{{ s.count > 1 ? ' ×' + s.count : '' }}{{ s.og ? ' (OG)' : '' }}</span>
              }
            </div>
          </div>
        }

        <div class="match-info">
          @if (match.status !== 'UPCOMING') {
            <span>🕐 {{ formatDate(match.matchTime) }}</span>
          }
          <span>🏟️ {{ cleanVenue(match.venue) }}</span>
        </div>

        <div class="actions">
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
    .vs-col { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; gap: 2px; }
    .vs { color: #999; font-size: 11px; font-weight: 700; }
    .score { font-size: 22px; font-weight: 800; color: #1a237e; white-space: nowrap; }
    .match-time-center { font-size: 10px; color: #888; white-space: nowrap; }

    /* Scorers */
    .scorers-row {
      display: flex; align-items: flex-start; gap: 8px;
      margin: 0 0 10px; padding: 8px 10px;
      background: #f5f7ff; border-radius: 8px;
      min-height: 28px;
    }
    .scorers-side { flex: 1; display: flex; flex-direction: column; gap: 3px; }
    .scorers-left { align-items: flex-start; }
    .scorers-right { align-items: flex-end; }
    .scorers-divider { width: 1px; background: #dde3ff; flex-shrink: 0; align-self: stretch; }
    .scorer-entry { font-size: 11px; color: #333; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

    .match-info { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: #666; margin-top: 2px; }
    .actions { margin-top: 10px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
    .actions a, .actions button { font-size: 13px !important; min-height: 36px; }
    .past-banner {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; margin-bottom: 10px; border-radius: 10px;
      background: #f3f4f6; border: 1px solid #d1d5db;
      cursor: pointer; font-size: 13px; font-weight: 600; color: #374151;
      user-select: none;
    }
    .past-banner:hover { background: #e5e7eb; }
    .past-chevron { font-size: 11px; color: #6b7280; }
    .past-match-card { opacity: 0.75; }
  `]
})
export class MatchListComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  matches = signal<Match[]>([]);
  pastMatches = signal<Match[]>([]);
  showPast = signal(false);
  loading = signal(true);
  // matchId → raw stats array
  private statsMap = signal<Record<number, any[]>>({});

  // Returns current time as an IST-naive string (e.g. "2026-07-06T14:30:00")
  // matchTime from backend is stored as IST-naive, so we compare like-for-like.
  private nowISTString(): string {
    return new Date().toLocaleString('sv', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T');
  }

  isPast(matchTime: string): boolean {
    if (!matchTime) return false;
    return matchTime < this.nowISTString();
  }

  ngOnInit() {
    this.api.getMatches().subscribe({
      next: (m) => {
        const nonGroup = m
          .filter(x => x.stage !== 'GROUP')
          .sort((a, b) => new Date(a.matchTime).getTime() - new Date(b.matchTime).getTime());

        this.matches.set(nonGroup.filter(x => x.status === 'LIVE' || !this.isPast(x.matchTime)));
        this.pastMatches.set(nonGroup.filter(x => x.status !== 'LIVE' && this.isPast(x.matchTime)).reverse());
        this.loading.set(false);

        // Fetch stats for completed/live matches
        nonGroup
          .filter(match => match.status === 'COMPLETED' || match.status === 'LIVE')
          .forEach(match => this.loadStats(match.id));
      },
      error: () => this.loading.set(false)
    });
  }

  private loadStats(matchId: number) {
    this.api.getMatchStats(matchId).subscribe({
      next: stats => {
        this.statsMap.update(m => ({ ...m, [matchId]: stats }));
      },
      error: () => {}
    });
  }

  hasStats(matchId: number): boolean {
    const s = this.statsMap()[matchId];
    return !!s && s.length > 0;
  }

  // Returns goal scorers for a team in a match.
  // Own goals scored BY the other team appear here too (they count for this team's score).
  scorers(matchId: number, teamId: number | undefined): { name: string; count: number; og: boolean }[] {
    if (!teamId) return [];
    const stats = this.statsMap()[matchId] ?? [];
    const result: { name: string; count: number; og: boolean }[] = [];

    // Regular goals by this team's players
    for (const s of stats) {
      const pid = s.player?.team?.id ?? s.player?.teamId;
      if (pid === teamId && s.goals > 0) {
        result.push({ name: this.shortName(s.player?.name), count: s.goals, og: false });
      }
    }
    // Own goals by the OPPOSING team (count toward this team)
    for (const s of stats) {
      const pid = s.player?.team?.id ?? s.player?.teamId;
      if (pid !== teamId && s.ownGoals > 0) {
        result.push({ name: this.shortName(s.player?.name), count: s.ownGoals, og: true });
      }
    }
    return result;
  }

  private shortName(name: string | undefined): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    // "Kylian Mbappe" → "K. Mbappe"
    return parts[0][0] + '. ' + parts.slice(1).join(' ');
  }

  private readonly STAGE_LABELS: Record<string, string> = {
    GROUP: 'Group Stage', R32: 'Round of 32', R16: 'Round of 16',
    QF: 'Quarter-Final', SF: 'Semi-Final', LF: "Losers' Final", FINAL: 'Final'
  };

  stageLabel(stage: string): string {
    return this.STAGE_LABELS[stage] ?? stage;
  }

  matchLabel(match: Match): string {
    if (match.stage === 'GROUP' || match.stage === 'LF' || match.stage === 'FINAL' || !match.matchNumber) return this.stageLabel(match.stage);
    return `${this.stageLabel(match.stage)} · Match ${match.matchNumber}`;
  }

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
    return venue?.replace(/\s*\[#[^\]]+\]/, '') || '';
  }
}
