import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { AppUser, Match, UserTeam, RoundConfig } from '../../models/models';
import { PointsGuideComponent } from '../points-guide/points-guide.component';
import { AdminDbComponent } from '../admin-db/admin-db.component';

@Component({
  selector: 'app-admin-scores',
  standalone: true,
  imports: [
    MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule,
    MatTableModule, MatChipsModule, MatExpansionModule,
    MatSelectModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule,
    FormsModule, ReactiveFormsModule, UpperCasePipe, PointsGuideComponent, AdminDbComponent
  ],
  template: `
    @if (globalLoading()) {
      <div class="overlay">
        <mat-spinner diameter="50"></mat-spinner>
        <p>{{ loadingMsg() }}</p>
      </div>
    }

    <div class="admin-header">
      <h3 class="page-title">⚡ Admin Panel</h3>
      <div class="admin-nav">
        @for (item of adminTabs(); track item.key) {
          <button class="nav-item" [class.nav-active]="activeTab() === item.key" (click)="setTab(item.key)" [title]="item.label">
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-label">{{ item.label }}</span>
          </button>
        }
      </div>
    </div>

    <div class="admin-content">

      <!-- ═══════════════════ SCORE PANEL ═══════════════════ -->
      @if (activeTab() === 'scores') {
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
            <button mat-flat-button class="sync-btn players-btn" disabled title="Player sync disabled">
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
          <mat-card class="match-card" [class.match-card-preview]="previewMatchId() === match.id" appearance="outlined">
            <div class="match-header">
              <div class="header-left">
                <span class="stage-chip">{{ matchLabel(match) }}</span>
                <span class="status-chip" [class]="match.status.toLowerCase()">{{ match.status }}</span>
              </div>
              <span class="match-time">{{ formatDate(match.matchTime) }}</span>
            </div>

            <div class="teams-row">
              <span class="team">{{ teamName(match, 'A') }}</span>
              @if (match.status === 'COMPLETED' || match.status === 'LIVE') {
                <span class="score">{{ match.scoreA }} – {{ match.scoreB }}</span>
              } @else {
                <span class="vs">VS</span>
              }
              <span class="team">{{ teamName(match, 'B') }}</span>
            </div>

            <!-- Action buttons row -->
            <div class="actions-row">
              <!-- Step 1: Fetch & Preview -->
              @if (previewMatchId() !== match.id) {
                <button class="espn-btn"
                  [disabled]="previewing() === match.id || saving() === match.id || !espnFetchReady(match)"
                  (click)="previewFromEspn(match)">
                  @if (previewing() === match.id) {
                    <mat-spinner diameter="16" class="espn-spinner"></mat-spinner>
                  } @else {
                    <mat-icon class="espn-icon">sports_soccer</mat-icon>
                  }
                  <span>{{ previewing() === match.id ? 'Fetching…' : 'Fetch from ESPN' }}</span>
                </button>
              }
              @if (previewMatchId() === match.id) {
                <button class="espn-btn espn-btn-refetch"
                  [disabled]="previewing() === match.id || saving() === match.id"
                  (click)="previewFromEspn(match)">
                  @if (previewing() === match.id) {
                    <mat-spinner diameter="16" class="espn-spinner"></mat-spinner>
                  } @else {
                    <mat-icon class="espn-icon">refresh</mat-icon>
                  }
                  <span>Re-fetch</span>
                </button>
                <button class="save-pts-btn"
                  [disabled]="saving() === match.id"
                  (click)="saveAndCalculate(match.id)">
                  @if (saving() === match.id) {
                    <mat-spinner diameter="16" class="espn-spinner"></mat-spinner>
                  } @else {
                    <mat-icon class="espn-icon">calculate</mat-icon>
                  }
                  <span>{{ saving() === match.id ? 'Saving…' : 'Save & Calculate Points' }}</span>
                </button>
                <button class="discard-btn" (click)="discardPreview()">✕ Discard</button>
              }
            </div>

            @if (resultMsg() && resultMatchId() === match.id) {
              <div class="result-msg" [class.error]="resultMsg().startsWith('❌')">{{ resultMsg() }}</div>
            }

            <!-- Preview / edit panel -->
            @if (previewMatchId() === match.id && previewStats().length > 0) {
              <div class="preview-section">
                <div class="preview-sticky-header">
                <div class="preview-header">
                  <!-- Score editors -->
                  <div class="score-edit-row">
                    <span class="score-edit-team">{{ teamName(match, 'A') }}</span>
                    <input class="score-edit-input" type="number" min="0" [(ngModel)]="previewScoreA" title="Score A">
                    <span class="score-edit-sep">–</span>
                    <input class="score-edit-input" type="number" min="0" [(ngModel)]="previewScoreB" title="Score B">
                    <span class="score-edit-team">{{ teamName(match, 'B') }}</span>
                  </div>
                  <!-- Filter / search -->
                  <div class="preview-filters">
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
                      <button class="st-btn" [class.active]="statsTeamFilter() === teamName(match, 'A')" (click)="statsTeamFilter.set(teamName(match, 'A'))">{{ teamName(match, 'A') }}</button>
                      <button class="st-btn" [class.active]="statsTeamFilter() === teamName(match, 'B')" (click)="statsTeamFilter.set(teamName(match, 'B'))">{{ teamName(match, 'B') }}</button>
                    </div>
                    <div class="stats-team-btns">
                      <button class="st-btn" [class.active]="statsPosFilter() === null" (click)="statsPosFilter.set(null)">All Pos</button>
                      @for (pos of ['GK','DEF','MID','FWD']; track pos) {
                        <button class="st-btn st-pos-btn" [class.active]="statsPosFilter() === pos" (click)="statsPosFilter.set(pos)">{{ pos }}</button>
                      }
                    </div>
                  </div>
                  <div class="preview-count-row">
                    <div class="preview-count">{{ filteredPreviewStats().length }} / {{ previewStats().length }} players</div>
                    <button class="st-btn st-sort-btn" [class.active]="previewSortByPts()" (click)="previewSortByPts.set(!previewSortByPts())">
                      ↓ Pts
                    </button>
                  </div>
                </div>
                </div> <!-- /preview-sticky-header -->

                <!-- Editable player cards (scrollable) -->
                <div class="preview-cards-scroll">
                <div class="preview-cards">
                  @for (s of filteredPreviewStats(); track s.playerId) {
                    <div class="pv-card" [class.pv-dnp]="s.minutesPlayed === 0">
                      <div class="pv-card-head">
                        <span class="pos-chip" [class]="s.position">{{ s.position }}</span>
                        <span class="pv-name">{{ s.playerName }}</span>
                        <span class="pv-team-label">{{ s.teamName }}</span>
                        <span class="pv-pts-badge">{{ calcPreviewPoints(s) }} pts</span>
                      </div>
                      <div class="pv-fields">
                        <div class="pv-field">
                          <label>Mins</label>
                          <input type="number" min="0" max="120" [(ngModel)]="s.minutesPlayed" (ngModelChange)="triggerPreviewRefresh()">
                        </div>
                        <div class="pv-field">
                          <label>⚽ Goals</label>
                          <input type="number" min="0" [(ngModel)]="s.goals" (ngModelChange)="triggerPreviewRefresh()">
                        </div>
                        <div class="pv-field">
                          <label>🅰 Assists</label>
                          <input type="number" min="0" [(ngModel)]="s.assists" (ngModelChange)="triggerPreviewRefresh()">
                        </div>
                        <div class="pv-field">
                          <label>🟨 YC</label>
                          <input type="number" min="0" [(ngModel)]="s.yellowCards" (ngModelChange)="triggerPreviewRefresh()">
                        </div>
                        <div class="pv-field">
                          <label>🟥 RC</label>
                          <input type="number" min="0" [(ngModel)]="s.redCards" (ngModelChange)="triggerPreviewRefresh()">
                        </div>
                        @if (s.position === 'GK' || s.position === 'DEF') {
                          <div class="pv-field pv-field-cs">
                            <label>🛡 CS</label>
                            <input type="checkbox" [(ngModel)]="s.cleanSheet" (ngModelChange)="triggerPreviewRefresh()">
                          </div>
                          <div class="pv-field">
                            <label>Goals Con.</label>
                            <input type="number" min="0" [(ngModel)]="s.goalsConceded" (ngModelChange)="triggerPreviewRefresh()">
                          </div>
                        }
                        @if (s.position === 'GK') {
                          <div class="pv-field">
                            <label>🧤 Saves</label>
                            <input type="number" min="0" [(ngModel)]="s.saves" (ngModelChange)="triggerPreviewRefresh()">
                          </div>
                        }
                        @if (s.position === 'FWD') {
                          <div class="pv-field">
                            <label>🎯 SoT</label>
                            <input type="number" min="0" [(ngModel)]="s.shotsOnTarget" (ngModelChange)="triggerPreviewRefresh()">
                          </div>
                        }
                        @if (s.position === 'MID') {
                          <div class="pv-field pv-field-cs">
                            <label>🛡 CS</label>
                            <input type="checkbox" [(ngModel)]="s.cleanSheet" (ngModelChange)="triggerPreviewRefresh()">
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>
                </div> <!-- /preview-cards-scroll -->
              </div>
            }
          </mat-card>
        }
      }

      <!-- ═══════════════════ POINTS GUIDE ═══════════════════ -->
      @if (activeTab() === 'guide') {
        <div style="padding-top:16px">
          <app-points-guide [collapsible]="false" [compact]="false" />
        </div>
      }

      <!-- ═══════════════════ SQUAD AUDIT ═══════════════════ -->
      @if (activeTab() === 'audit') {
        <div class="audit-wrap">
          <div class="audit-toolbar">
            <span class="audit-title">🔍 Squad Position Audit</span>
            <button class="audit-refresh-btn" [disabled]="auditLoading()" (click)="runSquadAudit()">
              @if (auditLoading()) { <mat-spinner diameter="14" style="display:inline-block;margin-right:6px"></mat-spinner> }
              Refresh
            </button>
          </div>
          <p class="subtitle">Lists every player whose position doesn't match their squad slot (e.g. a FWD saved in a DEF slot).</p>

          @if (auditMsg()) {
            <div class="audit-msg" [class.audit-ok]="auditRows().length === 0">{{ auditMsg() }}</div>
          }

          @if (auditLoading()) {
            <div class="audit-loading"><mat-spinner diameter="32"></mat-spinner></div>
          } @else if (auditRows().length > 0) {
            <div class="audit-table-wrap">
              <table class="audit-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Formation</th>
                    <th>Section</th>
                    <th>Slot #</th>
                    <th>Slot Pos</th>
                    <th>Player</th>
                    <th>Player Pos</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of auditRows(); track $index) {
                    <tr>
                      <td>
                        <div class="audit-user">
                          <span class="audit-display">{{ row.displayName || row.username }}</span>
                          <span class="audit-uid">#{{ row.userId }}</span>
                        </div>
                      </td>
                      <td><span class="audit-formation">{{ row.formation }}</span></td>
                      <td>
                        <span class="audit-section" [class.bench-sec]="row.section === 'BENCH'">{{ row.section }}</span>
                      </td>
                      <td class="audit-num">{{ row.slotIndex + 1 }}</td>
                      <td><span class="pos-tag" [class]="row.slotPosition">{{ row.slotPosition }}</span></td>
                      <td class="audit-pname">{{ row.playerName }}</td>
                      <td><span class="pos-tag mismatch" [class]="row.playerPosition">{{ row.playerPosition }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <!-- Country limit audit -->
          <div class="audit-toolbar" style="margin-top:28px">
            <span class="audit-title">🌍 Country Limit Audit</span>
            <button class="audit-refresh-btn" [disabled]="countryAuditLoading()" (click)="runCountryAudit()">
              @if (countryAuditLoading()) { <mat-spinner diameter="14" style="display:inline-block;margin-right:6px"></mat-spinner> }
              Run Check
            </button>
          </div>
          <p class="subtitle">Lists users whose squad has more players from the same country than the current stage allows (full squad of 15).</p>

          @if (countryAuditMsg()) {
            <div class="audit-msg" [class.audit-ok]="countryAuditRows().length === 0">{{ countryAuditMsg() }}</div>
          }

          @if (countryAuditLoading()) {
            <div class="audit-loading"><mat-spinner diameter="32"></mat-spinner></div>
          } @else if (countryAuditRows().length > 0) {
            @for (user of countryAuditRows(); track user.userId) {
              <div class="cl-user-block">
                <div class="cl-user-header">
                  <div class="cl-user-info">
                    <span class="audit-display">{{ user.displayName || user.username }}</span>
                    <span class="audit-uid">#{{ user.userId }}</span>
                  </div>
                  <span class="cl-stage-badge">Stage: {{ user.stage }}</span>
                </div>
                @for (v of user.violations; track v.countryId) {
                  <div class="cl-violation">
                    <div class="cl-violation-header">
                      <span class="cl-country">{{ v.countryName }}</span>
                      <span class="cl-count-badge">{{ v.count }} / {{ v.limit }} max</span>
                    </div>
                    <div class="cl-players">
                      @for (p of v.players; track p.id) {
                        <div class="cl-player" [class.cl-player-bench]="p.section === 'BENCH'">
                          <span class="pos-tag" [class]="p.position">{{ p.position }}</span>
                          <span class="cl-pname">{{ p.name }}</span>
                          <span class="audit-section" [class.bench-sec]="p.section === 'BENCH'">{{ p.section }}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          }
        </div>
      }

      <!-- ═══════════════════ DB CONFIG ═══════════════════ -->
      @if (activeTab() === 'db') {
        <div class="db-tab-host">
          <app-admin-db></app-admin-db>
        </div>
      }

      <!-- ═══════════════════ USER SQUADS ═══════════════════ -->
      @if (activeTab() === 'users') {
        <div class="squads-browser">

          <div class="sq-layout" [class.mobile-show-squad]="squadMobileView() === 'pitch'">

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

              <!-- Add / bulk upload buttons -->
              <div class="sq-add-user-row">
                <button mat-stroked-button class="add-user-btn" (click)="showAddUser.set(true); showBulkUpload.set(false)">
                  <mat-icon>person_add</mat-icon> Add User
                </button>
                <button mat-stroked-button class="add-user-btn bulk-btn" (click)="showBulkUpload.set(true); showAddUser.set(false)">
                  <mat-icon>upload_file</mat-icon> Bulk Upload
                </button>
              </div>

              <!-- Bulk upload form -->
              @if (showBulkUpload()) {
                <div class="add-user-form">
                  <div class="au-upload-hint">Upload the FIFA Fantasy League Users Excel (.xlsx). Columns mapped: <b>Hash ID → username</b>, <b>Full Name → display name</b>, <b>Location → location</b>.</div>
                  <input #xlsxInput type="file" accept=".xlsx" class="au-file-input" (change)="onXlsxSelected($event)">
                  @if (uploadResult()) {
                    <div class="au-upload-result" [class.au-error]="uploadResult()!.error">
                      @if (uploadResult()!.error) {
                        ❌ {{ uploadResult()!.error }}
                      } @else {
                        ✅ Created: <b>{{ uploadResult()!.created }}</b> &nbsp;·&nbsp; Skipped: <b>{{ uploadResult()!.skipped }}</b>
                        @if (uploadResult()!.errors?.length) {
                          <ul class="au-upload-errors">
                            @for (e of uploadResult()!.errors; track $index) { <li>{{ e }}</li> }
                          </ul>
                        }
                      }
                    </div>
                  }
                  <div class="au-actions">
                    <button mat-flat-button class="au-save-btn" [disabled]="!uploadFile || uploadingBulk()" (click)="uploadUsers()">
                      @if (uploadingBulk()) { <mat-spinner diameter="14" style="display:inline-block;margin-right:4px"></mat-spinner> }
                      Upload
                    </button>
                    <button mat-button class="au-cancel-btn" (click)="cancelBulkUpload()">Cancel</button>
                  </div>
                </div>
              }

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
                    [class.sq-user-no-squad]="noSquadUserId() === u.id"
                    (click)="selectUser(u)">
                    <div class="sq-u-avatar">{{ u.displayName[0] || u.username[0] | uppercase }}</div>
                    <div class="sq-u-info">
                      <span class="sq-u-name">{{ u.displayName || u.username }}</span>
                      @if (noSquadUserId() === u.id) {
                        <span class="sq-u-no-squad-msg">No squad saved yet</span>
                      } @else {
                        <span class="sq-u-sub">
                          {{ u.username }}
                          @if (u.location && locEditId() !== u.id) {
                            <span class="sq-u-loc" [class.tvm]="u.location === 'TVM'" [class.pune]="u.location === 'Pune'">{{ u.location }}</span>
                          }
                        </span>
                      }
                    </div>
                    <span class="sq-u-pts">{{ u.totalPoints }} pts</span>
                  </div>
                }
                @if (filteredUsers().length === 0 && allUsers().length > 0) {
                  <div class="sq-user-empty">No users match</div>
                }
              </div>
            </div>

            <!-- RIGHT: squad detail (pitch view) -->
            <div class="sq-detail-panel">
              @if (!selectedUserId()) {
                <div class="empty-state">
                  <mat-icon class="empty-icon">person_search</mat-icon>
                  <p>Select a user to view their team</p>
                </div>
              } @else if (selectedUserTeam() === null && !globalLoading()) {
                <div class="sq-no-squad-wrap">
                  <div class="empty-state small">
                    <mat-icon>inbox</mat-icon>
                    <p>No squad saved yet.</p>
                  </div>
                  <!-- Mobile: back to users -->
                  <div class="sq-back-bar">
                    <button class="sq-back-btn" (click)="squadMobileView.set('users')">⬅ Back to Users</button>
                  </div>
                </div>
              } @else if (selectedUserTeam(); as team) {
                <div class="sq-pitch-wrap">

                  <!-- User header -->
                  <div class="sq-single-header">
                    <div class="user-avatar">{{ (team.user.displayName || team.user.username)[0] | uppercase }}</div>
                    <div class="user-info">
                      <span class="user-name">{{ team.user.displayName || team.user.username }}</span>
                      <span class="captain-info">
                        C: {{ team.captain.name || '—' }}
                        @if (team.viceCaptain.name) { · VC: {{ team.viceCaptain.name }} }
                      </span>
                    </div>
                    <div class="sq-points">
                      <span class="pts-big">{{ team.user.totalPoints }}</span>
                      <span class="pts-lbl">pts</span>
                    </div>
                    <!-- display toggle -->
                    <select class="sq-display-select" [(ngModel)]="sqPitchDisplay">
                      <option value="price">Price</option>
                      <option value="pts">Points</option>
                    </select>
                  </div>

                  <!-- Transfer summary per round -->
                  @if (selectedUserTransfers().length > 0) {
                    <div class="sq-transfers">
                      <div class="sq-tr-title">Transfers by Round</div>
                      <div class="sq-tr-rows">
                        @for (r of selectedUserTransfers(); track r.stage) {
                          <div class="sq-tr-row" [class.sq-tr-penalty]="r.penaltyPoints > 0">
                            <span class="sq-tr-stage">{{ stageLabel(r.stage) }}</span>
                            <span class="sq-tr-made">{{ r.transfersMade }} / {{ freeTransfersFor(r.stage) }} free</span>
                            @if (r.penaltyPoints > 0) {
                              <span class="sq-tr-pen">−{{ r.penaltyPoints }} pts</span>
                            } @else {
                              <span class="sq-tr-ok">✓</span>
                            }
                          </div>
                        }
                      </div>
                    </div>
                  }

                  <!-- Pitch canvas -->
                  <div class="sq-pitch">
                    <div class="pitch-markings">
                      <div class="pm halfway"></div>
                      <div class="pm center-circle"></div>
                      <div class="pm penalty-top"></div>
                      <div class="pm penalty-bot"></div>
                      <div class="pm goal-top"></div>
                      <div class="pm goal-bot"></div>
                    </div>

                    @for (row of sqPitchRows(team); track $index) {
                      <div class="pitch-row">
                        @for (p of row; track p.id) {
                          <div class="p-slot">
                            <div class="p-card" [class.p-card-captain]="p.id === team.captain.id" [class.p-card-vc]="p.id === team.viceCaptain.id">
                              <div class="p-card-icons ro-icons">
                                <div class="cap-badges">
                                  @if (p.id === team.captain.id) { <span class="cap-icon c-icon">C</span> }
                                  @if (p.id === team.viceCaptain.id) { <span class="cap-icon vc-icon">V</span> }
                                </div>
                              </div>
                              <div class="p-avatar filled-av" [style.--pc]="sqPosColor(p.position)"></div>
                              <div class="p-name-bar">{{ sqShortName(p.name) }}</div>
                              <div class="p-price-bar" [style.background]="sqPosColor(p.position)">
                                {{ sqPitchDisplay === 'pts' ? (ppPlayerPoints()[p.id] ?? 0) + ' pts' : fmtM(p.price) }}
                              </div>
                            </div>
                          </div>
                        }
                      </div>
                    }
                  </div>

                  <!-- Bench strip -->
                  <div class="sq-bench-strip">
                    <div class="bench-strip-label">BENCH</div>
                    <div class="bench-strip-slots">
                      @for (p of (team.bench || []); track p.id) {
                        <div class="p-slot is-bench">
                          <div class="p-card p-card-bench" [class.p-card-captain]="p.id === team.captain.id" [class.p-card-vc]="p.id === team.viceCaptain.id">
                            <div class="bench-badge">SUB</div>
                            <div class="p-card-icons ro-icons">
                              <div class="cap-badges">
                                @if (p.id === team.captain.id) { <span class="cap-icon c-icon">C</span> }
                                @if (p.id === team.viceCaptain.id) { <span class="cap-icon vc-icon">V</span> }
                              </div>
                            </div>
                            <div class="p-avatar filled-av" [style.--pc]="sqPosColor(p.position)"></div>
                            <div class="p-name-bar">{{ sqShortName(p.name) }}</div>
                            <div class="p-price-bar" [style.background]="sqPosColor(p.position)">
                              {{ sqPitchDisplay === 'pts' ? (ppPlayerPoints()[p.id] ?? 0) + ' pts' : fmtM(p.price) }}
                            </div>
                          </div>
                        </div>
                      }
                    </div>
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
                          <div class="pts-match-header">
                            <div class="pts-match-left">
                              <span class="pts-stage-tag">{{ mp.stage }}</span>
                              <span class="pts-match-name">{{ teamName(mp.match, 'A') }} vs {{ teamName(mp.match, 'B') }}</span>
                              <span class="pts-match-score">{{ mp.match.scoreA ?? '?' }}–{{ mp.match.scoreB ?? '?' }}</span>
                            </div>
                            <div class="pts-match-right">
                              <span class="pts-earned">{{ mp.pointsEarned }} pts</span>
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  }

                  <!-- Mobile: back to users -->
                  <div class="sq-back-bar">
                    <button class="sq-back-btn" (click)="squadMobileView.set('users')">⬅ Back to Users</button>
                  </div>

                </div>
              }
            </div>

          </div>
        </div>
      }

      <!-- ═══════════════════ ROUND CONFIG ═══════════════════ -->
      @if (activeTab() === 'rounds') {
        <div class="rc-wrap">
          <p class="subtitle">Edit transfer window rules per round. Changes take effect immediately — no redeploy needed.</p>

          <div class="rc-toolbar">
            <button class="rc-sync-btn" [disabled]="rcSyncing()" (click)="syncRoundStarts()">
              @if (rcSyncing()) { <mat-spinner diameter="14" style="display:inline-block;margin-right:6px"></mat-spinner> }
              🔄 Sync Start Times from Matches
            </button>
          </div>

          @if (rcLoading()) {
            <div class="rc-loading">Loading config…</div>
          } @else {
            <div class="rc-table">
              <div class="rc-header">
                <span class="rc-col rc-stage">Stage</span>
                <span class="rc-col">Free Xfers</span>
                <span class="rc-col">Country Limit</span>
                <span class="rc-col">Open (hr)</span>
                <span class="rc-col">Close (hr)</span>
                <span class="rc-col">Timezone</span>
                <span class="rc-col rc-col-wide">Round Start (IST)</span>
                <span class="rc-col"></span>
              </div>
              @for (row of rcRows(); track row.stage) {
                <div class="rc-row" [class.rc-editing]="rcEditStage() === row.stage">
                  <span class="rc-col rc-stage">
                    <span class="stage-badge">{{ row.stage }}</span>
                  </span>
                  @if (rcEditStage() === row.stage) {
                    <span class="rc-col"><input class="rc-input" type="number" [(ngModel)]="rcEdit.freeTransfers" min="1" max="15"></span>
                    <span class="rc-col"><input class="rc-input" type="number" [(ngModel)]="rcEdit.countryLimit" min="1" max="11"></span>
                    <span class="rc-col"><input class="rc-input" type="number" [(ngModel)]="rcEdit.windowOpenHour" min="0" max="23"></span>
                    <span class="rc-col"><input class="rc-input" type="number" [(ngModel)]="rcEdit.windowCloseHour" min="1" max="24"></span>
                    <span class="rc-col"><input class="rc-input rc-tz" type="text" [(ngModel)]="rcEdit.windowTimezone"></span>
                    <span class="rc-col rc-col-wide"><input class="rc-input rc-dt" type="datetime-local" [(ngModel)]="rcEdit.roundStart" placeholder="yyyy-MM-ddTHH:mm"></span>
                    <span class="rc-col rc-actions">
                      <button class="rc-save-btn" (click)="saveRcRow(row.stage)">Save</button>
                      <button class="rc-cancel-btn" (click)="rcEditStage.set(null)">Cancel</button>
                    </span>
                  } @else {
                    <span class="rc-col rc-val">{{ row.freeTransfers }}</span>
                    <span class="rc-col rc-val">{{ row.countryLimit }}</span>
                    <span class="rc-col rc-val">{{ row.windowOpenHour }}:00</span>
                    <span class="rc-col rc-val">{{ row.windowCloseHour }}:00</span>
                    <span class="rc-col rc-val rc-tz-val">{{ row.windowTimezone }}</span>
                    <span class="rc-col rc-col-wide rc-val rc-dt-val">{{ row.roundStart ? formatRoundStart(row.roundStart) : '—' }}</span>
                    <span class="rc-col rc-actions">
                      <button class="rc-edit-btn" (click)="startRcEdit(row)">Edit</button>
                    </span>
                  }
                </div>
              }
            </div>
            @if (rcMsg()) {
              <div class="rc-msg" [class.rc-err]="rcMsgErr()">{{ rcMsg() }}</div>
            }
          }
        </div>
      }

      <!-- ═══════════════════ PLAYER POOL ═══════════════════ -->
      @if (activeTab() === 'players') {
        <div class="pp-wrap">
          <div class="pp-controls">
            <input class="pp-search" placeholder="Search player or team…" [(ngModel)]="ppSearch" (ngModelChange)="filterPlayers()">
            <select class="pp-pos-filter" [(ngModel)]="ppPos" (ngModelChange)="filterPlayers()">
              <option value="">All positions</option>
              <option value="GK">GK</option>
              <option value="DEF">DEF</option>
              <option value="MID">MID</option>
              <option value="FWD">FWD</option>
            </select>
            <button class="pp-elim-toggle" [class.pp-elim-on]="ppShowEliminated()" (click)="ppShowEliminated.update(v => !v); filterPlayers()">
              {{ ppShowEliminated() ? '👁 Hide Eliminated' : '🚫 Show Eliminated' }}
            </button>
            @if (!showAddPlayer()) {
              <button class="pp-add-open-btn" (click)="showAddPlayer.set(true)">+ Add Player</button>
            }
            <label class="pp-price-upload-btn" [class.pp-uploading]="ppPriceUploading()">
              @if (ppPriceUploading()) { ⏳ Uploading… } @else { 📥 Upload Prices }
              <input type="file" accept=".xlsx,.xls" style="display:none" [disabled]="ppPriceUploading()" (change)="onPriceFileChange($event)">
            </label>
          </div>

          @if (ppPriceResult()) {
            <div class="pp-price-result" [class.pp-price-err]="ppPriceResult()!.error">
              @if (ppPriceResult()!.error) {
                ❌ {{ ppPriceResult()!.error }}
              } @else {
                ✅ Updated: {{ ppPriceResult()!.updated }} &nbsp;|&nbsp; Not found: {{ ppPriceResult()!.notFound }} &nbsp;|&nbsp; Skipped: {{ ppPriceResult()!.skipped }}
                @if (ppPriceResult()!.errors?.length) {
                  <div class="pp-price-errs">
                    @for (e of ppPriceResult()!.errors; track e) { <div>⚠ {{ e }}</div> }
                  </div>
                }
              }
            </div>
          }

          @if (showAddPlayer()) {
            <div class="pp-add-form">
              <input class="pp-add-input" placeholder="Player name *" [(ngModel)]="ppNewName">
              <select class="pp-add-select" [(ngModel)]="ppNewPos">
                <option value="">Position *</option>
                <option value="GK">GK</option>
                <option value="DEF">DEF</option>
                <option value="MID">MID</option>
                <option value="FWD">FWD</option>
              </select>
              <select class="pp-add-select pp-add-team" [(ngModel)]="ppNewTeamId">
                <option value="">Team *</option>
                @for (t of allTeams(); track t.id) {
                  <option [value]="t.id">{{ t.name }}</option>
                }
              </select>
              <input class="pp-add-input pp-add-price" type="number" step="500000" min="1000000"
                placeholder="Price (e.g. 6000000)" [(ngModel)]="ppNewPrice">
              <div class="pp-add-actions">
                <button class="pp-save-btn" [disabled]="!ppNewName.trim() || !ppNewPos || !ppNewTeamId || ppAddSaving()" (click)="addPpPlayer()">
                  @if (ppAddSaving()) { <mat-spinner diameter="12" style="display:inline-block"></mat-spinner> }
                  @else { Save }
                </button>
                <button class="pp-cancel-btn" (click)="showAddPlayer.set(false)">Cancel</button>
              </div>
            </div>
          }

          <div class="pp-count">{{ ppFiltered().length }} player{{ ppFiltered().length === 1 ? '' : 's' }}</div>

          <div class="pp-table">
            <div class="pp-header">
              <span class="pp-col pp-name pp-sortable" (click)="setPpSort('name')">Player {{ ppSortIcon('name') }}</span>
              <span class="pp-col pp-team pp-sortable" (click)="setPpSort('team')">Team {{ ppSortIcon('team') }}</span>
              <span class="pp-col pp-pos">Pos</span>
              <span class="pp-col pp-price pp-sortable" (click)="setPpSort('price')">Price {{ ppSortIcon('price') }}</span>
              <span class="pp-col pp-pts pp-sortable" (click)="setPpSort('pts')">Pts {{ ppSortIcon('pts') }}</span>
              <span class="pp-col pp-action"></span>
            </div>
            @for (p of ppFiltered(); track p.id) {
              <div class="pp-row">
                <span class="pp-col pp-name">
                  {{ p.name }}
                  @if (p.team?.eliminated) {
                    <span class="pp-elim-badge" title="Team eliminated">✕</span>
                  }
                </span>
                <span class="pp-col pp-team">{{ p.team?.name }}</span>
                <span class="pp-col pp-pos">
                  @if (ppEditId() === p.id) {
                    <select class="pp-pos-edit" [(ngModel)]="ppEditPos">
                      <option value="GK">GK</option>
                      <option value="DEF">DEF</option>
                      <option value="MID">MID</option>
                      <option value="FWD">FWD</option>
                    </select>
                  } @else {
                    <span class="pp-pos-badge" [style.background]="ppPosColor(p.position)">{{ p.position }}</span>
                  }
                </span>
                <span class="pp-col pp-price">
                  @if (ppEditId() === p.id) {
                    <input class="pp-price-input" type="number" step="100000" min="1000000"
                      [(ngModel)]="ppEditPrice" (keyup.enter)="savePpPrice(p)" (keyup.escape)="ppEditId.set(null)">
                  } @else {
                    {{ fmtM(p.price) }}
                  }
                </span>
                <span class="pp-col pp-pts">{{ ppPlayerPoints()[p.id] ?? 0 }}</span>
                <span class="pp-col pp-action">
                  @if (ppEditId() === p.id) {
                    <button class="pp-save-btn" (click)="savePpPrice(p)"
                      [disabled]="ppSaving()">
                      @if (ppSaving()) { <mat-spinner diameter="12" style="display:inline-block"></mat-spinner> }
                      @else { ✓ }
                    </button>
                    <button class="pp-cancel-btn" (click)="ppEditId.set(null)">✕</button>
                  } @else {
                    <button class="pp-edit-btn" (click)="startPpEdit(p)">Edit</button>
                    <button class="pp-del-btn" [disabled]="ppDeleting() === p.id" (click)="deletePpPlayer(p)" title="Delete player">🗑</button>
                  }
                </span>
              </div>
            }
            @if (ppFiltered().length === 0) {
              <div class="pp-empty">No players match</div>
            }
          </div>

          @if (ppMsg()) {
            <div class="pp-msg" [class.pp-err]="ppMsgErr()">{{ ppMsg() }}</div>
          }
        </div>
      }

      <!-- ═══════════════════ TEAMS ═══════════════════ -->
      @if (activeTab() === 'teams') {
        <div class="pp-wrap">
          <div class="pp-controls">
            <input class="pp-search" placeholder="Search team…" [(ngModel)]="taSearch" (ngModelChange)="filterTeams()">
          </div>
          @if (teamsAdminLoading()) {
            <div class="pp-empty">Loading teams…</div>
          } @else {
            <div class="teams-admin-table">
              <div class="ta-header">
                <span class="ta-col ta-name pp-sortable" (click)="setTaSort('name')">Team {{ taSortIcon('name') }}</span>
                <span class="ta-col ta-code pp-sortable" (click)="setTaSort('code')">Code {{ taSortIcon('code') }}</span>
                <span class="ta-col ta-group pp-sortable" (click)="setTaSort('group')">Group {{ taSortIcon('group') }}</span>
                <span class="ta-col ta-status pp-sortable" (click)="setTaSort('status')">Status {{ taSortIcon('status') }}</span>
                <span class="ta-col ta-action"></span>
              </div>
              @for (t of taFiltered(); track t.id) {
                <div class="ta-row" [class.ta-eliminated]="t.eliminated">
                  <span class="ta-col ta-name">
                    {{ t.name }}
                    @if (t.eliminated) {
                      <span class="ta-elim-tag">OUT</span>
                    }
                  </span>
                  <span class="ta-col ta-code">{{ t.code }}</span>
                  <span class="ta-col ta-group">{{ t.group ?? '—' }}</span>
                  <span class="ta-col ta-status">
                    @if (t.eliminated) {
                      <span class="ta-status-badge ta-out">Eliminated</span>
                    } @else {
                      <span class="ta-status-badge ta-in">Active</span>
                    }
                  </span>
                  <span class="ta-col ta-action">
                    <button class="ta-toggle-btn" [class.ta-toggle-out]="t.eliminated"
                      [disabled]="teamToggleSaving() === t.id"
                      (click)="toggleEliminated(t)">
                      @if (teamToggleSaving() === t.id) {
                        <mat-spinner diameter="12" style="display:inline-block"></mat-spinner>
                      } @else {
                        {{ t.eliminated ? 'Mark Active' : 'Mark Eliminated' }}
                      }
                    </button>
                  </span>
                </div>
              }
            </div>
          }
        </div>
      }

    </div>
  `,
  styles: [`
    /* ── General ── */
    .page-title { color: #1a237e; font-size: 20px; font-weight: 700; margin: 0 0 12px; }
    .section-head { color: #1a237e; font-size: 15px; font-weight: 700; margin: 16px 0 2px; }
    .subtitle { color: #666; font-size: 13px; margin: 0 0 12px; }
    .overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.55); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:9999; }
    .overlay p { color:#fff; margin-top:14px; font-size:15px; font-weight:500; }

    /* ── Admin header + nav ── */
    .admin-header { margin-bottom: 12px; }
    .admin-nav {
      display: flex; gap: 6px; flex-wrap: wrap;
      background: #f0f2ff; border: 1px solid #dde0f0; border-radius: 14px;
      padding: 6px; margin-top: 10px;
    }
    .nav-item {
      display: flex; align-items: center; gap: 5px;
      padding: 8px 14px; border-radius: 10px; border: none;
      background: transparent; cursor: pointer; font-size: 13px;
      font-weight: 600; color: #555; transition: background .12s, color .12s;
      white-space: nowrap;
    }
    .nav-item:hover { background: #e8eaf6; color: #1a237e; }
    .nav-active { background: #1a237e !important; color: #fff !important; }
    .nav-icon { font-size: 15px; }
    .nav-label { font-size: 12px; }
    .admin-content { padding-bottom: 32px; }
    .db-tab-host { height: calc(100vh - 120px); overflow: hidden; display: flex; flex-direction: column; }
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
    .actions-row { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; align-items:center; margin-top:10px; }
    .espn-btn { display:inline-flex; align-items:center; gap:7px; padding:0 20px; height:40px; border:none; border-radius:20px; background:linear-gradient(135deg,#1a237e,#3949ab); color:#fff; font-size:13px; font-weight:700; letter-spacing:0.4px; cursor:pointer; box-shadow:0 3px 8px rgba(26,35,126,0.35); transition:box-shadow .15s, transform .1s; }
    .espn-btn:hover:not(:disabled) { box-shadow:0 5px 14px rgba(26,35,126,0.45); transform:translateY(-1px); }
    .espn-btn:disabled { background:linear-gradient(135deg,#bdbdbd,#9e9e9e); box-shadow:none; cursor:not-allowed; transform:none; }
    .espn-btn-refetch { background:linear-gradient(135deg,#37474f,#546e7a) !important; }
    .save-pts-btn { display:inline-flex; align-items:center; gap:7px; padding:0 20px; height:40px; border:none; border-radius:20px; background:linear-gradient(135deg,#1b5e20,#388e3c); color:#fff; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 3px 8px rgba(27,94,32,0.35); transition:box-shadow .15s,transform .1s; }
    .save-pts-btn:hover:not(:disabled) { box-shadow:0 5px 14px rgba(27,94,32,0.45); transform:translateY(-1px); }
    .save-pts-btn:disabled { background:linear-gradient(135deg,#bdbdbd,#9e9e9e); box-shadow:none; cursor:not-allowed; }
    .discard-btn { display:inline-flex; align-items:center; height:40px; padding:0 16px; border:1px solid #e0e0e0; border-radius:20px; background:#fff; color:#666; font-size:12px; font-weight:600; cursor:pointer; transition:background .15s; }
    .discard-btn:hover { background:#f5f5f5; color:#c62828; border-color:#c62828; }

    /* Preview section — card grows to fill viewport, header locks, cards scroll */
    .match-card-preview {
      display: flex !important;
      flex-direction: column;
      max-height: calc(100vh - 120px);
      overflow: hidden;
      background: #fff;
    }
    .preview-section { margin-top:16px; border-top:2px solid #e3f2fd; padding-top:16px; flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
    .preview-sticky-header { flex-shrink:0; background:#fff; padding-bottom:8px; touch-action:none; }
    .preview-cards-scroll { flex:1; min-height:0; overflow-y:auto; padding-right:2px; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; }
    .preview-header { margin-bottom:14px; display:flex; flex-direction:column; gap:10px; }
    .score-edit-row { display:flex; align-items:center; gap:8px; background:#f8f9fa; border-radius:10px; padding:10px 14px; flex-wrap:wrap; }
    .score-edit-team { font-size:13px; font-weight:700; color:#1a237e; flex:1; }
    .score-edit-team:last-of-type { text-align:right; }
    .score-edit-input { width:52px; height:36px; text-align:center; font-size:20px; font-weight:800; color:#1a237e; border:2px solid #3949ab; border-radius:8px; outline:none; }
    .score-edit-sep { font-size:20px; font-weight:800; color:#666; }
    .preview-filters { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .preview-count-row { display:flex; align-items:center; justify-content:space-between; }
    .preview-count { font-size:12px; color:#888; font-weight:600; }
    .st-sort-btn.active { background:#2e7d32; color:#fff; border-color:#2e7d32; }

    /* Player edit cards */
    .preview-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }
    .pv-card { border:1px solid #e0e0e0; border-radius:12px; background:#fff; overflow:hidden; transition:box-shadow .15s; }
    .pv-card:hover { box-shadow:0 4px 12px rgba(0,0,0,0.1); }
    .pv-card.pv-dnp { opacity:0.55; background:#fafafa; }
    .pv-card-head { display:flex; align-items:center; gap:8px; padding:10px 12px; background:#f5f7ff; border-bottom:1px solid #e8ecff; }
    .pv-name { font-size:13px; font-weight:700; color:#1a237e; flex:1; }
    .pv-team-label { font-size:10px; color:#888; font-weight:600; }
    .pv-pts-badge { background:#1a237e; color:#fff; font-size:12px; font-weight:800; padding:2px 8px; border-radius:10px; white-space:nowrap; }
    .pv-fields { display:flex; flex-wrap:wrap; gap:6px; padding:10px 12px; }
    .pv-field { display:flex; flex-direction:column; align-items:center; gap:3px; min-width:52px; }
    .pv-field label { font-size:10px; color:#888; font-weight:600; white-space:nowrap; }
    .pv-field input[type=number] { width:48px; height:32px; text-align:center; font-size:14px; font-weight:700; border:1.5px solid #e0e0e0; border-radius:6px; outline:none; transition:border-color .15s; }
    .pv-field input[type=number]:focus { border-color:#3949ab; }
    .pv-field-cs { min-width:36px; }
    .pv-field input[type=checkbox] { width:20px; height:20px; cursor:pointer; accent-color:#1a237e; }

    @media (max-width:600px) {
      .preview-cards { grid-template-columns:1fr; }
      .score-edit-row { justify-content:center; }
      .score-edit-team { flex:none; font-size:12px; }
      .save-pts-btn { font-size:12px; padding:0 14px; }
      .pv-fields { gap:4px; }
      .pv-field input[type=number] { width:40px; font-size:13px; }
      .match-card-preview {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10;
        max-height: none;
        border-radius: 0;
        overflow: hidden;
        margin: 0;
        overscroll-behavior: none;
      }
      /* When preview is open, admin-content becomes the positioning parent and stops scrolling */
      .admin-content:has(.match-card-preview) {
        position: relative;
        overflow: hidden;
      }
    }
    .espn-icon { font-size:18px; width:18px; height:18px; }
    .espn-spinner { display:inline-block; }
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
    .st-pos-btn.active { background:#37474f; border-color:#37474f; }
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
    .sq-user-panel { position: sticky; top: 72px; flex: 0 0 40%; min-width: 0; background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; }
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
    .sq-user-row.sq-user-no-squad { background: #fff8e1; }
    .sq-u-no-squad-msg { display: block; font-size: 11px; font-weight: 700; color: #e65100; animation: fade-in-out 3s ease forwards; }
    @keyframes fade-in-out { 0%{opacity:0} 10%{opacity:1} 80%{opacity:1} 100%{opacity:0} }
    .sq-u-avatar { width: 32px; height: 32px; border-radius: 50%; background: #1a237e; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
    .sq-u-info { flex: 1; min-width: 0; }
    .sq-u-name { display: block; font-size: 13px; font-weight: 600; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sq-u-sub { display: block; font-size: 10px; color: #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sq-u-pts { font-size: 11px; font-weight: 700; color: #1a237e; white-space: nowrap; flex-shrink: 0; margin-left: auto; }
    .sq-u-del-btn { flex-shrink: 0; background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px 6px; border-radius: 6px; color: #e53935; opacity: 0.7; transition: opacity .15s, background .15s; }
    .sq-u-del-btn:hover { opacity: 1; background: #ffebee; }
    .sq-u-edit-btn { flex-shrink: 0; background: none; border: none; cursor: pointer; font-size: 13px; padding: 4px 6px; border-radius: 6px; color: #555; opacity: 0.6; transition: opacity .15s, background .15s; }
    .sq-u-edit-btn:hover { opacity: 1; background: #f5f7ff; }
    .sq-u-loc { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; margin-left: 4px; vertical-align: middle; }
    .sq-u-loc.tvm { background: #e3f2fd; color: #1565c0; }
    .sq-u-loc.pune { background: #fce4ec; color: #c62828; }
    .sq-user-editing { background: #f8f9ff !important; }
    .sq-u-loc-edit { display: flex; align-items: center; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
    .loc-name-input { font-size: 11px; padding: 3px 6px; border: 1px solid #c5cae9; border-radius: 5px; outline: none; background: #fff; width: 120px; min-width: 0; }
    .loc-name-input:focus { border-color: #1a237e; }
    .loc-select { font-size: 11px; padding: 3px 6px; border: 1px solid #c5cae9; border-radius: 5px; outline: none; background: #fff; cursor: pointer; }
    .loc-save-btn { font-size: 12px; font-weight: 700; background: #1b5e20; color: #fff; border: none; border-radius: 5px; padding: 2px 8px; cursor: pointer; }
    .loc-save-btn:disabled { opacity: .5; cursor: not-allowed; }
    .loc-cancel-btn { font-size: 12px; background: #ffebee; color: #c62828; border: 1px solid #ef9a9a; border-radius: 5px; padding: 2px 6px; cursor: pointer; }

    /* Location filter badges */
    .sq-loc-filters { display: flex; gap: 6px; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
    .loc-badge { border: 1.5px solid #e0e0e0; background: #fff; color: #555; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; cursor: pointer; transition: all 0.12s; }
    .loc-badge:hover { border-color: #1a237e; color: #1a237e; }
    .loc-badge.active { background: #1a237e; color: #fff; border-color: #1a237e; }
    .loc-badge.tvm.active { background: #1565c0; border-color: #1565c0; }
    .loc-badge.pune.active { background: #c62828; border-color: #c62828; }

    /* Add user */
    .sq-add-user-row { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; display: flex; gap: 6px; }
    .add-user-btn { flex: 1; font-size: 12px !important; color: #1a237e !important; border-color: #c5cae9 !important; }
    .bulk-btn { color: #6a1b9a !important; border-color: #ce93d8 !important; }
    .add-user-form { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; background: #fafafa; display: flex; flex-direction: column; gap: 6px; }
    .au-upload-hint { font-size: 11px; color: #555; line-height: 1.5; }
    .au-file-input { font-size: 12px; }
    .au-upload-result { font-size: 12px; color: #2e7d32; background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 6px; padding: 8px 10px; }
    .au-upload-result.au-error { color: #c62828; background: #ffebee; border-color: #ef9a9a; }
    .au-upload-errors { margin: 4px 0 0 16px; padding: 0; font-size: 11px; color: #c62828; }
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
    .sq-detail-panel { flex: 0 0 60%; min-width: 0; }

    /* Pitch wrap */
    .sq-pitch-wrap { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; padding-bottom: 8px; }
    .sq-transfers { margin: 8px 12px; background: #f8faff; border: 1px solid #e0e7ff; border-radius: 10px; padding: 8px 12px; }
    .sq-tr-title { font-size: 11px; font-weight: 800; color: #1a237e; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .sq-tr-rows { display: flex; flex-direction: column; gap: 4px; }
    .sq-tr-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 4px 8px; border-radius: 6px; background: #fff; border: 1px solid #e8ecff; }
    .sq-tr-row.sq-tr-penalty { background: #fff5f5; border-color: #fecaca; }
    .sq-tr-stage { font-weight: 700; color: #1a237e; min-width: 100px; }
    .sq-tr-made { color: #374151; flex: 1; }
    .sq-tr-ok { color: #16a34a; font-weight: 600; font-size: 11px; }
    .sq-tr-pen { color: #dc2626; font-weight: 700; font-size: 11px; }
    .sq-display-select { margin-left: auto; background: #1d4ed8; color: #fff; border: 2px solid #3b82f6; border-radius: 8px; padding: 4px 10px; font-size: 11px; font-weight: 800; cursor: pointer; outline: none; }
    .sq-display-select option { background: #1e2433; }

    .sq-pitch {
      background: #1a6b3a;
      background-image: repeating-linear-gradient(0deg, transparent, transparent 48px, rgba(0,0,0,0.08) 48px, rgba(0,0,0,0.08) 49px);
      position: relative; padding: 6px 4px 2px;
      display: flex; flex-direction: column; justify-content: space-evenly; gap: 4px;
      min-height: 340px;
      border-bottom: 1px dashed rgba(255,255,255,0.15);
    }
    .sq-bench-strip { background: rgba(0,0,0,0.55); border-top: 1px dashed rgba(255,255,255,0.15); padding: 4px; }

    /* Reuse my-team pitch classes inside admin */
    .sq-pitch .pitch-markings { position: absolute; inset: 0; pointer-events: none; }
    .sq-pitch .pm { position: absolute; }
    .sq-pitch .halfway       { top: 48%; left: 5%; right: 5%; height: 1px; background: rgba(255,255,255,0.25); }
    .sq-pitch .center-circle { top: 48%; left: 50%; width: 60px; height: 60px; border: 1px solid rgba(255,255,255,0.2); border-radius: 50%; transform: translate(-50%,-50%); }
    .sq-pitch .penalty-top   { top: 0; left: 50%; width: 130px; height: 50px; border: 1px solid rgba(255,255,255,0.2); border-top: none; transform: translateX(-50%); }
    .sq-pitch .penalty-bot   { bottom: 0; left: 50%; width: 130px; height: 50px; border: 1px solid rgba(255,255,255,0.2); border-bottom: none; transform: translateX(-50%); }
    .sq-pitch .goal-top      { top: 0; left: 50%; width: 48px; height: 14px; border: 1px solid rgba(255,255,255,0.2); border-top: none; transform: translateX(-50%); }
    .sq-pitch .goal-bot      { bottom: 0; left: 50%; width: 48px; height: 14px; border: 1px solid rgba(255,255,255,0.2); border-bottom: none; transform: translateX(-50%); }
    .sq-pitch .pitch-row { display: flex; justify-content: center; align-items: center; gap: 4px; position: relative; z-index: 1; }

    /* Player card (read-only, reuses my-team card styles) */
    .sq-pitch .p-slot, .sq-bench-strip .p-slot { display: flex; flex-direction: column; align-items: center; width: 72px; flex-shrink: 0; }
    .sq-bench-strip .p-slot .p-card { opacity: 0.85; }
    .p-card-captain { outline: 2px solid #f59e0b !important; outline-offset: 1px; }
    .p-card-vc { outline: 2px solid #7c3aed !important; outline-offset: 1px; }
    .p-card {
      width: 68px; background: #1e2433; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px; display: flex; flex-direction: column; align-items: center;
      padding: 0 0 3px; overflow: hidden; position: relative;
    }
    .p-card-bench { background: #141824; border-color: rgba(255,255,255,0.08); }
    .ro-icons { width: 100%; display: flex; justify-content: flex-end; padding: 2px 3px 0; position: absolute; top: 0; right: 0; z-index: 2; }
    .cap-badges { display: flex; gap: 2px; }
    .cap-icon { width: 14px; height: 14px; border-radius: 50%; font-size: 7px; font-weight: 900; display: flex; align-items: center; justify-content: center; }
    .c-icon  { background: #f59e0b; color: #000; }
    .vc-icon { background: #7c3aed; color: #fff; }
    .bench-badge { position: absolute; top: 2px; left: 50%; transform: translateX(-50%); font-size: 6px; font-weight: 900; letter-spacing: 1px; color: #6b7280; background: rgba(0,0,0,0.4); padding: 1px 4px; border-radius: 3px; z-index: 3; white-space: nowrap; }
    .p-avatar { width: 42px; height: 42px; border-radius: 50%; background: #2a2d3e; border: 2px solid rgba(255,255,255,0.15); position: relative; overflow: hidden; margin-top: 14px; flex-shrink: 0; }
    .p-avatar::before { content: ''; position: absolute; top: 7px; left: 50%; transform: translateX(-50%); width: 12px; height: 12px; background: rgba(255,255,255,0.7); border-radius: 50%; }
    .p-avatar::after  { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 24px; height: 14px; background: rgba(255,255,255,0.7); border-radius: 12px 12px 0 0; }
    .filled-av { background: #1a1d2e; border-color: var(--pc, rgba(255,255,255,0.25)); border-width: 2px; }
    .filled-av::before { background: rgba(255,255,255,0.9); }
    .filled-av::after  { background: rgba(255,255,255,0.9); }
    .p-name-bar { width: 100%; text-align: center; color: #f3f4f6; font-size: 8.5px; font-weight: 700; padding: 2px 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .p-price-bar { width: calc(100% - 8px); text-align: center; color: #fff; font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 3px; margin-top: 2px; letter-spacing: .3px; }
    .bench-strip-label { text-align: center; color: rgba(255,255,255,0.35); font-size: 8px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 3px; }
    .bench-strip-slots { display: flex; justify-content: center; gap: 6px; }

    /* No squad / back bar */
    .sq-no-squad-wrap { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; }
    .sq-back-bar { display: none; padding: 8px 12px; background: #f5f5f5; border-top: 1px solid #e0e0e0; }
    .sq-back-btn { width: 100%; padding: 10px; background: #1a237e; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 800; cursor: pointer; }

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
    .pts-match-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; }
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

    /* ── Mobile responsive ── */
    @media (max-width: 600px) {
      .page-title { font-size: 16px; margin-bottom: 6px; }
      .admin-nav { gap: 4px; padding: 4px; border-radius: 10px; }
      .nav-item { padding: 7px 10px; }
      .nav-label { display: none; }
      .nav-icon { font-size: 18px; }

      /* On mobile the whole admin page is a fixed full-screen column below the navbar */
      :host {
        position: fixed !important;
        top: 56px; left: 0; right: 0; bottom: 0;
        display: flex !important; flex-direction: column;
        overflow: hidden;
        background: #fff;
        padding: 8px 8px 0 !important;
        box-sizing: border-box;
      }
      .admin-header { flex-shrink: 0; }
      .admin-content {
        flex: 1; min-height: 0;
        overflow-y: auto;
        padding-bottom: 0;
      }

      /* When on users tab: admin-content becomes a flex column so squads fills it */
      .admin-content:has(.squads-browser) {
        display: flex; flex-direction: column; overflow: hidden;
      }

      /* Squads browser fills admin-content */
      .squads-browser {
        flex: 1; min-height: 0;
        display: flex; flex-direction: column;
        overflow: hidden; padding-bottom: 0;
      }
      .sq-layout {
        flex: 1; min-height: 0;
        display: flex; flex-direction: column;
        overflow: hidden; gap: 0;
      }

      /* Users panel fills remaining height with internal scroll */
      .sq-user-panel {
        position: static; width: 100%; border-radius: 0; border: none;
        flex: 1; min-height: 0;
        display: flex; flex-direction: column; overflow: hidden;
      }
      .sq-user-list { flex: 1; min-height: 0; overflow-y: auto; max-height: none; }

      /* Hide pitch by default */
      .sq-detail-panel { display: none; width: 100%; }

      /* Squad view: swap to pitch — block scroll container */
      .sq-layout.mobile-show-squad .sq-user-panel { display: none; }
      .sq-layout.mobile-show-squad .sq-detail-panel {
        display: block;
        flex: 1; min-height: 0; overflow-y: auto;
      }

      /* Pitch wrap: natural height, room for sticky back btn */
      .sq-pitch-wrap { border-radius: 0; border: none; padding-bottom: 0; }
      .sq-pitch { min-height: 320px; }

      /* Back button: sticky inside the scroll container */
      .sq-back-bar {
        display: flex;
        position: sticky; bottom: 0; z-index: 10;
        background: #f5f5f5; border-top: 2px solid #c5cae9;
      }
      .sq-no-squad-wrap { border-radius: 0; border: none; }

      .sq-pitch .p-slot, .sq-bench-strip .p-slot { width: 62px; }
      .sq-pitch .p-card, .sq-bench-strip .p-card { width: 58px; }

      /* Match cards */
      .match-card { padding: 10px 12px; }
      .teams-row { gap: 6px; }
      .team { font-size: 12px; }
      .actions-row { flex-direction: column; align-items: stretch; }
      .actions-row button { width: 100%; justify-content: center; }
      .stats-top-row { flex-direction: column; align-items: stretch; }
      .stats-filters { flex-wrap: wrap; }
      .stats-search-wrap .search-input { width: 100px; }

      /* Sync buttons: 2-column grid on mobile */
      .sync-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .sync-btn { width: 100%; justify-content: center; font-size: 11px !important; }

      /* Round config — hide wide cols, scroll */
      .rc-table { overflow-x: auto; }
      .rc-header, .rc-row { grid-template-columns: 60px 52px 52px 52px 52px 90px; font-size: 10px; }
      .rc-col-wide, .rc-tz { display: none; }
      .rc-actions { flex-direction: column; gap: 3px; }
      .rc-edit-btn, .rc-save-btn, .rc-cancel-btn { padding: 3px 8px; font-size: 10px; }

      /* Player pool — hide team col on very small, make table scroll */
      .pp-table { overflow-x: auto; min-width: 0; }
      .pp-team { display: none; }
      .pp-name { flex: 3; }
      .pp-price { width: 72px; }
      .pp-pts { width: 36px; }
      .pp-action { width: 80px; }
      .pp-controls { gap: 6px; }
      .pp-search { min-width: 0; flex: 1; }
      .pp-add-form { flex-direction: column; }
      .pp-add-input, .pp-add-select, .pp-add-team { width: 100%; min-width: 0; box-sizing: border-box; }

      /* Teams tab */
      .ta-code, .ta-group { display: none; }
      .ta-name { flex: 2; }
      .ta-action { width: 100px; }
      .ta-toggle-btn { font-size: 10px; padding: 3px 7px; }

      /* Points breakdown */
      .pts-p-stats { display: none; }
      .pts-match-name { font-size: 11px; }
    }

    /* ── Round Config tab ── */
    .rc-wrap { padding-bottom: 32px; }
    .rc-loading { padding: 32px; text-align: center; color: #999; font-size: 13px; }
    .rc-table { border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden; margin-bottom: 12px; }
    .rc-header, .rc-row { display: grid; grid-template-columns: 80px 1fr 1fr 1fr 1fr 1.8fr 2.2fr 130px; gap: 0; align-items: center; }
    .rc-col-wide { min-width: 0; }
    .rc-header { background: #e8eaf6; padding: 8px 12px; font-size: 10px; font-weight: 700; color: #3949ab; text-transform: uppercase; letter-spacing: 0.3px; }
    .rc-row { border-top: 1px solid #f0f0f0; padding: 8px 12px; font-size: 13px; transition: background 0.1s; }
    .rc-row:hover { background: #fafafa; }
    .rc-editing { background: #f5f7ff !important; }
    .rc-col { padding: 0 4px; }
    .rc-stage { font-weight: 700; }
    .stage-badge { background: #e8eaf6; color: #3949ab; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; }
    .rc-val { color: #333; }
    .rc-tz-val { font-size: 11px; color: #666; }
    .rc-input { width: 100%; border: 1px solid #c5cae9; border-radius: 5px; padding: 5px 7px; font-size: 12px; outline: none; background: #fff; }
    .rc-input:focus { border-color: #1a237e; }
    .rc-tz { font-size: 11px; }
    .rc-actions { display: flex; gap: 5px; justify-content: flex-end; }
    .rc-edit-btn { background: #e8eaf6; color: #3949ab; border: none; border-radius: 5px; padding: 4px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
    .rc-edit-btn:hover { background: #c5cae9; }
    .rc-save-btn { background: #1a237e; color: #fff; border: none; border-radius: 5px; padding: 4px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
    .rc-cancel-btn { background: #f5f5f5; color: #555; border: none; border-radius: 5px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; }
    .rc-toolbar { margin-bottom: 12px; }
    .rc-sync-btn { background: #e3f2fd; color: #1565c0; border: 1.5px solid #bbdefb; border-radius: 7px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; transition: background 0.12s; }
    .rc-sync-btn:hover:not(:disabled) { background: #bbdefb; }
    .rc-sync-btn:disabled { opacity: 0.6; cursor: default; }
    .rc-msg { margin-top: 10px; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #f1f8e9; color: #2e7d32; }
    .rc-msg.rc-err { background: #ffebee; color: #c62828; }

    /* ── Player Pool tab ── */
    .pp-wrap { padding: 8px 0; }
    .pp-controls { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .pp-search { flex: 1; min-width: 160px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; outline: none; }
    .pp-search:focus { border-color: #3f51b5; }
    .pp-pos-filter { padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; outline: none; background: #fff; cursor: pointer; }
    .pp-price-upload-btn { display: inline-flex; align-items: center; padding: 6px 12px; background: #1565c0; color: #fff; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: opacity .2s; }
    .pp-price-upload-btn:hover { opacity: .85; }
    .pp-price-upload-btn.pp-uploading { opacity: .6; cursor: not-allowed; }
    .pp-price-result { margin-bottom: 10px; padding: 8px 12px; border-radius: 8px; font-size: 12px; background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
    .pp-price-result.pp-price-err { background: #ffebee; color: #c62828; border-color: #ffcdd2; }
    .pp-price-errs { margin-top: 6px; font-size: 11px; opacity: .85; max-height: 100px; overflow-y: auto; }
    .pp-count { font-size: 12px; color: #666; margin-bottom: 8px; font-weight: 600; }
    .pp-table { border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden; }
    .pp-header { display: flex; align-items: center; padding: 8px 12px; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: .5px; }
    .pp-row { display: flex; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    .pp-row:last-child { border-bottom: none; }
    .pp-row:hover { background: #fafafa; }
    .pp-col { display: flex; align-items: center; }
    .pp-name   { flex: 2; font-weight: 500; }
    .pp-team   { flex: 1.5; color: #555; font-size: 12px; }
    .pp-pos    { width: 52px; justify-content: center; }
    .pp-price  { width: 100px; justify-content: flex-end; font-weight: 700; color: #1a237e; }
    .pp-action { width: 100px; justify-content: flex-end; gap: 4px; }
    .pp-pos-badge { padding: 2px 7px; border-radius: 4px; color: #fff; font-size: 10px; font-weight: 900; }
    .pp-price-input { width: 80px; padding: 4px 6px; border: 1.5px solid #3f51b5; border-radius: 6px; font-size: 12px; font-weight: 700; text-align: right; outline: none; }
    .pp-pos-edit { padding: 3px 5px; border: 1.5px solid #3f51b5; border-radius: 6px; font-size: 11px; font-weight: 700; outline: none; background: #fff; cursor: pointer; width: 54px; }
    .pp-edit-btn   { padding: 4px 10px; font-size: 11px; font-weight: 700; background: #e8eaf6; color: #3f51b5; border: 1px solid #c5cae9; border-radius: 6px; cursor: pointer; }
    .pp-edit-btn:hover { background: #c5cae9; }
    .pp-save-btn   { padding: 4px 10px; font-size: 12px; font-weight: 700; background: #1b5e20; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
    .pp-save-btn:disabled { opacity: .5; cursor: not-allowed; }
    .pp-cancel-btn { padding: 4px 8px; font-size: 12px; background: #ffebee; color: #c62828; border: 1px solid #ef9a9a; border-radius: 6px; cursor: pointer; }
    .pp-del-btn { padding: 4px 7px; font-size: 13px; background: none; border: none; cursor: pointer; color: #e53935; opacity: 0.7; border-radius: 5px; transition: opacity .15s, background .15s; }
    .pp-del-btn:hover:not(:disabled) { opacity: 1; background: #ffebee; }
    .pp-del-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .pp-empty { padding: 20px; text-align: center; color: #999; font-size: 13px; }
    .pp-add-open-btn { padding: 7px 14px; font-size: 12px; font-weight: 700; background: #1a237e; color: #fff; border: none; border-radius: 8px; cursor: pointer; white-space: nowrap; }
    .pp-add-open-btn:hover { background: #283593; }
    .pp-add-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px; background: #f5f7ff; border: 1px solid #c5cae9; border-radius: 10px; margin-bottom: 12px; }
    .pp-add-input { padding: 7px 10px; border: 1px solid #c5cae9; border-radius: 6px; font-size: 12px; outline: none; background: #fff; min-width: 160px; }
    .pp-add-input:focus { border-color: #1a237e; }
    .pp-add-select { padding: 7px 10px; border: 1px solid #c5cae9; border-radius: 6px; font-size: 12px; outline: none; background: #fff; cursor: pointer; }
    .pp-add-team { min-width: 160px; }
    .pp-add-price { width: 140px; min-width: unset; }
    .pp-add-actions { display: flex; gap: 6px; }
    .pp-msg { margin-top: 10px; padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; background: #f1f8e9; color: #2e7d32; }
    .pp-msg.pp-err { background: #ffebee; color: #c62828; }

    /* ── Sortable header ── */
    .pp-sortable { cursor: pointer; user-select: none; gap: 4px; white-space: nowrap; }
    .pp-sortable:hover { color: #1a237e; }

    /* ── Teams admin tab ── */
    .teams-admin-table { border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden; }
    .ta-header { display: flex; align-items: center; padding: 8px 12px; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: .5px; }
    .ta-row { display: flex; align-items: center; padding: 9px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; transition: background .1s; }
    .ta-row:last-child { border-bottom: none; }
    .ta-row:hover { background: #fafafa; }
    .ta-eliminated { background: #fff8f8 !important; opacity: 0.75; }
    .ta-col { display: flex; align-items: center; }
    .ta-name  { flex: 2; font-weight: 500; gap: 6px; }
    .ta-code  { width: 60px; color: #555; font-size: 12px; font-weight: 700; }
    .ta-group { width: 60px; color: #888; font-size: 12px; }
    .ta-status { flex: 1; }
    .ta-action { width: 130px; justify-content: flex-end; }
    .ta-elim-tag { font-size: 9px; font-weight: 900; background: #ef4444; color: #fff; padding: 1px 5px; border-radius: 3px; }
    .ta-status-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
    .ta-in  { background: #e8f5e9; color: #2e7d32; }
    .ta-out { background: #ffebee; color: #c62828; }
    .ta-toggle-btn { padding: 4px 10px; font-size: 11px; font-weight: 700; background: #ffebee; color: #c62828; border: 1px solid #ef9a9a; border-radius: 6px; cursor: pointer; white-space: nowrap; }
    .ta-toggle-btn.ta-toggle-out { background: #e8f5e9; color: #2e7d32; border-color: #a5d6a7; }
    .ta-toggle-btn:disabled { opacity: .5; cursor: not-allowed; }

    /* Eliminated badge in player pool */
    .pp-elim-badge { font-size: 8px; font-weight: 900; background: #ef4444; color: #fff; padding: 1px 4px; border-radius: 3px; margin-left: 4px; }
    .pp-elim-toggle { padding: 7px 12px; font-size: 11px; font-weight: 700; background: #fff3e0; color: #e65100; border: 1px solid #ffcc02; border-radius: 8px; cursor: pointer; white-space: nowrap; }
    .pp-elim-toggle.pp-elim-on { background: #fce4ec; color: #c62828; border-color: #ef9a9a; }

    /* Points column in player pool */
    .pp-pts { width: 48px; justify-content: flex-end; font-weight: 700; color: #3949ab; font-size: 12px; }

    /* ── Squad Audit ──────────────────────────────────────── */
    .audit-wrap { padding-bottom: 32px; }
    .audit-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
    .audit-title { font-size: 16px; font-weight: 700; color: #1a237e; }
    .audit-refresh-btn { padding: 6px 16px; font-size: 12px; font-weight: 700; background: #e8eaf6; color: #3949ab; border: 1px solid #c5cae9; border-radius: 8px; cursor: pointer; display: flex; align-items: center; }
    .audit-refresh-btn:disabled { opacity: .5; cursor: not-allowed; }
    .audit-msg { margin: 8px 0; padding: 8px 14px; border-radius: 8px; font-size: 13px; background: #ffebee; color: #c62828; }
    .audit-msg.audit-ok { background: #e8f5e9; color: #2e7d32; }
    .audit-loading { padding: 40px; text-align: center; }
    .audit-table-wrap { overflow-x: auto; border: 1px solid #e0e0e0; border-radius: 10px; margin-top: 12px; }
    .audit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .audit-table thead tr { background: #e8eaf6; }
    .audit-table th { padding: 9px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #3949ab; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
    .audit-table td { padding: 8px 12px; border-top: 1px solid #f0f0f0; vertical-align: middle; }
    .audit-table tbody tr:hover { background: #fafafa; }
    .audit-user { display: flex; flex-direction: column; gap: 1px; }
    .audit-display { font-weight: 600; color: #212121; font-size: 13px; }
    .audit-uid { font-size: 10px; color: #999; }
    .audit-formation { font-family: monospace; font-size: 12px; background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }
    .audit-section { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 5px; background: #e3f2fd; color: #1565c0; }
    .audit-section.bench-sec { background: #fff3e0; color: #e65100; }
    .audit-num { font-size: 13px; color: #555; text-align: center; }
    .audit-pname { font-weight: 500; color: #212121; }
    .pos-tag { font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; display: inline-block; }
    .pos-tag.GK  { background: #fff8e1; color: #f57f17; }
    .pos-tag.DEF { background: #e8f5e9; color: #2e7d32; }
    .pos-tag.MID { background: #e3f2fd; color: #1565c0; }
    .pos-tag.FWD { background: #fce4ec; color: #ad1457; }
    .pos-tag.mismatch { outline: 2px solid #ef4444; }

    /* ── Country Limit Audit ── */
    .cl-user-block { border: 1px solid #fecaca; border-radius: 10px; margin-top: 12px; overflow: hidden; }
    .cl-user-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #fff5f5; border-bottom: 1px solid #fecaca; gap: 10px; flex-wrap: wrap; }
    .cl-user-info { display: flex; flex-direction: column; gap: 1px; }
    .cl-stage-badge { font-size: 11px; font-weight: 700; background: #fee2e2; color: #c62828; padding: 2px 8px; border-radius: 6px; }
    .cl-violation { padding: 10px 14px; border-top: 1px solid #f5f5f5; }
    .cl-violation:first-child { border-top: none; }
    .cl-violation-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .cl-country { font-size: 14px; font-weight: 700; color: #1a237e; }
    .cl-count-badge { font-size: 12px; font-weight: 800; background: #ef4444; color: #fff; padding: 2px 8px; border-radius: 8px; }
    .cl-players { display: flex; flex-direction: column; gap: 5px; }
    .cl-player { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #fff; border: 1px solid #fecaca; border-radius: 7px; }
    .cl-player.cl-player-bench { background: #fff8f0; border-color: #fed7aa; opacity: 0.85; }
    .cl-pname { font-size: 13px; font-weight: 500; color: #1a1a1a; flex: 1; }
  `]
})
export class AdminScoresComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

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
  statsPosFilter    = signal<string | null>(null);
  previewSortByPts  = signal(false);

  // Preview / edit flow
  previewing  = signal<number | null>(null);
  saving      = signal<number | null>(null);
  previewMatchId = signal<number | null>(null);
  previewStats   = signal<any[]>([]);
  previewScoreA  = 0;
  previewScoreB  = 0;
  previewRefresh = signal(0); // bump to force computed recalc

  filteredPreviewStats = computed(() => {
    this.previewRefresh(); // track changes
    let list = this.previewStats();
    const search = this.statsPlayerSearch().toLowerCase();
    const team   = this.statsTeamFilter();
    const pos    = this.statsPosFilter();
    if (search) list = list.filter((s: any) => s.playerName.toLowerCase().includes(search) || s.teamName.toLowerCase().includes(search));
    if (team)   list = list.filter((s: any) => s.teamName === team);
    if (pos)    list = list.filter((s: any) => s.position === pos);
    if (this.previewSortByPts()) list = [...list].sort((a: any, b: any) => this.calcPreviewPoints(b) - this.calcPreviewPoints(a));
    return list;
  });

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
  selectedUserTransfers = signal<any[]>([]);
  matchStatsCache: Record<number, any[]> = {};
  expandedMatchId = signal<number | null>(null);
  userSearchCtrl = new FormControl('');
  userSearchQuery = signal('');
  locationFilter = signal<string | null>(null);
  positions = ['GK', 'DEF', 'MID', 'FWD'];
  squadMobileView = signal<'users' | 'pitch'>('users');
  sqPitchDisplay: 'price' | 'pts' = 'price';
  noSquadUserId = signal<number | null>(null);
  private noSquadTimer: any = null;

  // Add user form
  showAddUser = signal(false);
  newUsername = '';
  newDisplayName = '';
  newLocation = '';
  newIsAdmin = 'false';
  addingUser = signal(false);
  addUserError = signal('');

  showBulkUpload  = signal(false);
  uploadingBulk   = signal(false);
  uploadFile: File | null = null;
  uploadResult    = signal<{ created?: number; skipped?: number; errors?: string[]; error?: string } | null>(null);

  // Inline user editing (location + display name)
  locEditId          = signal<number | null>(null);
  locEditValue       = '';
  locEditDisplayName = '';
  locSaving          = signal(false);

  private nowISTString(): string {
    return new Date().toLocaleString('sv', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T');
  }

  private isPast(matchTime: string): boolean {
    if (!matchTime) return false;
    return matchTime < this.nowISTString();
  }

  filteredMatches = computed(() => {
    const raw = this.scoreSearchQuery().trim().toLowerCase();
    const q = this.normaliseMonth(raw);
    const list = [...this.matches()]
      .filter(m => m.stage !== 'GROUP')
      .sort((a, b) => new Date(a.matchTime).getTime() - new Date(b.matchTime).getTime());
    if (!q) return list;
    return list.filter(m => {
      const nameA = this.teamName(m, 'A');
      const nameB = this.teamName(m, 'B');
      const teams = `${nameA} ${nameB}`.toLowerCase();
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

  // ── Round config ────────────────────────────────────────────────
  rcRows      = signal<RoundConfig[]>([]);
  rcLoading   = signal(false);
  rcSyncing   = signal(false);
  rcEditStage = signal<string | null>(null);
  rcEdit: Partial<RoundConfig> = { freeTransfers: 0, countryLimit: 0, windowOpenHour: 0, windowCloseHour: 0, windowTimezone: '', roundStart: null };
  rcMsg       = signal('');
  rcMsgErr    = signal(false);

  startRcEdit(row: RoundConfig) {
    this.rcEdit = { ...row };
    this.rcEditStage.set(row.stage);
    this.rcMsg.set('');
  }

  saveRcRow(stage: string) {
    this.api.updateRoundConfig(stage, this.rcEdit).subscribe({
      next: updated => {
        this.rcRows.update(rows => rows.map(r => r.stage === stage ? updated : r));
        this.rcEditStage.set(null);
        this.rcMsg.set(`✅ ${stage} rules saved`);
        this.rcMsgErr.set(false);
      },
      error: err => {
        this.rcMsg.set('❌ ' + (err.error?.message || 'Save failed'));
        this.rcMsgErr.set(true);
      }
    });
  }

  loadRoundConfigs() {
    this.rcLoading.set(true);
    this.api.getRoundConfigs().subscribe({
      next: configs => { this.rcRows.set(configs); this.rcLoading.set(false); },
      error: () => this.rcLoading.set(false)
    });
  }

  syncRoundStarts() {
    this.rcSyncing.set(true);
    this.rcMsg.set('');
    this.api.syncRoundStarts().subscribe({
      next: configs => {
        this.rcRows.set(configs);
        this.rcSyncing.set(false);
        this.rcMsg.set('✅ Round start times synced from matches');
        this.rcMsgErr.set(false);
      },
      error: err => {
        this.rcSyncing.set(false);
        this.rcMsg.set('❌ ' + (err.error?.message || 'Sync failed'));
        this.rcMsgErr.set(true);
      }
    });
  }

  ngOnInit() {
    this.loadMatches();
    this.loadUsers();
    this.loadRoundConfigs();
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

  espnFetchReady(match: Match): boolean {
    if (!match.matchTime) return true;
    const kickoff = new Date(match.matchTime).getTime();
    return Date.now() >= kickoff + 90 * 60 * 1000;
  }


  previewFromEspn(match: Match) {
    const matchId = match.id;
    this.previewing.set(matchId);
    this.resultMsg.set('');
    this.resultMatchId.set(matchId);
    this.statsPlayerSearch.set('');
    this.statsTeamFilter.set(null);
    this.statsPosFilter.set(null);
    this.api.adminPreviewScores(matchId).subscribe({
      next: (res: any) => {
        this.previewing.set(null);
        if (res.status === 'success') {
          this.previewStats.set(res.stats);
          this.previewScoreA = res.scoreA;
          this.previewScoreB = res.scoreB;
          this.previewMatchId.set(matchId);
          this.previewRefresh.update(n => n + 1);
          this.resultMsg.set(`✅ ${res.stats.length} players fetched — review and edit below, then click Save & Calculate Points`);
        } else {
          this.resultMsg.set('❌ ' + res.message);
        }
      },
      error: (err: any) => {
        this.previewing.set(null);
        this.resultMsg.set('❌ ' + (err.error?.message || 'ESPN fetch failed'));
      }
    });
  }

  saveAndCalculate(matchId: number) {
    this.saving.set(matchId);
    this.resultMsg.set('');
    this.api.adminSaveScores(matchId, this.previewScoreA, this.previewScoreB, this.previewStats()).subscribe({
      next: (res: any) => {
        this.saving.set(null);
        if (res.status === 'success') {
          this.resultMsg.set(`✅ Saved & calculated — ${res.statsCount} players · Score: ${res.scoreA}–${res.scoreB}`);
          this.resultMatchId.set(matchId);
          this.previewMatchId.set(null);
          this.previewStats.set([]);
          this.loadMatches();
        } else {
          this.resultMsg.set('❌ ' + (res.error || 'Save failed'));
        }
      },
      error: (err: any) => {
        this.saving.set(null);
        this.resultMsg.set('❌ ' + (err.error?.error || 'Save failed'));
      }
    });
  }

  discardPreview() {
    this.previewMatchId.set(null);
    this.previewStats.set([]);
    this.resultMsg.set('');
    this.statsPlayerSearch.set('');
    this.statsTeamFilter.set(null);
    this.statsPosFilter.set(null);
  }

  triggerPreviewRefresh() {
    this.previewRefresh.update(n => n + 1);
  }

  calcPreviewPoints(s: any): number {
    return this.calcPoints({
      minutesPlayed: s.minutesPlayed,
      goals: s.goals,
      assists: s.assists,
      yellowCards: s.yellowCards,
      redCards: s.redCards,
      ownGoals: s.ownGoals ?? 0,
      cleanSheet: s.cleanSheet,
      goalsConceded: s.goalsConceded,
      saves: s.saves,
      shotsOnTarget: s.shotsOnTarget,
      player: { position: s.position }
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
    this.api.adminGetAllUsers().subscribe({
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

  deleteUser(u: AppUser) {
    if (!confirm(`Delete "${u.displayName || u.username}"?\n\nThis will remove their account and all squad data permanently.`)) return;
    this.api.adminDeleteUser(u.id).subscribe({
      next: () => {
        if (this.selectedUserId() === u.id) {
          this.selectedUserId.set(null);
          this.selectedUserTeam.set(null);
        }
        this.loadUsers();
      },
      error: err => alert(err?.error?.error || 'Failed to delete user')
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

  onXlsxSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.uploadFile = input.files?.[0] ?? null;
    this.uploadResult.set(null);
  }

  uploadUsers() {
    if (!this.uploadFile) return;
    this.uploadingBulk.set(true);
    this.uploadResult.set(null);
    this.api.adminBulkUploadUsers(this.uploadFile).subscribe({
      next: res => {
        this.uploadingBulk.set(false);
        this.uploadResult.set(res);
        this.loadUsers();
      },
      error: err => {
        this.uploadingBulk.set(false);
        this.uploadResult.set({ error: err?.error?.error || 'Upload failed' });
      }
    });
  }

  cancelBulkUpload() {
    this.showBulkUpload.set(false);
    this.uploadFile = null;
    this.uploadResult.set(null);
  }

  activeTab = signal('scores');

  private allAdminTabs = [
    { key: 'scores',  icon: '📊', label: 'Scores'  },
    { key: 'users',   icon: '👥', label: 'Users'   },
    { key: 'players', icon: '⚽', label: 'Players' },
    { key: 'teams',   icon: '🌍', label: 'Teams'   },
    { key: 'rounds',  icon: '⚙️', label: 'Rounds'  },
    { key: 'guide',   icon: '⭐', label: 'Points'  },
    { key: 'audit',   icon: '🔍', label: 'Audit'   },
    { key: 'db',      icon: '🗄️', label: 'DB'      },
  ];

  adminTabs = computed(() =>
    this.auth.username() === 'superadmin'
      ? this.allAdminTabs
      : this.allAdminTabs.filter(t => t.key !== 'db')
  );

  setTab(key: string) {
    this.activeTab.set(key);
    if (key === 'users') {
      if (this.allUsers().length === 0) this.loadUsers();
      if (Object.keys(this.ppPlayerPoints()).length === 0) this.loadPlayerPoints();
    }
    if (key === 'players') {
      if (this.allPpPlayers().length === 0) this.loadPpPlayers();
      if (this.allTeams().length === 0) this.api.getTeams().subscribe(t => this.allTeams.set(t));
    }
    if (key === 'teams') {
      if (this.allTeamsAdmin().length === 0) this.loadTeamsAdmin();
    }
    if (key === 'audit') {
      this.runSquadAudit();
    }
  }

  // ── Player Pool ─────────────────────────────────────────────────────────────
  allPpPlayers  = signal<any[]>([]);
  ppFiltered    = signal<any[]>([]);
  ppSearch      = '';
  ppPos         = '';
  ppSort        = 'team';
  ppSortDir     = 1; // 1 = asc, -1 = desc
  ppEditId      = signal<number | null>(null);
  ppEditPrice   = 0;
  ppEditPos     = '';
  ppSaving      = signal(false);
  ppDeleting    = signal<number | null>(null);
  ppMsg         = signal('');
  ppMsgErr      = signal(false);

  // Add player form
  showAddPlayer  = signal(false);
  ppNewName      = '';
  ppNewPos       = '';
  ppNewTeamId    = '';
  ppNewPrice     = 6000000;
  ppAddSaving    = signal(false);
  allTeams       = signal<any[]>([]);
  ppShowEliminated = signal(false);
  ppPlayerPoints   = signal<Record<number, number | undefined>>({});
  ppPriceUploading = signal(false);
  ppPriceResult    = signal<{ updated?: number; notFound?: number; skipped?: number; errors?: string[]; error?: string } | null>(null);

  // Squad position audit
  auditRows        = signal<any[]>([]);
  auditLoading     = signal(false);
  auditMsg         = signal('');

  runSquadAudit() {
    this.auditLoading.set(true);
    this.auditMsg.set('');
    this.api.adminSquadAudit().subscribe({
      next: rows => {
        this.auditRows.set(rows);
        this.auditLoading.set(false);
        if (rows.length === 0) this.auditMsg.set('No position mismatches found.');
      },
      error: () => { this.auditLoading.set(false); this.auditMsg.set('Failed to load audit data.'); }
    });
  }

  // Country limit audit
  countryAuditRows    = signal<any[]>([]);
  countryAuditLoading = signal(false);
  countryAuditMsg     = signal('');

  runCountryAudit() {
    this.countryAuditLoading.set(true);
    this.countryAuditMsg.set('');
    this.api.adminCountryLimitAudit().subscribe({
      next: rows => {
        this.countryAuditRows.set(rows);
        this.countryAuditLoading.set(false);
        if (rows.length === 0) this.countryAuditMsg.set('All squads are within country limits.');
      },
      error: () => { this.countryAuditLoading.set(false); this.countryAuditMsg.set('Failed to load country audit data.'); }
    });
  }

  // Teams management
  allTeamsAdmin    = signal<any[]>([]);
  taFiltered       = signal<any[]>([]);
  teamsAdminLoading = signal(false);
  teamToggleSaving  = signal<number | null>(null);
  taSearch         = '';
  taSort           = 'name';
  taSortDir        = 1;

  loadPpPlayers() {
    this.api.getAllPlayers().subscribe({ next: players => { this.allPpPlayers.set(players); this.filterPlayers(); } });
    this.loadPlayerPoints();
    if (this.allTeams().length === 0) this.api.getTeams().subscribe(t => this.allTeams.set(t));
  }

  loadPlayerPoints() {
    this.api.getPlayerPoints().subscribe({
      next: pts => this.ppPlayerPoints.set(pts),
      error: () => {}
    });
  }

  loadTeamsAdmin() {
    this.teamsAdminLoading.set(true);
    this.api.getTeams().subscribe({
      next: teams => { this.allTeamsAdmin.set(teams); this.teamsAdminLoading.set(false); this.filterTeams(); },
      error: () => this.teamsAdminLoading.set(false)
    });
  }

  filterTeams() {
    const q = this.taSearch.trim().toLowerCase();
    let list = this.allTeamsAdmin();
    if (q) list = list.filter(t => t.name?.toLowerCase().includes(q) || t.code?.toLowerCase().includes(q) || t.group?.toLowerCase().includes(q));
    list = [...list].sort((a, b) => {
      // Eliminated always at the bottom regardless of sort
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      let cmp = 0;
      switch (this.taSort) {
        case 'code':   cmp = (a.code ?? '').localeCompare(b.code ?? ''); break;
        case 'group':  cmp = (a.group ?? '').localeCompare(b.group ?? ''); break;
        case 'status': cmp = (a.eliminated === b.eliminated) ? 0 : (a.eliminated ? 1 : -1); break;
        default:       cmp = (a.name ?? '').localeCompare(b.name ?? ''); break;
      }
      return cmp * this.taSortDir;
    });
    this.taFiltered.set(list);
  }

  setTaSort(col: string) {
    if (this.taSort === col) this.taSortDir *= -1;
    else { this.taSort = col; this.taSortDir = 1; }
    this.filterTeams();
  }

  taSortIcon(col: string): string {
    if (this.taSort !== col) return '↕';
    return this.taSortDir === 1 ? '↑' : '↓';
  }

  setPpSort(col: string) {
    if (this.ppSort === col) this.ppSortDir *= -1;
    else { this.ppSort = col; this.ppSortDir = 1; }
    this.filterPlayers();
  }

  ppSortIcon(col: string): string {
    if (this.ppSort !== col) return '↕';
    return this.ppSortDir === 1 ? '↑' : '↓';
  }

  toggleEliminated(team: any) {
    const newVal = !team.eliminated;
    this.teamToggleSaving.set(team.id);
    this.api.adminSetTeamEliminated(team.id, newVal).subscribe({
      next: () => {
        team.eliminated = newVal;
        this.teamToggleSaving.set(null);
        // Update allTeams so player pool also reflects the change
        this.allTeams.update(ts => ts.map(t => t.id === team.id ? { ...t, eliminated: newVal } : t));
        this.allTeamsAdmin.update(ts => ts.map(t => t.id === team.id ? { ...t, eliminated: newVal } : t));
        this.allPpPlayers.update(ps => ps.map(p =>
          p.team?.id === team.id ? { ...p, team: { ...p.team, eliminated: newVal } } : p
        ));
        this.filterPlayers();
        this.filterTeams();
      },
      error: () => this.teamToggleSaving.set(null)
    });
  }

  filterPlayers() {
    const q = this.ppSearch.trim().toLowerCase();
    const pos = this.ppPos;
    let list = this.allPpPlayers();
    if (!this.ppShowEliminated()) list = list.filter(p => !p.team?.eliminated);
    if (pos) list = list.filter(p => p.position === pos);
    if (q)   list = list.filter(p => p.name.toLowerCase().includes(q) || p.team?.name?.toLowerCase().includes(q));
    const dir = this.ppSortDir;
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (this.ppSort) {
        case 'name':  cmp = a.name.localeCompare(b.name); break;
        case 'price': cmp = (a.price ?? 0) - (b.price ?? 0); break;
        case 'pts':   cmp = (this.ppPlayerPoints()[a.id] ?? 0) - (this.ppPlayerPoints()[b.id] ?? 0); break;
        default:      cmp = (a.team?.name ?? '').localeCompare(b.team?.name ?? '') || a.name.localeCompare(b.name); break;
      }
      return cmp * dir;
    });
    this.ppFiltered.set(list);
  }

  startPpEdit(p: any) {
    this.ppEditId.set(p.id);
    this.ppEditPrice = p.price ?? 0;
    this.ppEditPos = p.position ?? '';
    this.ppMsg.set('');
  }

  savePpPrice(p: any) {
    if (!this.ppEditPrice || this.ppEditPrice < 1_000_000) {
      this.ppMsg.set('Price must be at least 1,000,000'); this.ppMsgErr.set(true); return;
    }
    this.ppSaving.set(true);
    this.api.adminUpdatePlayer(p.id, { position: this.ppEditPos, price: this.ppEditPrice }).subscribe({
      next: (res) => {
        this.ppSaving.set(false);
        this.ppEditId.set(null);
        p.price = this.ppEditPrice;
        p.position = this.ppEditPos;
        this.ppMsg.set(`✅ ${p.name} updated`);
        this.ppMsgErr.set(false);
        this.filterPlayers();
      },
      error: () => { this.ppSaving.set(false); this.ppMsg.set('Failed to update player'); this.ppMsgErr.set(true); }
    });
  }

  deletePpPlayer(p: any) {
    if (!confirm(`Delete "${p.name}"?\nThis will permanently remove the player.`)) return;
    this.ppDeleting.set(p.id);
    this.ppMsg.set('');
    this.api.adminDeletePlayer(p.id).subscribe({
      next: () => {
        this.ppDeleting.set(null);
        this.allPpPlayers.update(list => list.filter(x => x.id !== p.id));
        this.filterPlayers();
        this.ppMsg.set(`✅ ${p.name} deleted`);
        this.ppMsgErr.set(false);
      },
      error: err => {
        this.ppDeleting.set(null);
        this.ppMsg.set('❌ ' + (err?.error?.error || 'Delete failed'));
        this.ppMsgErr.set(true);
      }
    });
  }

  onPriceFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.ppPriceUploading.set(true);
    this.ppPriceResult.set(null);
    this.api.adminUploadPlayerPrices(file).subscribe({
      next: (res: any) => {
        this.ppPriceResult.set(res);
        this.ppPriceUploading.set(false);
        // Reload player list to reflect updated prices
        this.api.getAllPlayers().subscribe({ next: players => { this.allPpPlayers.set(players); this.filterPlayers(); } });
        (event.target as HTMLInputElement).value = '';
      },
      error: (err: any) => {
        this.ppPriceResult.set({ error: err?.error?.error ?? 'Upload failed' });
        this.ppPriceUploading.set(false);
        (event.target as HTMLInputElement).value = '';
      }
    });
  }

  addPpPlayer() {
    if (!this.ppNewName.trim() || !this.ppNewPos || !this.ppNewTeamId) return;
    this.ppAddSaving.set(true);
    this.ppMsg.set('');
    this.api.adminCreatePlayer(this.ppNewName.trim(), this.ppNewPos, +this.ppNewTeamId, this.ppNewPrice).subscribe({
      next: res => {
        this.ppAddSaving.set(false);
        const team = this.allTeams().find(t => t.id === +this.ppNewTeamId);
        const newPlayer = { id: res.id, name: res.name, position: res.position, team, price: this.ppNewPrice };
        this.allPpPlayers.update(list => [...list, newPlayer]);
        this.filterPlayers();
        this.ppMsg.set(`✅ ${res.name} added`);
        this.ppMsgErr.set(false);
        this.ppNewName = ''; this.ppNewPos = ''; this.ppNewTeamId = ''; this.ppNewPrice = 6000000;
        this.showAddPlayer.set(false);
      },
      error: err => {
        this.ppAddSaving.set(false);
        this.ppMsg.set('❌ ' + (err?.error?.error || 'Failed to add player'));
        this.ppMsgErr.set(true);
      }
    });
  }

  fmtM(price: number): string {
    if (!price) return '—';
    return '$' + (price / 1_000_000).toFixed(1) + 'm';
  }

  ppPosColor(pos: string): string {
    const map: Record<string, string> = { GK: '#f59e0b', DEF: '#10b981', MID: '#3b82f6', FWD: '#ef4444' };
    return map[pos] ?? '#9ca3af';
  }

  startLocEdit(u: AppUser) {
    this.locEditId.set(u.id);
    this.locEditValue = u.location ?? '';
    this.locEditDisplayName = u.displayName ?? '';
  }

  saveLocEdit(u: AppUser) {
    this.locSaving.set(true);
    this.api.adminUpdateUser(u.id, { location: this.locEditValue, displayName: this.locEditDisplayName }).subscribe({
      next: res => {
        u.location = res.location || null;
        if (res.displayName) u.displayName = res.displayName;
        this.locEditId.set(null);
        this.locSaving.set(false);
      },
      error: () => {
        this.locSaving.set(false);
        alert('Failed to update user');
      }
    });
  }

  cancelLocEdit() {
    this.locEditId.set(null);
    this.locEditValue = '';
    this.locEditDisplayName = '';
  }

  private isMobile(): boolean {
    return window.innerWidth <= 600;
  }

  selectUser(u: AppUser) {
    this.selectedUserId.set(u.id);
    this.selectedUserTeam.set(null);
    this.selectedUserMatchPoints.set([]);
    this.selectedUserTransfers.set([]);
    this.expandedMatchId.set(null);
    this.globalLoading.set(true);
    this.loadingMsg.set('Loading team...');
    this.api.getMyTeam(u.id).subscribe({
      next: team => {
        this.globalLoading.set(false);
        if (!team) {
          this.selectedUserTeam.set(null);
          if (this.isMobile()) {
            if (this.noSquadTimer) clearTimeout(this.noSquadTimer);
            this.noSquadUserId.set(u.id);
            this.noSquadTimer = setTimeout(() => this.noSquadUserId.set(null), 3000);
          } else {
            this.squadMobileView.set('pitch');
          }
          return;
        }
        this.selectedUserTeam.set(team);
        this.squadMobileView.set('pitch');
        this.api.getMyTeamPoints(u.id).subscribe({
          next: pts => this.selectedUserMatchPoints.set(pts),
          error: () => {}
        });
        this.api.getAllTransferRecords(u.id).subscribe({
          next: recs => this.selectedUserTransfers.set(recs),
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

  captainPlayed(breakdown: any[], captainId: number): boolean {
    const cap = breakdown.find((s: any) => s.player?.id === captainId);
    return cap ? (cap.minutesPlayed ?? 0) > 0 : false;
  }

  breakdownForMatch(matchId: number, team: any): any[] {
    const stats = this.matchStatsCache[matchId];
    if (!stats || !team) return [];
    const starterIds = new Set((team.starters || []).map((p: any) => p.id));
    return stats.filter((s: any) => starterIds.has(s.player?.id));
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

  sqPosColor(pos: string): string {
    const map: Record<string, string> = { GK: '#f59e0b', DEF: '#10b981', MID: '#3b82f6', FWD: '#ef4444' };
    return map[pos] ?? '#9ca3af';
  }

  sqShortName(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return name.length > 9 ? name.slice(0, 8) + '.' : name;
    return parts[parts.length - 1].length > 9
      ? parts[parts.length - 1].slice(0, 8) + '.'
      : parts[parts.length - 1];
  }

  sqPitchRows(team: any): any[][] {
    const starters: any[] = team.starters || [];
    const formation: string = team.formation || '4-4-2';
    const parts = formation.split('-').map(Number);
    const def = parts[0] ?? 4, mid = parts[1] ?? 4, fwd = parts[2] ?? 2;
    const gks  = starters.filter(p => p.position === 'GK').slice(0, 1);
    const defs = starters.filter(p => p.position === 'DEF').slice(0, def);
    const mids = starters.filter(p => p.position === 'MID').slice(0, mid);
    const fwds = starters.filter(p => p.position === 'FWD').slice(0, fwd);
    return [gks, defs, mids, fwds].filter(r => r.length > 0);
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

  formatRoundStart(dt: string): string {
    return new Date(dt).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  }

  formatDate(dt: string): string {
    return new Date(dt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  formatShortDate(dt: string): string {
    return new Date(dt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }

  private readonly STAGE_LABELS: Record<string, string> = {
    R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-Final',
    SF: 'Semi-Final', LF: "Losers' Final", FINAL: 'Final'
  };

  stageLabel(stage: string): string {
    return this.STAGE_LABELS[stage] ?? stage;
  }

  freeTransfersFor(stage: string): number {
    return this.rcRows().find(r => r.stage === stage)?.freeTransfers ?? 4;
  }

  matchLabel(match: Match): string {
    if (match.stage === 'GROUP' || !match.matchNumber) return match.stage;
    return `${this.STAGE_LABELS[match.stage] ?? match.stage} · Match ${match.matchNumber}`;
  }

  formatBracketLabel(label: string | null): string {
    if (!label) return 'TBD';
    return label
      .replace(/Round of 32\s+(\d+)/i,  'R32 M$1')
      .replace(/Round of 16\s+(\d+)/i,  'R16 M$1')
      .replace(/Quarterfinal\s+(\d+)/i, 'QF M$1')
      .replace(/Semifinal\s+(\d+)/i,    'SF M$1');
  }

  teamName(match: Match, side: 'A' | 'B'): string {
    const team  = side === 'A' ? match.teamA  : match.teamB;
    const label = side === 'A' ? match.teamALabel : match.teamBLabel;
    return team?.name ?? this.formatBracketLabel(label);
  }
}
