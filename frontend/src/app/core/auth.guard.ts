import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';

export const customerGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  const router = inject(Router);
  return api.loggedIn ? true : router.createUrlTree(['/login']);
};

export const adminGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  const router = inject(Router);
  return api.isAdmin ? true : router.createUrlTree(['/login']);
};