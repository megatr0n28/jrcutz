import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home.component';
import { LoginComponent } from './pages/login.component';
import { BookingComponent } from './pages/booking.component';
import { MyBookingsComponent } from './pages/my-bookings.component';
import { AdminComponent } from './pages/admin.component';
import { customerGuard, adminGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  {
    path: 'book',
    component: BookingComponent,
    canActivate: [customerGuard]
  },
  {
    path: 'my-bookings',
    component: MyBookingsComponent,
    canActivate: [customerGuard]
  },
  {
    path: 'admin',
    component: AdminComponent,
    canActivate: [adminGuard]
  },
  { path: '**', redirectTo: '' }
];