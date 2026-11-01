import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app.component';

describe('AppComponent back to top', () => {
  afterEach(() => vi.restoreAllMocks());

  function create() {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('is hidden at the top of the page', () => {
    const fixture = create();
    expect(fixture.nativeElement.querySelector('.back-to-top')).toBeNull();
  });

  it('appears after scrolling and scrolls to the top on click', () => {
    const fixture = create();
    const comp = fixture.componentInstance;
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(500);
    comp.onScroll();
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('.back-to-top') as HTMLButtonElement;
    expect(btn).not.toBeNull();

    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    btn.click();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('hides again when scrolled back up', () => {
    const fixture = create();
    const comp = fixture.componentInstance;
    const y = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(500);
    comp.onScroll();
    expect(comp.showTop).toBe(true);
    y.mockReturnValue(100);
    comp.onScroll();
    expect(comp.showTop).toBe(false);
  });
});
