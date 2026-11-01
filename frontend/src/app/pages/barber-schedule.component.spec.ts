import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiService, TimeSlot } from '../core/api.service';
import type { Mock } from 'vitest';
import { BarberScheduleComponent } from './barber-schedule.component';

const slot = (time: string, reason?: TimeSlot['reason']): TimeSlot => ({
  startsAt: `2030-01-07T${time}:00Z`, time, available: !reason, reason
});

const daySlots = [slot('09:00'), slot('09:15', 'booked'), slot('12:00', 'lunch'), slot('12:15', 'past')];

describe('BarberScheduleComponent', () => {
  let fixture: ComponentFixture<BarberScheduleComponent>;
  let comp: BarberScheduleComponent;
  const names = ['barbers', 'getBarberAvailability', 'barberSlots', 'saveBarberAvailability'] as const;
  let api: Record<typeof names[number], Mock>;

  const el = () => fixture.nativeElement as HTMLElement;

  function create(barbers: any[]) {
    api = Object.fromEntries(names.map(n => [n, vi.fn()])) as typeof api;
    api.barbers.mockReturnValue(of(barbers));
    api.getBarberAvailability.mockReturnValue(of([]));
    api.barberSlots.mockReturnValue(of({
      date: '', timezone: 'UTC', durationMinutes: 15, slots: daySlots
    } as any));
    TestBed.configureTestingModule({
      imports: [BarberScheduleComponent],
      providers: [{ provide: ApiService, useValue: api }]
    });
    fixture = TestBed.createComponent(BarberScheduleComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('with one barber', () => {
    beforeEach(() => create([{ id: 9, name: 'Solo' }]));

    it('selects the only barber by default and loads their schedule', () => {
      expect(comp.selectedBarberId).toBe(9);
      expect(api.getBarberAvailability).toHaveBeenCalledWith(9);
      expect(api.barberSlots).toHaveBeenCalled();
    });

    it('keeps the weekly editor collapsed until editing starts', () => {
      expect(comp.editing).toBe(false);
      expect(el().querySelector('.schedule-actions')).toBeNull();
      comp.editing = true;
      fixture.detectChanges();
      expect(el().querySelector('.schedule-actions')).not.toBeNull();
    });

    it('counts and filters slots by reason', () => {
      expect(comp.countSlots('open')).toBe(1);
      expect(comp.countSlots('booked')).toBe(1);
      expect(comp.countSlots('lunch')).toBe(1);
      expect(comp.countSlots('past')).toBe(1);
      expect(comp.filteredSlots.length).toBe(4);
      comp.slotFilter = 'lunch';
      expect(comp.filteredSlots.map(s => s.time)).toEqual(['12:00']);
      comp.slotFilter = 'open';
      expect(comp.filteredSlots.map(s => s.time)).toEqual(['09:00']);
    });

    it('shows Clear filter only when a slot filter is active', () => {
      const clear = () => Array.from(el().querySelectorAll('.slot-legend .clear-filter'));
      expect(clear().length).toBe(0);
      comp.slotFilter = 'booked';
      fixture.detectChanges();
      expect(clear().length).toBe(1);
      (clear()[0] as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(comp.slotFilter).toBe('');
      expect(clear().length).toBe(0);
    });

    it('formats slot labels in 12-hour time', () => {
      expect(comp.label(slot('00:15'))).toBe('12:15 AM');
      expect(comp.label(slot('13:45'))).toBe('1:45 PM');
    });

    describe('weekly view', () => {
      beforeEach(() => {
        comp.slotDate = '2026-11-04'; // Wednesday
        comp.setViewMode('week');
        fixture.detectChanges();
      });

      it('loads Monday through Sunday', () => {
        expect(comp.weekDays.length).toBe(7);
        expect(comp.weekDays[0].date).toBe('2026-11-02');
        expect(comp.weekDays[6].date).toBe('2026-11-08');
        expect(el().querySelectorAll('.week-col').length).toBe(7);
      });

      it('shows the week ending Sunday', () => {
        expect(comp.weekEnding).toBe('Sunday, November 8, 2026');
        expect(el().querySelector('.week-ending')?.textContent)
          .toContain('Week ending Sunday, November 8, 2026');
      });

      it('week ending is the same day when a Sunday is selected', () => {
        comp.slotDate = '2026-11-08';
        expect(comp.weekEnding).toBe('Sunday, November 8, 2026');
        comp.slotDate = '2026-11-02'; // Monday
        expect(comp.weekEnding).toBe('Sunday, November 8, 2026');
      });

      it('hides the week-ending label in daily view', () => {
        comp.setViewMode('day');
        fixture.detectChanges();
        expect(el().querySelector('.week-ending')).toBeNull();
      });

      it('lets the user pick a specific day', () => {
        const tabs = el().querySelectorAll('.day-tabs button');
        expect(tabs.length).toBe(8);
        (tabs[3] as HTMLButtonElement).click(); // Wed
        fixture.detectChanges();
        expect(comp.selectedWeekDay).toBe('2026-11-04');
        expect(comp.visibleWeekDays.length).toBe(1);
        expect(el().querySelectorAll('.week-col').length).toBe(1);
        (tabs[0] as HTMLButtonElement).click(); // All days
        fixture.detectChanges();
        expect(el().querySelectorAll('.week-col').length).toBe(7);
      });

      it('clears the selected day when moving to another week', () => {
        comp.selectedWeekDay = '2026-11-04';
        comp.shiftDate(1);
        expect(comp.slotDate).toBe('2026-11-11');
        expect(comp.selectedWeekDay).toBe('');
      });

      it('keeps the selected day when it is still in the week', () => {
        comp.selectedWeekDay = '2026-11-04';
        comp.slotDate = '2026-11-05';
        comp.loadSlots();
        expect(comp.selectedWeekDay).toBe('2026-11-04');
      });

      it('counts slots across the whole week', () => {
        expect(comp.countSlots('booked')).toBe(7);
      });

      it('shows an error when a week fails to load', () => {
        api.barberSlots.mockReturnValue(throwError(() => ({ error: { error: 'boom' } })));
        comp.loadSlots();
        expect(comp.slotsError).toBe('boom');
      });
    });

    describe('navigation', () => {
      it('moves a day at a time in daily view', () => {
        comp.slotDate = '2026-11-30';
        comp.shiftDate(1);
        expect(comp.slotDate).toBe('2026-12-01');
        comp.shiftDate(-1);
        expect(comp.slotDate).toBe('2026-11-30');
      });

      it('moves seven days in weekly view', () => {
        comp.slotDate = '2026-11-04';
        comp.setViewMode('week');
        comp.shiftDate(-1);
        expect(comp.slotDate).toBe('2026-10-28');
      });
    });

    describe('saving', () => {
      const block = (over: any = {}) => ({
        dayOfWeek: 1, startTime: '09:00', endTime: '17:00', isActive: true, ...over
      });

      it('rejects lunch with only one time', () => {
        comp.blocks = [block({ lunchStart: '12:00' })];
        comp.saveSchedule();
        expect(comp.error).toBe('Enter both a lunch start and end time.');
        expect(api.saveBarberAvailability).not.toHaveBeenCalled();
      });

      it('rejects lunch outside working hours', () => {
        comp.blocks = [block({ lunchStart: '16:30', lunchEnd: '17:30' })];
        comp.saveSchedule();
        expect(comp.error).toBe('Lunch must fall within the working hours.');
      });

      it('rejects overlapping blocks', () => {
        comp.blocks = [block({ endTime: '13:00' }), block({ startTime: '12:00' })];
        comp.saveSchedule();
        expect(comp.error).toBe('Working hours cannot overlap.');
      });

      it('shows a success message and keeps it after reload', () => {
        api.saveBarberAvailability.mockReturnValue(of({}));
        comp.blocks = [block({ lunchStart: '12:00', lunchEnd: '13:00' })];
        comp.saveSchedule();
        expect(comp.message).toBe('Weekly schedule saved successfully.');
        expect(comp.saving).toBe(false);
      });

      it('shows plain-text server errors', () => {
        api.saveBarberAvailability.mockReturnValue(
          throwError(() => ({ error: 'Cannot remove availability containing existing appointments' })));
        comp.blocks = [block()];
        comp.saveSchedule();
        expect(comp.error).toBe('Cannot remove availability containing existing appointments');
        expect(comp.saving).toBe(false);
      });

      it('falls back to a generic error', () => {
        api.saveBarberAvailability.mockReturnValue(throwError(() => ({ error: null })));
        comp.blocks = [block()];
        comp.saveSchedule();
        expect(comp.error).toBe('Unable to save schedule.');
      });
    });
  });

  describe('with several barbers', () => {
    beforeEach(() => create([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]));

    it('does not preselect a barber', () => {
      expect(comp.selectedBarberId).toBe(0);
      expect(api.getBarberAvailability).not.toHaveBeenCalled();
    });

    it('collapses the editor when the barber changes', () => {
      comp.editing = true;
      comp.selectedBarberId = 2;
      comp.onBarberChange();
      expect(comp.editing).toBe(false);
      expect(api.getBarberAvailability).toHaveBeenCalledWith(2);
    });
  });
});
