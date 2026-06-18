import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Team, Player, Match, UserSquad, AppUser } from '../models/models';
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

  saveSquad(userId: number, matchId: number, playerIds: number[], captainId: number): Observable<UserSquad> {
    return this.http.post<UserSquad>(`${this.base}/squads`, { userId, matchId, playerIds, captainId });
  }

  getSquad(userId: number, matchId: number): Observable<UserSquad> {
    return this.http.get<UserSquad>(`${this.base}/squads/${userId}/${matchId}`);
  }

  getLeaderboard(): Observable<AppUser[]> {
    return this.http.get<AppUser[]>(`${this.base}/leaderboard`);
  }

  // Admin endpoints
  adminGetMatches(): Observable<Match[]> {
    return this.http.get<Match[]>(`${this.base}/admin/matches`);
  }

  adminUpdateScores(matchId: number): Observable<any> {
    return this.http.post(`${this.base}/admin/update-scores/${matchId}`, {});
  }

  adminGetMatchStats(matchId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/admin/match-stats/${matchId}`);
  }

  adminGetMatchSquads(matchId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/admin/match-squads/${matchId}`);
  }
}
