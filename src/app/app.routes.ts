import { Routes } from '@angular/router';
import { MatchListComponent } from './components/match-list/match-list.component';
import { SquadBuilderComponent } from './components/squad-builder/squad-builder.component';
import { LeaderboardComponent } from './components/leaderboard/leaderboard.component';
import { LoginComponent } from './components/login/login.component';
import { AdminScoresComponent } from './components/admin-scores/admin-scores.component';
import { LiveMatchComponent } from './components/live-match/live-match.component';
import { MyPicksComponent } from './components/my-picks/my-picks.component';
import { MyTeamComponent } from './components/my-team/my-team.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'my-team', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'my-team',    component: MyTeamComponent,       canActivate: [authGuard] },
  { path: 'matches',    component: MatchListComponent,     canActivate: [authGuard] },
  { path: 'squad/:matchId', component: SquadBuilderComponent, canActivate: [authGuard] },
  { path: 'live/:matchId',  component: LiveMatchComponent,    canActivate: [authGuard] },
  { path: 'leaderboard', component: LeaderboardComponent,  canActivate: [authGuard] },
  { path: 'my-picks',   component: MyPicksComponent,       canActivate: [authGuard] },
  { path: 'admin',      component: AdminScoresComponent,   canActivate: [authGuard] },
];
