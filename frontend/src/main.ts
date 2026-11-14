import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { sessionInterceptor } from './app/core/session.interceptor';

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(withInterceptors([sessionInterceptor])), provideRouter(routes)]
}).catch(console.error);