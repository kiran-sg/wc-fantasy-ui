import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Player, Match } from '../../models/models';

@Component({
  selector: 'app-squad-builder',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatChipsModule],
  template: `
    <h3 class="page-title">Pick Your Playing XI</h3>

    @if (match()) {
      <mat-card class="match-banner">
        <div class="teams">
          <span class="team-name">{{ match()!.teamA.name }}</span>
          <span class="vs">VS</span>
          <span class="team-name">{{ match()!.teamB.name }}</span>
        </div>
        <div class="meta">{{ formatDate(match()!.matchTime) }}</div>
      </mat-card>
    }

    <div class="selection-info">
      <span>Selected: {{ selectedIds().size }}/11</span>
      @if (captainId()) {
        <span>Captain: ✅</span>
      }
    </div>

    <div class="player-list">
      @for (player of allPlayers(); track player.id) {
        <mat-card class="player-row" [class.selected]="selectedIds().has(player.id)" (click)="togglePlayer(player)">
          <div class="player-info">
            <span class="pos" [class]="player.position">{{ player.position }}</span>
            <span class="name">{{ player.name }}</span>
            <span class="team">{{ player.team.name }}</span>
          </div>
          @if (selectedIds().has(player.id)) {
            <button mat-icon-button class="captain-btn" [class.is-captain]="captainId() === player.id" (click)="setCaptain($event, player.id)">
              C
            </button>
          }
        </mat-card>
      }
    </div>

    <div class="actions">
      <button mat-flat-button class="save-btn" [disabled]="selectedIds().size !== 11 || !captainId()" (click)="saveSquad()">
        Save Squad
      </button>
    </div>

    @if (message()) {
      <div class="msg">{{ message() }}</div>
    }
  `,
  styles: [`
    .page-title { color: #1a237e; font-size: 20px; font-weight: 700; margin: 0 0 16px; }
    .match-banner { padding: 16px; margin-bottom: 16px; text-align: center; }
    .teams { display: flex; align-items: center; justify-content: center; gap: 12px; }
    .team-name { font-size: 16px; font-weight: 600; }
    .vs { color: #999; font-size: 12px; }
    .meta { color: #666; font-size: 12px; margin-top: 4px; }
    .selection-info { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; font-weight: 500; color: #1a237e; }
    .player-list { max-height: 500px; overflow-y: auto; }
    .player-row { padding: 10px 16px; margin-bottom: 4px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
    .player-row.selected { background: #e8f5e9; border-left: 3px solid #4caf50; }
    .player-info { display: flex; align-items: center; gap: 10px; flex: 1; }
    .pos { font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #e3f2fd; color: #1565c0; }
    .pos.GK { background: #fff3e0; color: #e65100; }
    .pos.DEF { background: #e8f5e9; color: #2e7d32; }
    .pos.FWD { background: #fce4ec; color: #c62828; }
    .name { font-size: 14px; font-weight: 500; }
    .team { font-size: 12px; color: #888; margin-left: auto; }
    .captain-btn { width: 32px; height: 32px; border-radius: 50%; border: 2px solid #f57c00; background: white; font-weight: 700; font-size: 14px; cursor: pointer; }
    .captain-btn.is-captain { background: #f57c00; color: white; }
    .actions { margin-top: 16px; text-align: center; }
    .save-btn { width: 100%; padding: 12px; }
    .msg { text-align: center; color: #2e7d32; margin-top: 12px; font-weight: 500; }
  `]
})
export class SquadBuilderComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);

  match = signal<Match | null>(null);
  allPlayers = signal<Player[]>([]);
  selectedIds = signal(new Set<number>());
  captainId = signal<number | null>(null);
  message = signal('');

  ngOnInit() {
    const matchId = +this.route.snapshot.params['matchId'];
    this.api.getMatches().subscribe(matches => {
      const m = matches.find(x => x.id === matchId) || null;
      this.match.set(m);
      if (m) {
        const players: Player[] = [];
        this.api.getPlayersByTeam(m.teamA.id).subscribe(p => {
          players.push(...p);
          this.api.getPlayersByTeam(m.teamB.id).subscribe(p2 => {
            players.push(...p2);
            this.allPlayers.set(players);
            // Load existing squad if user is logged in
            const userId = this.authService.getUserId();
            if (userId) {
              this.api.getSquad(userId, matchId).subscribe({
                next: (squad) => {
                  if (squad && squad.players) {
                    const ids = new Set(squad.players.map((p: Player) => p.id));
                    this.selectedIds.set(ids);
                    if (squad.captain) this.captainId.set(squad.captain.id);
                  }
                },
                error: () => {} // no existing squad
              });
            }
          });
        });
      }
    });
  }

  togglePlayer(player: Player) {
    const ids = new Set(this.selectedIds());
    if (ids.has(player.id)) {
      ids.delete(player.id);
      if (this.captainId() === player.id) this.captainId.set(null);
    } else if (ids.size < 11) {
      ids.add(player.id);
    }
    this.selectedIds.set(ids);
  }

  setCaptain(event: Event, playerId: number) {
    event.stopPropagation();
    this.captainId.set(playerId);
  }

  saveSquad() {
    const m = this.match();
    if (!m || !this.captainId()) return;
    const userId = this.authService.getUserId();
    this.api.saveSquad(userId, m.id, [...this.selectedIds()], this.captainId()!)
      .subscribe(() => this.message.set('Squad saved successfully! ✅'));
  }

  formatDate(dateTime: string): string {
    return new Date(dateTime).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
