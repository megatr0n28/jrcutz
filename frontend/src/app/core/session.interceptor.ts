import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ApiService } from './api.service';

export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  const api = inject(ApiService);
  const router = inject(Router);

  return next(req).pipe(catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && error.status === 401 &&
        req.url.startsWith('/api/') && api.token &&
        req.headers.get('Authorization') === `Bearer ${api.token}`) {
      api.logout();
      void router.navigate(['/login'], { queryParams: { session: 'expired' } });
    }
    return throwError(() => error);
  }));
};
