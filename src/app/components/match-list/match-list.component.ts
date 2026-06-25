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
          <span class="match-stage">{{ match.stage }}</span>
          <span class="status-badge" [class]="match.status.toLowerCase()">
            {{ statusLabel(match) }}
          </span>
        </div>
        <div class="teams">
          <div class="team">
            @if (match.teamA?.flagUrl) {
              <img class="team-flag" [src]="match.teamA!.flagUrl" [alt]="match.teamA!.name">
            }
            <span class="team-name">{{ match.teamA?.name ?? match.teamALabel ?? 'TBD' }}</span>
          </div>
          @if (match.status === 'COMPLETED' || match.status === 'LIVE') {
            <span class="score">{{ match.scoreA }} - {{ match.scoreB }}</span>
          } @else {
            <span class="vs">VS</span>
          }
          <div class="team">
            @if (match.teamB?.flagUrl) {
              <img class="team-flag" [src]="match.teamB!.flagUrl" [alt]="match.teamB!.name">
            }
            <span class="team-name">{{ match.teamB?.name ?? match.teamBLabel ?? 'TBD' }}</span>
          </div>
        </div>
        <div class="match-info">
          <span>🕐 {{ formatDate(match.matchTime) }}</span>
          <span>🏟️ {{ cleanVenue(match.venue) }}</span>
        </div>
        <div class="actions">
          @if (match.status === 'UPCOMING') {
            <a mat-flat-button color="primary" [routerLink]="['/squad', match.id]">Pick Squad</a>
          }
          @if (match.status === 'LIVE') {
            <a mat-flat-button color="warn" [routerLink]="['/live', match.id]">🔴 Go Live</a>
            <a mat-stroked-button [routerLink]="['/squad', match.id]">View Squad</a>
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
    .page-title { color: #1a237e; font-size: 20px; font-weight: 700; margin: 0 0 20px; }
    .loading { text-align: center; padding: 32px; color: #666; }
    .match-card { margin-bottom: 12px; padding: 16px; border-radius: 12px !important; }
    .match-card.locked { opacity: 0.85; }
    .match-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .match-stage { font-size: 11px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .status-badge { font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
    .status-badge.upcoming { background: #c8e6c9; color: #2e7d32; }
    .status-badge.live { background: #ffcdd2; color: #c62828; animation: pulse 1.5s infinite; }
    .status-badge.completed { background: #e3f2fd; color: #1565c0; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
    .teams { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 16px 0; }
    .team { display: flex; align-items: center; gap: 8px; }
    .team-flag { width: 28px; height: 20px; object-fit: cover; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .team-name { font-size: 16px; font-weight: 600; color: #333; }
    .vs { color: #999; font-size: 12px; font-weight: 700; }
    .score { font-size: 24px; font-weight: 800; color: #1a237e; }
    .match-info { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #666; }
    .actions { margin-top: 12px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  `]
})
export class MatchListComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  matches = signal<Match[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.api.getMatches().subscribe({
      next: (m) => { this.matches.set(m); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  statusLabel(match: Match): string {
    if (match.status === 'LIVE') return '🔴 LIVE';
    if (match.status === 'COMPLETED') return '✅ Full Time';
    return '🟢 Open';
  }

  formatDate(dt: string): string {
    return new Date(dt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  cleanVenue(venue: string): string {
    return venue?.replace(/\s*\[#\d+\]/, '') || '';
  }
}
