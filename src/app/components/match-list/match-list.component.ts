import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../services/api.service';
import { Match } from '../../models/models';

@Component({
  selector: 'app-match-list',
  standalone: true,
  imports: [RouterLink, MatCardModule, MatButtonModule, MatChipsModule, MatIconModule],
  template: `
    <h3 class="page-title">FIFA WC 2026 - Fantasy League</h3>

    @if (loading()) {
      <div class="loading">Loading matches...</div>
    }

    @for (match of matches(); track match.id) {
      <mat-card class="match-card" [class.locked]="isLocked(match)" appearance="outlined">
        <div class="match-header">
          <span class="match-stage">{{ match.stage }}</span>
          <span class="badge" [class.open]="!isLocked(match)">
            {{ isLocked(match) ? '🔒 Locked' : '🟢 Open' }}
          </span>
        </div>
        <div class="teams">
          <div class="team">
            @if (match.teamA.flagUrl) {
              <img class="team-flag" [src]="match.teamA.flagUrl" [alt]="match.teamA.name">
            }
            <span class="team-name">{{ match.teamA.name }}</span>
          </div>
          <span class="vs">VS</span>
          <div class="team">
            @if (match.teamB.flagUrl) {
              <img class="team-flag" [src]="match.teamB.flagUrl" [alt]="match.teamB.name">
            }
            <span class="team-name">{{ match.teamB.name }}</span>
          </div>
        </div>
        <div class="match-info">
          <span>🕐 {{ formatDate(match.matchTime) }}</span>
          <span>🏟️ {{ cleanVenue(match.venue) }}</span>
        </div>
        @if (!isLocked(match)) {
          <div class="actions">
            <a mat-flat-button [routerLink]="['/squad', match.id]">Pick Your XI</a>
          </div>
        }
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
    .match-card.locked { opacity: 0.6; }
    .match-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .match-stage { font-size: 11px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 12px; background: #ffcdd2; }
    .badge.open { background: #c8e6c9; }
    .teams { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 16px 0; }
    .team { display: flex; align-items: center; gap: 8px; }
    .team-flag { width: 28px; height: 20px; object-fit: cover; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .team-name { font-size: 16px; font-weight: 600; color: #333; }
    .vs { color: #999; font-size: 12px; font-weight: 700; }
    .match-info { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #666; }
    .actions { margin-top: 12px; text-align: center; }
  `]
})
export class MatchListComponent implements OnInit {
  private api = inject(ApiService);
  matches = signal<Match[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.api.getMatches().subscribe({
      next: (m) => { this.matches.set(m); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  isLocked(match: Match): boolean {
    return new Date() >= new Date(match.matchTime);
  }

  formatDate(dateTime: string): string {
    return new Date(dateTime).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  cleanVenue(venue: string): string {
    return venue?.replace(/\s*\[#\d+\]/, '') || '';
  }
}
