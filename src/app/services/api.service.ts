import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Team, Player, Match, UserSquad, AppUser, LeaderboardEntry, UserTeam, UserTeamMatchPoints, UserTransferRecord, UserTeamSnapshot, RoundConfig } from '../models/models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiBase;

  getTeams(): Observable<Team[]> {
    return this.http.get<Team[]>(`${this.base}/teams`);
  }

  getPlayersByTeam(teamId: number): Observable<Player[]> {
    return this.http.get<Player[]>(`${this.base}/players/team/${teamId}`);
  }

  getMatches(): Observable<Match[]> {
    return this.http.get<Match[]>(`${this.base}/matches`);
  }

  getMatchesByStatus(status: string): Observable<Match[]> {
    return this.http.get<Match[]>(`${this.base}/matches/status/${status}`);
  }

  saveSquad(
    userId: number,
    matchId: number,
    playerIds: number[],
    captainId: number,
    viceCaptainId: number,
    benchIds: number[]
  ): Observable<UserSquad> {
    return this.http.post<UserSquad>(`${this.base}/squads`, {
      userId, matchId, playerIds, captainId, viceCaptainId, benchIds
    });
  }

  manualSub(squadId: number, outPlayerId: number, inPlayerId: number): Observable<UserSquad> {
    return this.http.post<UserSquad>(`${this.base}/squads/${squadId}/sub`, { outPlayerId, inPlayerId });
  }

  changeCaptain(squadId: number, captainId: number): Observable<UserSquad> {
    return this.http.post<UserSquad>(`${this.base}/squads/${squadId}/captain`, { captainId });
  }

  getSquad(userId: number, matchId: number): Observable<UserSquad> {
    return this.http.get<UserSquad>(`${this.base}/squads/${userId}/${matchId}`);
  }

  getUserSquads(userId: number): Observable<UserSquad[]> {
    return this.http.get<UserSquad[]>(`${this.base}/squads/${userId}`);
  }

  getOverallLeaderboard(): Observable<LeaderboardEntry[]> {
    return this.http.get<LeaderboardEntry[]>(`${this.base}/leaderboard`);
  }

  adminGetAllUsers(): Observable<AppUser[]> {
    return this.http.get<AppUser[]>(`${this.base}/admin/users`);
  }

  // Persistent team endpoints
  getMyTeam(userId: number): Observable<UserTeam> {
    return this.http.get<UserTeam>(`${this.base}/team?userId=${userId}`);
  }

  saveMyTeam(
    userId: number,
    starterIds: number[],
    benchIds: number[],
    captainId: number,
    viceCaptainId: number,
    stage: string,
    formation: string
  ): Observable<UserTeam> {
    return this.http.post<UserTeam>(`${this.base}/team`, {
      userId, starterIds, benchIds, captainId, viceCaptainId, stage, formation
    });
  }

  getMyTeamPoints(userId: number): Observable<UserTeamMatchPoints[]> {
    return this.http.get<UserTeamMatchPoints[]>(`${this.base}/team/points?userId=${userId}`);
  }

  getTransferRecord(userId: number, stage: string): Observable<UserTransferRecord> {
    return this.http.get<UserTransferRecord>(`${this.base}/team/transfers?userId=${userId}&stage=${stage}`);
  }

  getAllTransferRecords(userId: number): Observable<UserTransferRecord[]> {
    return this.http.get<UserTransferRecord[]>(`${this.base}/team/transfers/all?userId=${userId}`);
  }

  getTeamSnapshots(userId: number): Observable<UserTeamSnapshot[]> {
    return this.http.get<UserTeamSnapshot[]>(`${this.base}/team/snapshots?userId=${userId}`);
  }

  getRoundConfigs(): Observable<RoundConfig[]> {
    return this.http.get<RoundConfig[]>(`${this.base}/round-config`);
  }

  getActiveRoundConfig(): Observable<RoundConfig | null> {
    return this.http.get<any>(`${this.base}/round-config/active`).pipe(
      map((r: any) => r?.stage === 'NONE' ? null : r as RoundConfig)
    );
  }

  updateRoundConfig(stage: string, config: Partial<RoundConfig>): Observable<RoundConfig> {
    return this.http.put<RoundConfig>(`${this.base}/round-config/${stage}`, config);
  }

  syncRoundStarts(): Observable<RoundConfig[]> {
    return this.http.post<RoundConfig[]>(`${this.base}/round-config/sync-starts`, {});
  }

  getAllPlayers(): Observable<Player[]> {
    return this.http.get<Player[]>(`${this.base}/players`);
  }

  getPlayerPoints(): Observable<Record<number, number>> {
    return this.http.get<Record<number, number>>(`${this.base}/players/points`);
  }

  adminSyncFifaPrices(): Observable<any> {
    return this.http.post(`${this.base}/admin/sync-fifa-prices`, {});
  }

  // Sync endpoints
  syncAll(): Observable<any> { return this.http.get(`${this.base}/sync/all`); }
  syncTeams(): Observable<any> { return this.http.get(`${this.base}/sync/teams`); }
  syncMatches(): Observable<any> { return this.http.get(`${this.base}/sync/matches`); }
  syncPlayers(): Observable<any> { return this.http.get(`${this.base}/sync/players`); }
  syncReset(): Observable<any> { return this.http.get(`${this.base}/sync/reset`); }

  // Admin endpoints
  adminGetMatches(): Observable<Match[]> {
    return this.http.get<Match[]>(`${this.base}/admin/matches`);
  }

  adminUpdateScores(matchId: number): Observable<any> {
    return this.http.post(`${this.base}/admin/update-scores/${matchId}`, {});
  }

  adminPreviewScores(matchId: number): Observable<any> {
    return this.http.post(`${this.base}/admin/preview-scores/${matchId}`, {});
  }

  adminSaveScores(matchId: number, scoreA: number, scoreB: number, stats: any[]): Observable<any> {
    return this.http.post(`${this.base}/admin/save-scores/${matchId}`, { scoreA, scoreB, stats });
  }

  getMatchStats(matchId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/matches/${matchId}/stats`);
  }

  adminGetMatchStats(matchId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/admin/match-stats/${matchId}`);
  }

  adminGetMatchSquads(matchId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/admin/match-squads/${matchId}`);
  }

  adminUpdateUser(userId: number, patch: { location?: string; displayName?: string }): Observable<any> {
    return this.http.patch(`${this.base}/admin/users/${userId}`, patch);
  }

  adminDeleteUser(userId: number): Observable<any> {
    return this.http.delete(`${this.base}/admin/users/${userId}`);
  }

  adminCreateUser(username: string, displayName: string, location: string, isAdmin: boolean): Observable<any> {
    return this.http.post(`${this.base}/admin/users`, { username, displayName, location, isAdmin });
  }

  adminCreatePlayer(name: string, position: string, teamId: number, price: number): Observable<any> {
    return this.http.post(`${this.base}/admin/players`, { name, position, teamId, price });
  }

  adminDeletePlayer(playerId: number): Observable<any> {
    return this.http.delete(`${this.base}/admin/players/${playerId}`);
  }

  adminSetTeamEliminated(teamId: number, eliminated: boolean): Observable<any> {
    return this.http.patch(`${this.base}/admin/teams/${teamId}/eliminated`, { eliminated });
  }

  adminUpdatePlayerPrice(playerId: number, priceInUnits: number): Observable<any> {
    return this.http.patch(`${this.base}/admin/players/${playerId}/price?value=${priceInUnits}`, {});
  }

  adminUpdatePlayer(playerId: number, patch: { position?: string; price?: number }): Observable<any> {
    return this.http.patch(`${this.base}/admin/players/${playerId}`, patch);
  }

  adminBulkUploadUsers(file: File): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(`${this.base}/admin/users/bulk-upload`, form);
  }

  adminUploadPlayerPrices(file: File): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(`${this.base}/admin/players/price-upload`, form);
  }

  adminSquadAudit(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/admin/squad-audit`);
  }

  adminCountryLimitAudit(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/admin/country-limit-audit`);
  }
}
