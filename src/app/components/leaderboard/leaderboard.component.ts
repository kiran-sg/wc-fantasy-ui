import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { AppUser } from '../../models/models';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [],
  template: `
    <div class="lb-wrap">
      <div class="lb-header">
        <span class="lb-title">🏆 Leaderboard</span>
      </div>
      <div class="lb-table-wrap">
        <table class="lb-table">
          <thead>
            <tr>
              <th class="col-rank">#</th>
              <th class="col-name">Player</th>
              <th class="col-pts">Total Pts</th>
            </tr>
          </thead>
          <tbody>
            @for (u of overall(); track u.id; let i = $index) {
              <tr [class.lb-top3]="i < 3">
                <td class="col-rank">
                  @if (i === 0) { <span class="medal gold">🥇</span> }
                  @else if (i === 1) { <span class="medal silver">🥈</span> }
                  @else if (i === 2) { <span class="medal bronze">🥉</span> }
                  @else { <span class="rank-num">{{ i + 1 }}</span> }
                </td>
                <td class="col-name">{{ u.displayName || u.username }}</td>
                <td class="col-pts">{{ u.totalPoints }}</td>
              </tr>
            }
            @if (overall().length === 0) {
              <tr><td colspan="3" class="empty">No entries yet.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .lb-wrap { max-width: 600px; margin: 0 auto; }

    .lb-header { margin-bottom: 14px; }
    .lb-title { font-size: 20px; font-weight: 800; color: #1a237e; }

    .lb-table-wrap {
      border-radius: 12px; overflow: hidden;
      box-shadow: 0 2px 12px rgba(0,0,0,.1);
      overflow-x: auto; -webkit-overflow-scrolling: touch;
    }

    .lb-table { width: 100%; border-collapse: collapse; background: #fff; min-width: 260px; }

    thead tr { background: #1a237e; }
    thead th { color: #fff; font-size: 12px; font-weight: 700; letter-spacing: .5px;
               padding: 10px 12px; text-align: left; white-space: nowrap; }

    tbody tr { border-bottom: 1px solid #f0f0f0; transition: background .15s; }
    tbody tr:hover { background: #f5f7ff; }
    tbody tr:last-child { border-bottom: none; }
    .lb-top3 { background: #fafbff; }

    td { padding: 10px 12px; font-size: 14px; color: #1a237e; }

    .col-rank { width: 48px; text-align: center; }
    .col-name { font-weight: 600; }
    .col-pts  { font-weight: 800; font-size: 15px; color: #1565c0; text-align: right; white-space: nowrap; }

    .medal { font-size: 18px; }
    .rank-num { font-size: 13px; font-weight: 700; color: #888; }
    .empty { text-align: center; color: #aaa; padding: 32px; font-size: 14px; }

    @media (max-width: 480px) {
      td, thead th { padding: 9px 10px; font-size: 13px; }
      .lb-title { font-size: 17px; }
    }
  `]
})
export class LeaderboardComponent implements OnInit {
  private api = inject(ApiService);
  overall = signal<AppUser[]>([]);

  ngOnInit() {
    this.api.getOverallLeaderboard().subscribe(u => this.overall.set(u));
  }
}
