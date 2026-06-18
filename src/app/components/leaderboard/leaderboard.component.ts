import { Component, inject, OnInit, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { ApiService } from '../../services/api.service';
import { AppUser } from '../../models/models';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [MatTableModule, MatCardModule],
  template: `
    <h3 class="page-title">🏆 Leaderboard</h3>
    <mat-card>
      <table mat-table [dataSource]="users()">
        <ng-container matColumnDef="rank">
          <th mat-header-cell *matHeaderCellDef>#</th>
          <td mat-cell *matCellDef="let user; let i = index">{{ i + 1 }}</td>
        </ng-container>
        <ng-container matColumnDef="name">
          <th mat-header-cell *matHeaderCellDef>Player</th>
          <td mat-cell *matCellDef="let user">{{ user.displayName || user.username }}</td>
        </ng-container>
        <ng-container matColumnDef="points">
          <th mat-header-cell *matHeaderCellDef>Points</th>
          <td mat-cell *matCellDef="let user" class="points">{{ user.totalPoints }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns;"></tr>
      </table>
    </mat-card>
  `,
  styles: [`
    .page-title { color: #1a237e; font-size: 20px; font-weight: 700; margin: 0 0 20px; }
    table { width: 100%; }
    .points { font-weight: 700; color: #1a237e; }
  `]
})
export class LeaderboardComponent implements OnInit {
  private api = inject(ApiService);
  users = signal<AppUser[]>([]);
  columns = ['rank', 'name', 'points'];

  ngOnInit() {
    this.api.getLeaderboard().subscribe(u => this.users.set(u));
  }
}
