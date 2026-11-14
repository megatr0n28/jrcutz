import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { LoginComponent } from './login.component';

describe('LoginComponent session notice', () => {
  it('explains why the user needs to sign in again', () => {
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ session: 'expired' }) } } }
      ]
    });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent)
      .toContain('Your session has expired or is no longer valid');
  });
});
