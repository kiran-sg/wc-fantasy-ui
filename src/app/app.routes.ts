import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'my-team', pathMatch: 'full' },
  { path: 'login',          loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent) },
  { path: 'my-team',        loadComponent: () => import('./components/my-team/my-team.component').then(m => m.MyTeamComponent),             canActivate: [authGuard] },
  { path: 'matches',        loadComponent: () => import('./components/match-list/match-list.component').then(m => m.MatchListComponent),     canActivate: [authGuard] },
  { path: 'squad/:matchId', loadComponent: () => import('./components/squad-builder/squad-builder.component').then(m => m.SquadBuilderComponent), canActivate: [authGuard] },
  { path: 'live/:matchId',  loadComponent: () => import('./components/live-match/live-match.component').then(m => m.LiveMatchComponent),     canActivate: [authGuard] },
  { path: 'leaderboard',    loadComponent: () => import('./components/leaderboard/leaderboard.component').then(m => m.LeaderboardComponent), canActivate: [authGuard] },
  { path: 'my-picks',       loadComponent: () => import('./components/my-picks/my-picks.component').then(m => m.MyPicksComponent),           canActivate: [authGuard] },
  { path: 'admin',          loadComponent: () => import('./components/admin-scores/admin-scores.component').then(m => m.AdminScoresComponent), canActivate: [authGuard] },
];
