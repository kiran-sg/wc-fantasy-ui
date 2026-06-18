import { Routes } from '@angular/router';
import { MatchListComponent } from './components/match-list/match-list.component';
import { SquadBuilderComponent } from './components/squad-builder/squad-builder.component';
import { LeaderboardComponent } from './components/leaderboard/leaderboard.component';
import { LoginComponent } from './components/login/login.component';
import { AdminScoresComponent } from './components/admin-scores/admin-scores.component';

export const routes: Routes = [
  { path: '', redirectTo: 'matches', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'matches', component: MatchListComponent },
  { path: 'squad/:matchId', component: SquadBuilderComponent },
  { path: 'leaderboard', component: LeaderboardComponent },
  { path: 'admin', component: AdminScoresComponent },
];
