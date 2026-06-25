import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { AppUser, Match, UserTeam } from '../../models/models';
import { PointsGuideComponent } from '../points-guide/points-guide.component';

@Component({
  selector: 'app-admin-scores',
  standalone: true,
  imports: [
    MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatTableModule, MatChipsModule, MatExpansionModule, MatTabsModule,
    MatSelectModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule,
    FormsModule, ReactiveFormsModule, UpperCasePipe, PointsGuideComponent
  ],
  template: `
    @if (globalLoading()) {
      <div class="overlay">
        <mat-spinner diameter="50"></mat-spinner>
        <p>{{ loadingMsg() }}</p>
      </div>
    }

    <h3 class="page-title">⚡ Admin Panel</h3>

    <mat-tab-group class="admin-tabs" animationDuration="150ms">

      <!-- ═══════════════════ TAB 1: SCORE PANEL ═══════════════════ -->
      <mat-tab label="📊 Score Panel">
        <!-- DATA SYNC -->
        <mat-card class="sync-card" appearance="outlined">
          <div class="sync-title">🔄 Data Sync</div>
          <p class="sync-desc">Load teams, matches and players from external sources. Run in order: Teams → Matches → Players.</p>
          <div class="sync-btns">
            <button mat-flat-button class="sync-btn teams-btn" [disabled]="syncing() !== null" (click)="runSync('teams')">
              @if (syncing() === 'teams') { <mat-spinner diameter="14" style="display:inline-block;margin-right:6px"></mat-spinner> }
              🌍 Sync Teams
            </button>
            <button mat-flat-button class="sync-btn matches-btn" [disabled]="syncing() !== null" (click)="runSync('matches')">
              @if (syncing() === 'matches') { <mat-spinner diameter="14" style="display:inline-block;margin-right:6px"></mat-spinner> }
              📅 Sync Matches
            </button>
            <button mat-flat-button class="sync-btn players-btn" [disabled]="syncing() !== null" (click)="runSync('players')">
              @if (syncing() === 'players') { <mat-spinner diameter="14" style="display:inline-block;margin-right:6px"></mat-spinner> }
              👤 Sync Players
            </button>
            <button mat-flat-button class="sync-btn all-btn" [disabled]="syncing() !== null" (click)="runSync('all')">
              @if (syncing() === 'all') { <mat-spinner diameter="14" style="display:inline-block;margin-right:6px"></mat-spinner> }
              ⚡ Sync All
            </button>
          </div>
          @if (syncMsg()) {
            <div class="sync-result" [class.sync-err]="syncMsg().startsWith('❌')">{{ syncMsg() }}</div>
          }
        </mat-card>

        <h4 class="section-head">ESPN Score Updates</h4>
        <p class="subtitle">Fetch live player stats from ESPN and recalculate all fantasy points.</p>

        <!-- Search bar -->
        <div class="search-bar score-search">
          <mat-icon class="search-icon">search</mat-icon>
          <input class="search-input" placeholder="Search by team or date…"
            [value]="scoreSearchQuery()"
            (input)="scoreSearchQuery.set($any($event.target).value)">
          @if (scoreSearchQuery()) {
            <button class="clear-btn" (click)="scoreSearchQuery.set('')">
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>

        @if (filteredMatches().length === 0) {
          <div class="empty-state small">
            <mat-icon>search_off</mat-icon>
            <p>No matches found for "{{ scoreSearchQuery() }}"</p>
          </div>
        }

        @for (match of filteredMatches(); track match.id) {
          <mat-card class="match-card" appearance="outlined">
            <div class="match-header">
              <div class="header-left">
                <span class="stage-chip">{{ match.stage }}</span>
                <span class="status-chip" [class]="match.status.toLowerCase()">{{ match.status }}</span>
              </div>
              <span class="match-time">{{ formatDate(match.matchTime) }}</span>
            </div>

            <div class="teams-row">
              <span class="team">{{ match.teamA.name }}</span>
              @if (match.status === 'COMPLETED' || match.status === 'LIVE') {
                <span class="score">{{ match.scoreA ?? 0 }} – {{ match.scoreB ?? 0 }}</span>
              } @else {
                <span class="vs">VS</span>
              }
              <span class="team">{{ match.teamB.name }}</span>
            </div>

            <div class="actions-row">
              <button mat-flat-button color="primary" [disabled]="updating() === match.id" (click)="fetchFromEspn(match.id)">
                @if (updating() === match.id) {
                  <mat-spinner diameter="16" style="display:inline-block;margin-right:6px"></mat-spinner>
                }
                🔄 Fetch from ESPN
              </button>
              @if (match.status === 'COMPLETED') {
                <button mat-stroked-button (click)="toggleStats(match.id)">
                  📊 {{ statsForMatch() === match.id ? 'Hide Stats' : 'Player Stats' }}
                </button>
                <button mat-stroked-button color="accent" (click)="recalculate(match.id)">
                  🔁 Recalculate Points
                </button>
              }
            </div>

            @if (resultMsg() && resultMatchId() === match.id) {
              <div class="result-msg" [class.error]="resultMsg().startsWith('❌')">{{ resultMsg() }}</div>
            }

            @if (statsForMatch() === match.id && playerStats().length > 0) {
              <div class="stats-section">
                <div class="stats-top-row">
                  <div class="stats-filters">
                    <div class="stats-search-wrap">
                      <mat-icon class="s-icon">search</mat-icon>
                      <input class="search-input" placeholder="Search player…"
                        [value]="statsPlayerSearch()"
                        (input)="statsPlayerSearch.set($any($event.target).value)">
                      @if (statsPlayerSearch()) {
                        <button class="s-clear" (click)="statsPlayerSearch.set('')"><mat-icon>close</mat-icon></button>
                      }
                    </div>
                    <div class="stats-team-btns">
                      <button class="st-btn" [class.active]="statsTeamFilter() === null" (click)="statsTeamFilter.set(null)">All</button>
                      <button class="st-btn" [class.active]="statsTeamFilter() === match.teamA.name" (click)="statsTeamFilter.set(match.teamA.name)">{{ match.teamA.name }}</button>
                      <button class="st-btn" [class.active]="statsTeamFilter() === match.teamB.name" (click)="statsTeamFilter.set(match.teamB.name)">{{ match.teamB.name }}</button>
                    </div>
                  </div>
                  <div class="stats-title">Player Stats — {{ filteredPlayerStats().length }}<span class="stats-total"> / {{ playerStats().length }}</span></div>
                </div>
                <div class="table-wrap stats-scroll">
                  <table mat-table [dataSource]="filteredPlayerStats()">
                    <ng-container matColumnDef="player">
                      <th mat-header-cell *matHeaderCellDef title="Player name and position">Player</th>
                      <td mat-cell *matCellDef="let s">
                        <div class="player-cell">
                          <span class="pos-chip" [class]="s.player.position">{{ s.player.position }}</span>
                          {{ s.player.name }}
                        </div>
                      </td>
                    </ng-container>
                    <ng-container matColumnDef="mins">
                      <th mat-header-cell *matHeaderCellDef title="Minutes played (+1 any, +1 extra for 60+)">Mins</th>
                      <td mat-cell *matCellDef="let s">
                        <div class="stat-cell">
                          <span>{{ s.minutesPlayed }}</span>
                          <span class="sp pos">+{{ s.minutesPlayed >= 60 ? 2 : (s.minutesPlayed > 0 ? 1 : 0) }}</span>
                        </div>
                      </td>
                    </ng-container>
                    <ng-container matColumnDef="goals">
                      <th mat-header-cell *matHeaderCellDef title="Goals scored (+9 GK / +7 DEF / +6 MID / +5 FWD)">⚽ Goals</th>
                      <td mat-cell *matCellDef="let s">
                        <div class="stat-cell">
                          <span>{{ s.goals || 0 }}</span>
                          @if ((s.goals || 0) > 0) {
                            <span class="sp pos">+{{ (s.goals || 0) * goalPts(s.player?.position) }}</span>
                          }
                        </div>
                      </td>
                    </ng-container>
                    <ng-container matColumnDef="assists">
                      <th mat-header-cell *matHeaderCellDef title="Assists (+3 pts each)">🅰️ Ast</th>
                      <td mat-cell *matCellDef="let s">
                        <div class="stat-cell">
                          <span>{{ s.assists || 0 }}</span>
                          @if ((s.assists || 0) > 0) {
                            <span class="sp pos">+{{ (s.assists || 0) * 3 }}</span>
                          }
                        </div>
                      </td>
                    </ng-container>
                    <ng-container matColumnDef="yellowCards">
                      <th mat-header-cell *matHeaderCellDef title="Yellow cards (−1 pt each)">🟨 YC</th>
                      <td mat-cell *matCellDef="let s">
                        <div class="stat-cell">
                          <span>{{ s.yellowCards || 0 }}</span>
                          @if ((s.yellowCards || 0) > 0) {
                            <span class="sp neg">−{{ s.yellowCards }}</span>
                          }
                        </div>
                      </td>
                    </ng-container>
                    <ng-container matColumnDef="redCards">
                      <th mat-header-cell *matHeaderCellDef title="Red cards (−2 pts each)">🟥 RC</th>
                      <td mat-cell *matCellDef="let s">
                        <div class="stat-cell">
                          <span>{{ s.redCards || 0 }}</span>
                          @if ((s.redCards || 0) > 0) {
                            <span class="sp neg">−{{ (s.redCards || 0) * 2 }}</span>
                          }
                        </div>
                      </td>
                    </ng-container>
                    <ng-container matColumnDef="cleanSheet">
                      <th mat-header-cell *matHeaderCellDef title="Clean sheet: no goals conceded while player was on pitch, 60+ min required (+5 GK/DEF, +1 MID)">🛡️ CS</th>
                      <td mat-cell *matCellDef="let s">
                        <div class="stat-cell">
                          <span [class.cs-yes]="s.cleanSheet && s.minutesPlayed >= 60">{{ s.cleanSheet && s.minutesPlayed >= 60 ? '✓' : '' }}</span>
                          @if (s.cleanSheet && s.minutesPlayed >= 60) {
                            <span class="sp pos">+{{ csPts(s.player?.position) }}</span>
                          }
                        </div>
                      </td>
                    </ng-container>
                    <ng-container matColumnDef="saves">
                      <th mat-header-cell *matHeaderCellDef title="Saves — GK only (every 3 saves = +1 pt)">🧤 Sv</th>
                      <td mat-cell *matCellDef="let s">
                        <div class="stat-cell">
                          <span>{{ s.saves || 0 }}</span>
                          @if (s.player?.position === 'GK' && (s.saves || 0) >= 3) {
                            <span class="sp pos">+{{ savesBonus(s.saves) }}</span>
                          }
                        </div>
                      </td>
                    </ng-container>
                    <ng-container matColumnDef="sot">
                      <th mat-header-cell *matHeaderCellDef title="FWD only: shots on target (every 2 = +1 pt)">🎯 SoT</th>
                      <td mat-cell *matCellDef="let s">
                        @if (s.player?.position === 'FWD') {
                          <div class="stat-cell">
                            <span>{{ s.shotsOnTarget || 0 }}</span>
                            @if (sotBonus(s.shotsOnTarget) > 0) {
                              <span class="sp pos">+{{ sotBonus(s.shotsOnTarget) }}</span>
                            }
                          </div>
                        }
                      </td>
                    </ng-container>
                    <ng-container matColumnDef="points">
                      <th mat-header-cell *matHeaderCellDef title="Total fantasy points earned this match">Pts</th>
                      <td mat-cell *matCellDef="let s" class="pts-cell">{{ calcPoints(s) }}</td>
                    </ng-container>
                    <tr mat-header-row *matHeaderRowDef="statCols; sticky: true"></tr>
                    <tr mat-row *matRowDef="let row; columns: statCols;"></tr>
                  </table>
                </div>
              </div>
            }
          </mat-card>
        }
      </mat-tab>

      <!-- ═══════════════════ TAB 3: POINTS GUIDE ═══════════════════ -->
      <mat-tab label="⭐ Points Guide">
        <div style="padding-top:16px">
          <app-points-guide [collapsible]="false" [compact]="false" />
        </div>
      </mat-tab>

      <!-- ═══════════════════ TAB 2: USER SQUADS ═══════════════════ -->
      <mat-tab label="👥 User Squads">
        <div class="squads-browser">

          <div class="sq-layout">

            <!-- LEFT: user list -->
            <div class="sq-user-panel">

              <!-- Search -->
              <div class="sq-user-search">
                <mat-icon class="search-icon">search</mat-icon>
                <input class="search-input" placeholder="Filter by name…" [formControl]="userSearchCtrl">
                @if (userSearchCtrl.value) {
                  <button class="clear-btn" (click)="userSearchCtrl.setValue('')">
                    <mat-icon>close</mat-icon>
                  </button>
                }
              </div>

              <!-- Location filter badges -->
              <div class="sq-loc-filters">
                <button class="loc-badge" [class.active]="locationFilter() === null" (click)="locationFilter.set(null)">All</button>
                <button class="loc-badge tvm" [class.active]="locationFilter() === 'TVM'" (click)="locationFilter.set('TVM')">TVM</button>
                <button class="loc-badge pune" [class.active]="locationFilter() === 'Pune'" (click)="locationFilter.set('Pune')">Pune</button>
              </div>

              <!-- Add user button -->
              <div class="sq-add-user-row">
                <button mat-stroked-button class="add-user-btn" (click)="showAddUser.set(true)">
                  <mat-icon>person_add</mat-icon> Add User
                </button>
              </div>

              <!-- Add user form -->
              @if (showAddUser()) {
                <div class="add-user-form">
                  <input class="au-input" placeholder="Username *" [(ngModel)]="newUsername">
                  <input class="au-input" placeholder="Display name" [(ngModel)]="newDisplayName">
                  <select class="au-input au-select" [(ngModel)]="newLocation">
                    <option value="">Location</option>
                    <option value="TVM">TVM</option>
                    <option value="Pune">Pune</option>
                  </select>
                  <div class="au-role-row">
                    <label class="au-radio">
                      <input type="radio" name="newRole" [(ngModel)]="newIsAdmin" value="false"> User
                    </label>
                    <label class="au-radio">
                      <input type="radio" name="newRole" [(ngModel)]="newIsAdmin" value="true"> Admin
                    </label>
                  </div>
                  @if (addUserError()) {
                    <div class="au-error">{{ addUserError() }}</div>
                  }
                  <div class="au-actions">
                    <button mat-flat-button class="au-save-btn" [disabled]="!newUsername.trim() || addingUser()" (click)="addUser()">
                      @if (addingUser()) { <mat-spinner diameter="14" style="display:inline-block;margin-right:4px"></mat-spinner> }
                      Save
                    </button>
                    <button mat-button class="au-cancel-btn" (click)="cancelAddUser()">Cancel</button>
                  </div>
                </div>
              }

              <!-- User list -->
              <div class="sq-user-list">
                @if (allUsers().length === 0 && !globalLoading()) {
                  <div class="sq-user-empty">No users found</div>
                }
                @for (u of filteredUsers(); track u.id) {
                  <div class="sq-user-row"
                    [class.sq-user-active]="selectedUserId() === u.id"
                    (click)="selectUser(u)">
                    <div class="sq-u-avatar">{{ u.displayName?.[0] || u.username?.[0] | uppercase }}</div>
                    <div class="sq-u-info">
                      <span class="sq-u-name">{{ u.displayName || u.username }}</span>
                      <span class="sq-u-sub">
                        {{ u.username }}
                        @if (u.location) {
                          <span class="sq-u-loc" [class.tvm]="u.location === 'TVM'" [class.pune]="u.location === 'Pune'">{{ u.location }}</span>
                        }
                      </span>
                    </div>
                    <span class="sq-u-pts">{{ u.totalPoints ?? 0 }} pts</span>
                  </div>
                }
                @if (filteredUsers().length === 0 && allUsers().length > 0) {
                  <div class="sq-user-empty">No users match</div>
                }
              </div>
            </div>

            <!-- RIGHT: squad detail -->
            <div class="sq-detail-panel">
              @if (!selectedUserId()) {
                <div class="empty-state">
                  <mat-icon class="empty-icon">person_search</mat-icon>
                  <p>Select a user to view their team</p>
                </div>
              } @else if (selectedUserTeam() === null && !globalLoading()) {
                <div class="empty-state small">
                  <mat-icon>inbox</mat-icon>
                  <p>This user hasn't saved a team yet.</p>
                </div>
              } @else if (selectedUserTeam(); as team) {
                <div class="single-squad">
                  <div class="sq-single-header">
                    <div class="user-avatar">{{ team.user?.displayName?.[0] || team.user?.username?.[0] | uppercase }}</div>
                    <div class="user-info">
                      <span class="user-name">{{ team.user?.displayName || team.user?.username }}</span>
                      <span class="captain-info">
                        C: {{ team.captain?.name || '—' }}
                        @if (team.viceCaptain?.name) { · VC: {{ team.viceCaptain.name }} }
                      </span>
                    </div>
                    <div class="sq-points">
                      <span class="pts-big">{{ team.user?.totalPoints ?? 0 }}</span>
                      <span class="pts-lbl">pts</span>
                    </div>
                  </div>
                  <div class="sq-single-body">
                    @for (pos of positions; track pos) {
                      @let posPlayers = playersByPos([...(team.starters || []), ...(team.bench || [])], pos);
                      @if (posPlayers.length > 0) {
                        <div class="pos-group">
                          <div class="pos-label-badge">{{ pos }}</div>
                          <div class="pos-tokens">
                            @for (p of posPlayers; track p.id) {
                              <div class="player-tok"
                                [class.tok-captain]="p.id === team.captain?.id"
                                [class.tok-vc]="p.id === team.viceCaptain?.id">
                                <span class="tok-name">{{ p.name }}</span>
                                @if (p.id === team.captain?.id) { <span class="tok-badge tok-c">C</span> }
                                @if (p.id === team.viceCaptain?.id) { <span class="tok-badge tok-vc">VC</span> }
                              </div>
                            }
                          </div>
                        </div>
                      }
                    }
                  </div>

                  <!-- Points breakdown by match -->
                  @if (selectedUserMatchPoints().length > 0) {
                    <div class="pts-breakdown">
                      <div class="pts-breakdown-title">
                        <mat-icon class="pts-bd-icon">bar_chart</mat-icon>
                        Points Breakdown
                      </div>
                      @for (mp of selectedUserMatchPoints(); track mp.id) {
                        <div class="pts-match-row">
                          <div class="pts-match-header" (click)="toggleMatchBreakdown(mp.match.id)">
                            <div class="pts-match-left">
                              <span class="pts-stage-tag">{{ mp.stage }}</span>
                              <span class="pts-match-name">{{ mp.match.teamA.name }} vs {{ mp.match.teamB.name }}</span>
                              <span class="pts-match-score">{{ mp.match.scoreA ?? '?' }}–{{ mp.match.scoreB ?? '?' }}</span>
                            </div>
                            <div class="pts-match-right">
                              <span class="pts-earned">{{ mp.pointsEarned }} pts</span>
                              <mat-icon class="pts-chevron">{{ expandedMatchId() === mp.match.id ? 'expand_less' : 'expand_more' }}</mat-icon>
                            </div>
                          </div>

                          @if (expandedMatchId() === mp.match.id) {
                            @let breakdown = breakdownForMatch(mp.match.id, team);
                            @if (breakdown.length === 0) {
                              <div class="pts-loading">
                                <mat-spinner diameter="18"></mat-spinner>
                                <span>Loading...</span>
                              </div>
                            } @else {
                              <div class="pts-player-table">
                                @for (s of breakdown; track s.player.id) {
                                  @let isCap = s.player.id === team.captain?.id;
                                  @let isVC = s.player.id === team.viceCaptain?.id;
                                  @let ppts = calcPoints(s);
                                  <div class="pts-player-row" [class.pts-row-cap]="isCap" [class.pts-row-vc]="isVC">
                                    <div class="pts-p-info">
                                      <span class="pts-pos-tag" [class]="s.player.position">{{ s.player.position }}</span>
                                      <span class="pts-p-name">{{ s.player.name }}</span>
                                      @if (isCap) { <span class="pts-cap-badge">C</span> }
                                      @if (isVC) { <span class="pts-vc-badge">VC</span> }
                                    </div>
                                    <div class="pts-p-stats">
                                      @if (s.minutesPlayed > 0) {
                                        <span class="pts-stat" title="Minutes">⏱ {{ s.minutesPlayed }}'</span>
                                      }
                                      @if ((s.goals || 0) > 0) {
                                        <span class="pts-stat good" title="Goals">⚽ {{ s.goals }}</span>
                                      }
                                      @if ((s.assists || 0) > 0) {
                                        <span class="pts-stat good" title="Assists">🅰️ {{ s.assists }}</span>
                                      }
                                      @if (s.cleanSheet && s.minutesPlayed >= 60) {
                                        <span class="pts-stat good" title="Clean sheet">🛡️ CS</span>
                                      }
                                      @if ((s.yellowCards || 0) > 0) {
                                        <span class="pts-stat bad" title="Yellow card">🟨 {{ s.yellowCards }}</span>
                                      }
                                      @if ((s.redCards || 0) > 0) {
                                        <span class="pts-stat bad" title="Red card">🟥 {{ s.redCards }}</span>
                                      }
                                      @if (s.player.position === 'GK' && (s.saves || 0) > 0) {
                                        <span class="pts-stat" title="Saves">🧤 {{ s.saves }}</span>
                                      }
                                      @if (s.player.position === 'FWD' && (s.shotsOnTarget || 0) > 0) {
                                        <span class="pts-stat" title="Shots on target">🎯 {{ s.shotsOnTarget }}</span>
                                      }
                                    </div>
                                    <div class="pts-p-total" [class.cap-pts]="isCap || isVC">
                                      {{ isCap || isVC ? ppts * 2 : ppts }}
                                      @if (isCap || isVC) { <span class="x2-tag">×2</span> }
                                    </div>
                                  </div>
                                }
                              </div>
                            }
                          }
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>

          </div>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: [`
    /* ── General ── */
    .page-title { color: #1a237e; font-size: 20px; font-weight: 700; margin: 0 0 12px; }
    .section-head { color: #1a237e; font-size: 15px; font-weight: 700; margin: 16px 0 2px; }
    .subtitle { color: #666; font-size: 13px; margin: 0 0 12px; }
    .overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.55); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:9999; }
    .overlay p { color:#fff; margin-top:14px; font-size:15px; font-weight:500; }

    /* ── Tabs ── */
    .admin-tabs { margin-top: 4px; }
    ::ng-deep .admin-tabs .mat-mdc-tab-body-wrapper { padding-top: 16px; }
    ::ng-deep .stats-scroll .mat-mdc-header-row { position: sticky; top: 0; z-index: 2; background: #fff; }

    /* ── Sync card ── */
    .sync-card { padding: 16px; margin-bottom: 20px; border-radius: 12px !important; border: 1px solid #e3f2fd !important; }
    .sync-title { font-size: 14px; font-weight: 700; color: #1a237e; margin-bottom: 4px; }
    .sync-desc { font-size: 12px; color: #666; margin: 0 0 12px; }
    .sync-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .sync-btn { font-size: 12px !important; font-weight: 600 !important; border-radius: 8px !important; }
    .teams-btn { background: #e8f5e9 !important; color: #2e7d32 !important; }
    .matches-btn { background: #e3f2fd !important; color: #1565c0 !important; }
    .players-btn { background: #fff3e0 !important; color: #e65100 !important; }
    .all-btn { background: #1a237e !important; color: #fff !important; }
    .sync-result { margin-top: 10px; font-size: 12px; font-weight: 600; color: #2e7d32; padding: 6px 10px; background: #f1f8e9; border-radius: 6px; }
    .sync-result.sync-err { color: #c62828; background: #ffebee; }

    /* ── Score panel search ── */
    .search-bar { display: flex; align-items: center; gap: 8px; background: #f5f7ff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 8px 14px; }
    .search-bar .search-icon { color: #9e9e9e; font-size: 20px; width: 20px; height: 20px; flex-shrink: 0; }
    .search-bar .search-input { flex: 1; border: none; outline: none; background: transparent; font-size: 14px; color: #222; }
    .search-bar .search-input::placeholder { color: #aaa; }
    .search-bar .clear-btn { border: none; background: none; cursor: pointer; padding: 2px; color: #aaa; display: flex; align-items: center; border-radius: 50%; }
    .search-bar .clear-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .score-search { margin-bottom: 16px; }

    /* ── Match cards (score panel) ── */
    .match-card { margin-bottom: 12px; padding: 14px 16px; border-radius: 12px !important; }
    .match-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .header-left { display:flex; gap:8px; align-items:center; }
    .stage-chip { font-size:11px; color:#666; font-weight:700; text-transform:uppercase; }
    .status-chip { font-size:11px; padding:2px 8px; border-radius:10px; font-weight:600; }
    .status-chip.upcoming { background:#c8e6c9; color:#2e7d32; }
    .status-chip.live { background:#ffcdd2; color:#c62828; }
    .status-chip.completed { background:#e3f2fd; color:#1565c0; }
    .match-time { font-size:11px; color:#888; }
    .teams-row { display:flex; align-items:center; justify-content:center; gap:16px; margin:8px 0; }
    .team { font-size:15px; font-weight:600; }
    .vs { color:#999; font-size:12px; }
    .score { font-size:22px; font-weight:800; color:#1a237e; }
    .actions-row { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:10px; }
    .result-msg { text-align:center; color:#2e7d32; margin-top:8px; font-size:13px; font-weight:500; }
    .result-msg.error { color:#c62828; }
    .stats-section { margin-top:14px; }
    .stats-top-row { display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
    .stats-title { font-size:13px; font-weight:700; color:#1a237e; align-self:center; }
    .stats-total { color:#aaa; font-weight:400; }
    .stats-filters { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .stats-search-wrap { display:flex; align-items:center; gap:4px; background:#f5f7ff; border:1px solid #e0e0e0; border-radius:8px; padding:4px 8px; }
    .stats-search-wrap .s-icon { font-size:16px; width:16px; height:16px; color:#aaa; }
    .stats-search-wrap .search-input { border:none; outline:none; background:transparent; font-size:12px; color:#222; width:130px; }
    .stats-search-wrap .s-clear { border:none; background:none; cursor:pointer; padding:0; color:#aaa; display:flex; align-items:center; }
    .stats-search-wrap .s-clear mat-icon { font-size:14px; width:14px; height:14px; }
    .stats-team-btns { display:flex; gap:4px; }
    .st-btn { border:1.5px solid #e0e0e0; background:#fff; color:#555; font-size:11px; font-weight:700; padding:3px 10px; border-radius:12px; cursor:pointer; transition:all 0.12s; white-space:nowrap; }
    .st-btn:hover { border-color:#1a237e; color:#1a237e; }
    .st-btn.active { background:#1a237e; color:#fff; border-color:#1a237e; }
    .table-wrap { overflow-x:auto; }
    .stats-scroll { max-height:380px; overflow-y:auto; overflow-x:auto; }
    table { width:100%; min-width:600px; }
    .player-cell { display:flex; align-items:center; gap:6px; font-size:13px; }
    .pos-chip { font-size:10px; font-weight:700; padding:1px 4px; border-radius:3px; background:#e3f2fd; color:#1565c0; }
    .pos-chip.GK { background:#fff3e0; color:#e65100; }
    .pos-chip.DEF { background:#e8f5e9; color:#2e7d32; }
    .pos-chip.FWD { background:#fce4ec; color:#c62828; }
    .pts-cell { font-weight:800; color:#1a237e; }
    .cs-yes { color:#2e7d32; font-weight:700; }
    .stat-cell { display:flex; flex-direction:column; align-items:center; line-height:1.2; }
    .sp { font-size:10px; font-weight:700; line-height:1; }
    .sp.pos { color:#2e7d32; }
    .sp.neg { color:#c62828; }

    /* ── Squads browser ── */
    .squads-browser { padding-bottom: 32px; }

    .sq-layout { display: flex; gap: 16px; align-items: flex-start; }

    /* User list panel */
    .sq-user-panel { position: sticky; top: 72px; width: 240px; flex-shrink: 0; background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; }
    .sq-user-search { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; }
    .sq-user-search .search-icon { color: #999; font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
    .sq-user-search .search-input { flex: 1; border: none; outline: none; background: transparent; font-size: 13px; color: #222; min-width: 0; }
    .sq-user-search .clear-btn { border: none; background: none; cursor: pointer; padding: 2px; color: #aaa; display: flex; align-items: center; border-radius: 50%; }
    .sq-user-search .clear-btn mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .sq-user-list { max-height: calc(100vh - 280px); overflow-y: auto; }
    .sq-user-empty { padding: 16px; text-align: center; color: #aaa; font-size: 13px; }
    .sq-user-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f5f5f5; transition: background 0.12s; }
    .sq-user-row:last-child { border-bottom: none; }
    .sq-user-row:hover { background: #f5f7ff; }
    .sq-user-row.sq-user-active { background: #e8eaf6; }
    .sq-u-avatar { width: 32px; height: 32px; border-radius: 50%; background: #1a237e; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
    .sq-u-info { flex: 1; min-width: 0; }
    .sq-u-name { display: block; font-size: 13px; font-weight: 600; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sq-u-sub { display: block; font-size: 10px; color: #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sq-u-pts { font-size: 11px; font-weight: 700; color: #1a237e; white-space: nowrap; flex-shrink: 0; }
    .sq-u-loc { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; margin-left: 4px; vertical-align: middle; }
    .sq-u-loc.tvm { background: #e3f2fd; color: #1565c0; }
    .sq-u-loc.pune { background: #fce4ec; color: #c62828; }

    /* Location filter badges */
    .sq-loc-filters { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
    .loc-badge { border: 1.5px solid #e0e0e0; background: #fff; color: #555; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; cursor: pointer; transition: all 0.12s; }
    .loc-badge:hover { border-color: #1a237e; color: #1a237e; }
    .loc-badge.active { background: #1a237e; color: #fff; border-color: #1a237e; }
    .loc-badge.tvm.active { background: #1565c0; border-color: #1565c0; }
    .loc-badge.pune.active { background: #c62828; border-color: #c62828; }

    /* Add user */
    .sq-add-user-row { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
    .add-user-btn { width: 100%; font-size: 12px !important; color: #1a237e !important; border-color: #c5cae9 !important; }
    .add-user-form { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; background: #fafafa; display: flex; flex-direction: column; gap: 6px; }
    .au-input { border: 1px solid #e0e0e0; border-radius: 6px; padding: 7px 10px; font-size: 12px; outline: none; background: #fff; width: 100%; box-sizing: border-box; }
    .au-input:focus { border-color: #1a237e; }
    .au-select { color: #555; }
    .au-role-row { display: flex; gap: 16px; padding: 4px 2px; }
    .au-radio { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #333; cursor: pointer; }
    .au-radio input { cursor: pointer; accent-color: #1a237e; }
    .au-error { font-size: 11px; color: #c62828; }
    .au-actions { display: flex; gap: 6px; }
    .au-save-btn { background: #1a237e !important; color: #fff !important; font-size: 12px !important; flex: 1; }
    .au-cancel-btn { font-size: 12px !important; color: #888 !important; }

    /* Squad detail panel */
    .sq-detail-panel { flex: 1; min-width: 0; }

    /* Empty state */
    .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px; color: #9e9e9e; text-align: center; }
    .empty-state.small { padding: 24px; }
    .empty-icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.4; }
    .empty-state mat-icon { font-size: 36px; width: 36px; height: 36px; margin-bottom: 8px; opacity: 0.4; }
    .empty-state p { margin: 0; font-size: 14px; }

    /* Single squad */
    .single-squad { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; }
    .sq-single-header { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #f0f0f0; background: #f8f9ff; }
    .user-avatar { width: 40px; height: 40px; border-radius: 50%; background: #1a237e; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; flex-shrink: 0; }
    .user-info { flex: 1; min-width: 0; }
    .user-name { display: block; font-size: 15px; font-weight: 700; color: #1a1a1a; }
    .captain-info { display: block; font-size: 11px; color: #888; margin-top: 2px; }
    .sq-points { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
    .pts-big { font-size: 26px; font-weight: 900; color: #1a237e; line-height: 1; }
    .pts-lbl { font-size: 10px; color: #888; }
    .sq-single-body { padding: 16px 18px; }

    .pos-group { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
    .pos-group:last-child { margin-bottom: 0; }
    .bench-group { border-top: 1px dashed #e0e0e0; padding-top: 10px; margin-top: 4px; }
    .pos-label-badge { font-size: 10px; font-weight: 800; min-width: 38px; padding: 3px 6px; border-radius: 4px; text-align: center; background: #e3f2fd; color: #1565c0; flex-shrink: 0; margin-top: 2px; }
    .bench-lbl { background: #fff3e0; color: #e65100; }

    .pos-tokens { display: flex; flex-wrap: wrap; gap: 6px; }

    .player-tok {
      display: inline-flex; align-items: center; gap: 4px;
      background: #f5f5f5; border-radius: 20px;
      padding: 4px 10px; font-size: 12px;
    }
    .tok-captain { background: #fff9c4; }
    .tok-vc { background: #f3e5f5; }
    .tok-bench { background: #fff3e0; color: #888; }
    .tok-pos { font-size: 9px; font-weight: 700; color: #bbb; }

    .tok-name { font-weight: 500; }
    .tok-badge {
      font-size: 9px; font-weight: 800; padding: 1px 4px; border-radius: 4px;
    }
    .tok-c { background: #f9a825; color: #fff; }
    .tok-vc { background: #9c27b0; color: #fff; }

    /* ── Points breakdown ── */
    .pts-breakdown { border-top: 1px solid #e8eaf6; margin-top: 0; }
    .pts-breakdown-title { display: flex; align-items: center; gap: 8px; padding: 12px 18px 8px; font-size: 13px; font-weight: 800; color: #1a237e; text-transform: uppercase; letter-spacing: 0.5px; }
    .pts-bd-icon { font-size: 18px; width: 18px; height: 18px; color: #3949ab; }

    .pts-match-row { border-top: 1px solid #f0f0f0; }
    .pts-match-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; cursor: pointer; transition: background 0.12s; user-select: none; }
    .pts-match-header:hover { background: #f5f7ff; }
    .pts-match-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
    .pts-stage-tag { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; background: #e8eaf6; color: #3949ab; text-transform: uppercase; flex-shrink: 0; }
    .pts-match-name { font-size: 12px; font-weight: 600; color: #222; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pts-match-score { font-size: 11px; font-weight: 700; color: #1a237e; background: #e8eaf6; padding: 1px 6px; border-radius: 4px; flex-shrink: 0; }
    .pts-match-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .pts-earned { font-size: 13px; font-weight: 800; color: #1a237e; }
    .pts-chevron { font-size: 18px; width: 18px; height: 18px; color: #9e9e9e; }

    .pts-loading { display: flex; align-items: center; gap: 8px; padding: 12px 18px; font-size: 12px; color: #999; }

    .pts-player-table { padding: 4px 12px 10px; display: flex; flex-direction: column; gap: 3px; background: #fafbff; }
    .pts-player-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: #fff; border: 1px solid #f0f0f0; }
    .pts-row-cap { border-color: #ffe082; background: #fffde7; }
    .pts-row-vc { border-color: #e1bee7; background: #fdf5ff; }
    .pts-p-info { display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1; }
    .pts-pos-tag { font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 3px; flex-shrink: 0; }
    .pts-pos-tag.GK { background: #fff3e0; color: #e65100; }
    .pts-pos-tag.DEF { background: #e8f5e9; color: #2e7d32; }
    .pts-pos-tag.MID { background: #e3f2fd; color: #1565c0; }
    .pts-pos-tag.FWD { background: #fce4ec; color: #c62828; }
    .pts-p-name { font-size: 12px; font-weight: 600; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pts-cap-badge { font-size: 9px; font-weight: 900; background: #f9a825; color: #fff; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
    .pts-vc-badge { font-size: 9px; font-weight: 900; background: #9c27b0; color: #fff; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }

    .pts-p-stats { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; flex-shrink: 0; }
    .pts-stat { font-size: 10px; font-weight: 600; padding: 2px 5px; border-radius: 4px; background: #f5f5f5; color: #555; white-space: nowrap; }
    .pts-stat.good { background: #e8f5e9; color: #2e7d32; }
    .pts-stat.bad { background: #ffebee; color: #c62828; }

    .pts-p-total { font-size: 14px; font-weight: 900; color: #1a237e; min-width: 36px; text-align: right; flex-shrink: 0; display: flex; align-items: center; gap: 3px; justify-content: flex-end; }
    .pts-p-total.cap-pts { color: #f9a825; }
    .x2-tag { font-size: 9px; font-weight: 800; background: #f9a825; color: #fff; padding: 1px 4px; border-radius: 3px; }
  `]
})
export class AdminScoresComponent implements OnInit {
  private api = inject(ApiService);

  // Score panel
  matches = signal<Match[]>([]);
  loading = signal(true);
  updating = signal<number | null>(null);
  globalLoading = signal(false);
  loadingMsg = signal('');
  playerStats = signal<any[]>([]);
  statsForMatch = signal<number | null>(null);
  resultMsg = signal('');
  resultMatchId = signal<number | null>(null);
  syncing = signal<string | null>(null);
  syncMsg = signal('');
  statCols = ['player', 'mins', 'goals', 'assists', 'yellowCards', 'redCards', 'cleanSheet', 'saves', 'sot', 'points'];
  scoreSearchQuery = signal('');
  statsPlayerSearch = signal('');
  statsTeamFilter = signal<string | null>(null);

  filteredPlayerStats = computed(() => {
    const q = this.statsPlayerSearch().trim().toLowerCase();
    const team = this.statsTeamFilter();
    let list = this.playerStats();
    if (team) list = list.filter((s: any) => s.player?.team?.name === team);
    if (q) list = list.filter((s: any) => (s.player?.name || '').toLowerCase().includes(q));
    return list;
  });

  // Squads browser
  allUsers = signal<AppUser[]>([]);
  selectedUserId = signal<number | null>(null);
  selectedUserTeam = signal<UserTeam | null>(null);
  selectedUserMatchPoints = signal<any[]>([]);
  matchStatsCache: Record<number, any[]> = {};
  expandedMatchId = signal<number | null>(null);
  userSearchCtrl = new FormControl('');
  userSearchQuery = signal('');
  locationFilter = signal<string | null>(null);
  positions = ['GK', 'DEF', 'MID', 'FWD'];

  // Add user form
  showAddUser = signal(false);
  newUsername = '';
  newDisplayName = '';
  newLocation = '';
  newIsAdmin = 'false';
  addingUser = signal(false);
  addUserError = signal('');

  finishedMatches = computed(() =>
    [...this.matches()].sort((a, b) => new Date(a.matchTime).getTime() - new Date(b.matchTime).getTime())
  );

  filteredMatches = computed(() => {
    const raw = this.scoreSearchQuery().trim().toLowerCase();
    const q = this.normaliseMonth(raw);
    const list = this.finishedMatches();
    if (!q) return list;
    return list.filter(m => {
      const teams = `${m.teamA.name} ${m.teamB.name}`.toLowerCase();
      const date = this.formatShortDate(m.matchTime).toLowerCase();
      return teams.includes(q) || date.includes(q);
    });
  });

  filteredUsers = computed(() => {
    const q = this.userSearchQuery().trim().toLowerCase();
    const loc = this.locationFilter();
    let users = this.allUsers().filter(u => !u.isAdmin);
    if (loc) users = users.filter(u => u.location === loc);
    if (!q) return users;
    return users.filter(u =>
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q)
    );
  });

  ngOnInit() {
    this.loadMatches();
    this.loadUsers();
    this.userSearchCtrl.valueChanges.subscribe(v => this.userSearchQuery.set(v ?? ''));
  }

  // ── Score panel methods ──────────────────────────────────────────

  runSync(type: string) {
    this.syncing.set(type);
    this.syncMsg.set('');
    const obs = type === 'teams'   ? this.api.syncTeams()
              : type === 'matches' ? this.api.syncMatches()
              : type === 'players' ? this.api.syncPlayers()
              :                     this.api.syncAll();
    obs.subscribe({
      next: res => {
        this.syncing.set(null);
        const parts = Object.entries(res).map(([k, v]) => `${k}: ${v}`).join(' · ');
        this.syncMsg.set('✅ Sync complete — ' + parts);
        this.loadMatches();
      },
      error: err => {
        this.syncing.set(null);
        this.syncMsg.set('❌ ' + (err.error?.message || err.message || 'Sync failed'));
      }
    });
  }

  syncFifaPrices() {
    this.syncing.set('fifa');
    this.syncMsg.set('');
    this.api.adminSyncFifaPrices().subscribe({
      next: res => {
        this.syncing.set(null);
        this.syncMsg.set(`✅ FIFA prices synced — ${res.matched} matched, ${res.unmatched} unmatched`);
      },
      error: err => {
        this.syncing.set(null);
        this.syncMsg.set('❌ ' + (err.error?.message || 'FIFA price sync failed'));
      }
    });
  }

  confirmReset() {
    if (!confirm('This will DELETE all teams, matches, players and squads. Are you sure?')) return;
    this.syncing.set('reset');
    this.api.syncReset().subscribe({
      next: () => { this.syncing.set(null); this.syncMsg.set('✅ Database reset complete'); this.loadMatches(); },
      error: err => { this.syncing.set(null); this.syncMsg.set('❌ ' + (err.error?.message || 'Reset failed')); }
    });
  }

  loadMatches() {
    this.globalLoading.set(true);
    this.loadingMsg.set('Loading matches...');
    this.api.adminGetMatches().subscribe({
      next: m => { this.matches.set(m); this.loading.set(false); this.globalLoading.set(false); },
      error: () => { this.loading.set(false); this.globalLoading.set(false); }
    });
  }

  fetchFromEspn(matchId: number) {
    this.updating.set(matchId);
    this.globalLoading.set(true);
    this.loadingMsg.set('Fetching player stats from ESPN...');
    this.resultMsg.set('');
    this.api.adminUpdateScores(matchId).subscribe({
      next: res => {
        this.updating.set(null);
        this.globalLoading.set(false);
        if (res.status === 'success') {
          this.resultMsg.set(`✅ ${res.scoreA} – ${res.scoreB} · ${res.statsCount} player stats fetched`);
          this.resultMatchId.set(matchId);
          this.loadMatches();
          this.loadStats(matchId);
        } else {
          this.resultMsg.set('❌ ' + res.message);
          this.resultMatchId.set(matchId);
        }
      },
      error: err => {
        this.updating.set(null);
        this.globalLoading.set(false);
        this.resultMsg.set('❌ ' + (err.error?.message || 'ESPN fetch failed'));
        this.resultMatchId.set(matchId);
      }
    });
  }

  recalculate(matchId: number) {
    this.globalLoading.set(true);
    this.loadingMsg.set('Recalculating fantasy points...');
    this.api.adminUpdateScores(matchId).subscribe({
      next: res => {
        this.globalLoading.set(false);
        this.resultMsg.set(res.status === 'success'
          ? `✅ Points recalculated — ${res.statsCount} players`
          : '❌ ' + res.message);
        this.resultMatchId.set(matchId);
      },
      error: err => {
        this.globalLoading.set(false);
        this.resultMsg.set('❌ ' + (err.error?.message || 'Recalculation failed'));
        this.resultMatchId.set(matchId);
      }
    });
  }

  toggleStats(matchId: number) {
    if (this.statsForMatch() === matchId) { this.statsForMatch.set(null); return; }
    this.loadStats(matchId);
  }

  loadStats(matchId: number) {
    this.globalLoading.set(true);
    this.loadingMsg.set('Loading player stats...');
    this.statsPlayerSearch.set('');
    this.statsTeamFilter.set(null);
    this.api.adminGetMatchStats(matchId).subscribe(stats => {
      this.playerStats.set(stats);
      this.statsForMatch.set(matchId);
      this.globalLoading.set(false);
    });
  }

  // ── Squads browser methods ───────────────────────────────────────

  loadUsers() {
    this.api.getOverallLeaderboard().subscribe({
      next: users => this.allUsers.set(users),
      error: () => {}
    });
  }

  addUser() {
    if (!this.newUsername.trim()) return;
    this.addingUser.set(true);
    this.addUserError.set('');
    this.api.adminCreateUser(this.newUsername.trim(), this.newDisplayName.trim() || this.newUsername.trim(), this.newLocation, this.newIsAdmin === 'true').subscribe({
      next: res => {
        this.addingUser.set(false);
        if (res.status === 'error') {
          this.addUserError.set(res.message);
        } else {
          this.cancelAddUser();
          this.loadUsers();
        }
      },
      error: () => {
        this.addingUser.set(false);
        this.addUserError.set('Failed to create user.');
      }
    });
  }

  cancelAddUser() {
    this.showAddUser.set(false);
    this.newUsername = '';
    this.newDisplayName = '';
    this.newLocation = '';
    this.newIsAdmin = 'false';
    this.addUserError.set('');
  }

  selectUser(u: AppUser) {
    this.selectedUserId.set(u.id);
    this.selectedUserTeam.set(null);
    this.selectedUserMatchPoints.set([]);
    this.expandedMatchId.set(null);
    this.globalLoading.set(true);
    this.loadingMsg.set('Loading team...');
    this.api.getMyTeam(u.id).subscribe({
      next: team => {
        this.selectedUserTeam.set(team);
        this.globalLoading.set(false);
        this.api.getMyTeamPoints(u.id).subscribe({
          next: pts => this.selectedUserMatchPoints.set(pts),
          error: () => {}
        });
      },
      error: () => { this.selectedUserTeam.set(null); this.globalLoading.set(false); }
    });
  }

  toggleMatchBreakdown(matchId: number) {
    if (this.expandedMatchId() === matchId) { this.expandedMatchId.set(null); return; }
    this.expandedMatchId.set(matchId);
    if (!this.matchStatsCache[matchId]) {
      this.api.adminGetMatchStats(matchId).subscribe({
        next: stats => { this.matchStatsCache[matchId] = stats; },
        error: () => { this.matchStatsCache[matchId] = []; }
      });
    }
  }

  breakdownForMatch(matchId: number, team: any): any[] {
    const stats = this.matchStatsCache[matchId];
    if (!stats || !team) return [];
    const allPlayers = [...(team.starters || []), ...(team.bench || [])];
    const playerIds = new Set(allPlayers.map((p: any) => p.id));
    return stats.filter((s: any) => playerIds.has(s.player?.id));
  }

  private normaliseMonth(s: string): string {
    return s
      .replace(/\bjanuary\b/, 'jan').replace(/\bfebruary\b/, 'feb')
      .replace(/\bmarch\b/, 'mar').replace(/\bapril\b/, 'apr')
      .replace(/\bjune\b/, 'jun').replace(/\bjuly\b/, 'jul')
      .replace(/\baugust\b/, 'aug').replace(/\bseptember\b/, 'sep')
      .replace(/\boctober\b/, 'oct').replace(/\bnovember\b/, 'nov')
      .replace(/\bdecember\b/, 'dec');
  }

  sotBonus(sot: number): number {
    return Math.floor((sot || 0) / 2);
  }

  savesBonus(saves: number): number {
    return Math.floor((saves || 0) / 3);
  }

  goalPts(position: string): number {
    return ({ GK: 9, DEF: 7, MID: 6, FWD: 5 } as any)[position] ?? 6;
  }

  csPts(position: string): number {
    if (position === 'GK' || position === 'DEF') return 5;
    if (position === 'MID') return 1;
    return 0;
  }

  playersByPos(players: any[], pos: string): any[] {
    return (players || []).filter(p => p.position === pos);
  }

  avatarLetter(squad: any): string {
    const name = squad.user?.displayName || squad.user?.username || '?';
    return name[0].toUpperCase();
  }

  // ── Formatters ───────────────────────────────────────────────────

  calcPoints(s: any): number {
    if (!s.minutesPlayed) return 0;
    let pts = 0;
    const pos = s.player?.position || '';
    if (s.minutesPlayed >= 60) pts += 2;
    else pts += 1;
    const gp: Record<string, number> = { GK: 9, DEF: 7, MID: 6, FWD: 5 };
    pts += (s.goals || 0) * (gp[pos] ?? 6);
    pts += (s.assists || 0) * 3;
    if (s.cleanSheet && s.minutesPlayed >= 60) {
      if (pos === 'GK' || pos === 'DEF') pts += 5;
      else if (pos === 'MID') pts += 1;
    }
    if (pos === 'GK' || pos === 'DEF') {
      const gc = s.goalsConceded || 0;
      if (gc > 1) pts -= (gc - 1);
    }
    pts -= (s.yellowCards || 0);
    pts -= (s.redCards || 0) * 2;
    pts -= (s.ownGoals || 0) * 2;
    if (pos === 'GK') pts += Math.floor((s.saves || 0) / 3);
    if (pos === 'FWD') pts += Math.floor((s.shotsOnTarget || 0) / 2);
    return pts;
  }

  formatDate(dt: string): string {
    return new Date(dt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  formatShortDate(dt: string): string {
    return new Date(dt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }
}
