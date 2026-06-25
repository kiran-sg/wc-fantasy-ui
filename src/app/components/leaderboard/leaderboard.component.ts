import { Component, inject, OnInit, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AppUser, Match, RoundEntry } from '../../models/models';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [MatTableModule, MatCardModule, MatTabsModule, MatSelectModule, MatFormFieldModule, FormsModule],
  template: `
    <h3 class="page-title">🏆 Leaderboard</h3>

    <mat-tab-group>
      <!-- Overall -->
      <mat-tab label="Overall">
        <mat-card class="table-card">
          <table mat-table [dataSource]="overall()">
            <ng-container matColumnDef="rank">
              <th mat-header-cell *matHeaderCellDef>#</th>
              <td mat-cell *matCellDef="let u; let i = index">{{ i + 1 }}</td>
            </ng-container>
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Player</th>
              <td mat-cell *matCellDef="let u">{{ u.displayName || u.username }}</td>
            </ng-container>
            <ng-container matColumnDef="points">
              <th mat-header-cell *matHeaderCellDef>Total Pts</th>
              <td mat-cell *matCellDef="let u" class="pts">{{ u.totalPoints }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="overallCols"></tr>
            <tr mat-row *matRowDef="let row; columns: overallCols;"></tr>
          </table>
        </mat-card>
      </mat-tab>

      <!-- Round -->
      <mat-tab label="Round">
        <div class="round-select">
          <mat-form-field appearance="outline">
            <mat-label>Select Match</mat-label>
            <mat-select [(ngModel)]="selectedMatchId" (ngModelChange)="loadRound($event)">
              @for (m of matches(); track m.id) {
                <mat-option [value]="m.id">
                  {{ m.teamA.name }} vs {{ m.teamB.name }} · {{ m.stage }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <mat-card class="table-card">
          <table mat-table [dataSource]="roundEntries()">
            <ng-container matColumnDef="rank">
              <th mat-header-cell *matHeaderCellDef>#</th>
              <td mat-cell *matCellDef="let e; let i = index">{{ i + 1 }}</td>
            </ng-container>
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Player</th>
              <td mat-cell *matCellDef="let e">{{ e.displayName || e.username }}</td>
            </ng-container>
            <ng-container matColumnDef="points">
              <th mat-header-cell *matHeaderCellDef>Round Pts</th>
              <td mat-cell *matCellDef="let e" class="pts">{{ e.roundPoints }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="roundCols"></tr>
            <tr mat-row *matRowDef="let row; columns: roundCols;"></tr>
          </table>
          @if (!selectedMatchId) {
            <p class="hint">Select a match to see round rankings.</p>
          }
        </mat-card>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: [`
    .page-title { color: #1a237e; font-size: 20px; font-weight: 700; margin: 0 0 20px; }
    .table-card { margin-top: 16px; }
    table { width: 100%; }
    .pts { font-weight: 700; color: #1a237e; }
    .round-select { margin-top: 16px; }
    mat-form-field { width: 100%; }
    .hint { text-align: center; color: #888; padding: 16px; font-size: 13px; }
  `]
})
export class LeaderboardComponent implements OnInit {
  private api = inject(ApiService);

  overall = signal<AppUser[]>([]);
  matches = signal<Match[]>([]);
  roundEntries = signal<RoundEntry[]>([]);
  selectedMatchId: number | null = null;

  overallCols = ['rank', 'name', 'points'];
  roundCols = ['rank', 'name', 'points'];

  ngOnInit() {
    this.api.getOverallLeaderboard().subscribe(u => this.overall.set(u));
    this.api.getMatches().subscribe(m => this.matches.set(m));
  }

  loadRound(matchId: number) {
    if (!matchId) return;
    this.api.getRoundLeaderboard(matchId).subscribe(e => this.roundEntries.set(e));
  }
}
