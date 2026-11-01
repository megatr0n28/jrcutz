import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import {
  ApiService,
  Barber,
  AvailabilityBlock,
  TimeSlot
} from '../core/api.service';

@Component({
  selector: 'app-barber-schedule',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="schedule-section">
      <div class="section-heading">
        <span class="eyebrow">STAFF MANAGEMENT</span>
        <h2>Barber availability.</h2>
        <p>Set the regular working hours your team keeps each week.</p>
      </div>

      <div class="schedule-panel">
        <div class="schedule-panel-heading">
          <div>
            <span class="eyebrow">WEEKLY HOURS</span>
            <h3>Build the weekly schedule.</h3>
            <p>Add one or more working windows for each day.</p>
          </div>
          <div class="schedule-heading-actions">
            <label>Select barber
              <select [(ngModel)]="selectedBarberId"
                name="barber"
                (ngModelChange)="onBarberChange()">
                <option [ngValue]="0">Choose a barber</option>
                @for (barber of barbers; track barber.id) {
                  <option [ngValue]="barber.id">
                    {{ barber.name }}
                  </option>
                }
              </select>
            </label>
            @if (selectedBarberId) {
              <button type="button" class="button button-outline"
                [attr.aria-expanded]="editing"
                aria-controls="weekly-schedule-editor"
                (click)="editing = !editing">
                {{ editing ? 'Hide schedule' : 'Edit schedule' }}
              </button>
            }
          </div>
        </div>

        @if (selectedBarberId && editing) {
          <div id="weekly-schedule-editor">
          <div class="schedule-days">
            @for (day of days; track day.value) {
              <div class="schedule-day">
                <div class="day-header">
                  <div>
                    <span class="day-index">0{{ $index + 1 }}</span>
                    <h3>{{ day.label }}</h3>
                  </div>
                  <button type="button"
                    class="schedule-add-link"
                    (click)="addBlock(day.value)">
                    + Add hours
                  </button>
                </div>

                @for (block of getBlocks(day.value); track block) {
                  <div class="time-block">
                    <label>Start
                      <input type="time"
                        [(ngModel)]="block.startTime"
                        [name]="'start-' + day.value + '-' + $index">
                    </label>

                    <label>End
                      <input type="time"
                        [(ngModel)]="block.endTime"
                        [name]="'end-' + day.value + '-' + $index">
                    </label>

                    <label class="active-toggle">
                      <input type="checkbox"
                        [(ngModel)]="block.isActive"
                        [name]="'active-' + day.value + '-' + $index">
                      <span>Active</span>
                    </label>

                    <div class="lunch-fields">
                      <label>Lunch start
                        <input type="time"
                          [(ngModel)]="block.lunchStart"
                          [name]="'lunch-start-' + day.value + '-' + $index">
                      </label>

                      <label>Lunch end
                        <input type="time"
                          [(ngModel)]="block.lunchEnd"
                          [name]="'lunch-end-' + day.value + '-' + $index">
                      </label>

                      @if (block.lunchStart || block.lunchEnd) {
                        <button type="button" class="remove-button"
                          (click)="clearLunch(block)">
                          Clear lunch
                        </button>
                      }
                    </div>

                    <button type="button"
                      class="remove-button"
                      (click)="removeBlock(block)">
                      Remove
                    </button>
                  </div>
                }

                @if (getBlocks(day.value).length === 0) {
                  <p class="day-empty">No hours set for this day yet.</p>
                }
              </div>
            }
          </div>

          <div class="schedule-actions">
            <button class="button button-gold"
              (click)="saveSchedule()"
              [disabled]="saving">
              {{ saving ? 'Saving...' : 'Save weekly schedule' }}
            </button>
          </div>
          </div>
        }

        @if (message) {
          <p class="success-message">{{ message }}</p>
        }

        @if (error) {
          <p class="error-message">{{ error }}</p>
        }

        @if (selectedBarberId) {
          <div class="slot-view">
            <div class="slot-view-header">
              <div>
                <span class="eyebrow">TIME SLOTS</span>
                <h3>Availability view.</h3>
                <p>15-minute slots generated from the saved weekly schedule.</p>
              </div>
              <div class="slot-view-controls">
                <div class="view-toggle" role="group" aria-label="Availability view">
                  <button type="button" [class.active]="viewMode === 'day'" (click)="setViewMode('day')">Daily</button>
                  <button type="button" [class.active]="viewMode === 'week'" (click)="setViewMode('week')">Weekly</button>
                </div>
                <button type="button" class="clear-filter" (click)="shiftDate(-1)">‹ Prev {{ viewMode === 'week' ? 'week' : 'day' }}</button>
                <label>Date
                  <input type="date" name="slotDate"
                    [(ngModel)]="slotDate" (ngModelChange)="loadSlots()">
                </label>
                <button type="button" class="clear-filter" (click)="shiftDate(1)">Next {{ viewMode === 'week' ? 'week' : 'day' }} ›</button>
                @if (viewMode === 'week' && weekEnding) {
                  <span class="week-ending">Week ending {{ weekEnding }}</span>
                }
              </div>
            </div>

            <div class="slot-legend">
              @for (k of slotKinds; track k.key) {
                <button type="button" class="legend-filter" [class.active]="slotFilter === k.key"
                  [attr.aria-pressed]="slotFilter === k.key" (click)="slotFilter = k.key">
                  <i class="swatch" [class]="k.key"></i> {{ k.label }} ({{ countSlots(k.key) }})
                </button>
              }
              @if (slotFilter) {
                <button type="button" class="clear-filter" (click)="slotFilter = ''">Clear filter</button>
              }
            </div>

            @if (slotsLoading) {
              <p class="slot-status">Loading time slots…</p>
            } @else if (slotsError) {
              <p class="error-message">{{ slotsError }}</p>
            } @else if (viewMode === 'week') {
              <div class="day-tabs" role="group" aria-label="Select day of week">
                <button type="button" [class.active]="!selectedWeekDay" (click)="selectedWeekDay = ''">All days</button>
                @for (d of weekDays; track d.date) {
                  <button type="button" [class.active]="selectedWeekDay === d.date"
                    (click)="selectedWeekDay = d.date">{{ d.label }}</button>
                }
              </div>
              <div class="week-grid" [class.single-day]="selectedWeekDay">
                @for (d of visibleWeekDays; track d.date) {
                  <div class="week-col">
                    <h4>{{ d.label }}</h4>
                    @if (d.slots.length === 0) {
                      <p class="slot-status">Off</p>
                    } @else {
                      @for (s of applyFilter(d.slots); track s.startsAt) {
                        <span class="slot-chip"
                          [class.booked]="s.reason === 'booked'"
                          [class.lunch]="s.reason === 'lunch'"
                          [class.past]="s.reason === 'past'"
                          [attr.title]="s.reason ? (s.reason === 'booked' ? 'Booked' : s.reason === 'lunch' ? 'Lunch' : 'Past') : 'Open'">
                          {{ label(s) }}
                        </span>
                      }
                    }
                  </div>
                }
              </div>
            } @else if (slots.length === 0) {
              <p class="slot-status">
                No hours are scheduled for this barber on this day.
              </p>
            } @else {
              <div class="slot-grid slot-grid-admin">
                @for (s of filteredSlots; track s.startsAt) {
                  <span class="slot-chip"
                    [class.booked]="s.reason === 'booked'"
                    [class.lunch]="s.reason === 'lunch'"
                    [class.past]="s.reason === 'past'"
                    [attr.title]="s.reason ? (s.reason === 'booked' ? 'Booked' : s.reason === 'lunch' ? 'Lunch' : 'Past') : 'Open'">
                    {{ label(s) }}
                  </span>
                }
              </div>
            }
          </div>
        }
      </div>
    </section>
  `
})
export class BarberScheduleComponent implements OnInit {
  private api = inject(ApiService);

  barbers: Barber[] = [];
  selectedBarberId = 0;
  blocks: AvailabilityBlock[] = [];
  saving = false;
  editing = false;
  message = '';
  error = '';

  slotDate = this.todayInput();
  slots: TimeSlot[] = [];
  viewMode: 'day' | 'week' = 'day';
  selectedWeekDay = '';
  weekDays: { date: string; label: string; slots: TimeSlot[] }[] = [];
  slotFilter: '' | 'open' | 'booked' | 'past' | 'lunch' = '';
  slotKinds: { key: 'open' | 'booked' | 'lunch' | 'past'; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'booked', label: 'Booked' },
    { key: 'lunch', label: 'Lunch' },
    { key: 'past', label: 'Past' }
  ];
  slotsLoading = false;
  slotsError = '';
  days = [
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
    { value: 0, label: 'Sunday' }
  ];

  ngOnInit(): void {
    this.api.barbers().subscribe({
      next: result => {
        this.barbers = result;
        if (result.length === 1) {
          this.selectedBarberId = result[0].id;
          this.loadSchedule();
        }
      },
      error: () => this.error = 'Unable to load barbers.'
    });
  }

  onBarberChange(): void {
    this.editing = false;
    this.loadSchedule();
  }

  loadSchedule(keepMessage = false): void {
    this.blocks = [];
    this.slots = [];
    this.weekDays = [];
    this.slotsError = '';
    if (!keepMessage) this.message = '';
    this.error = '';

    if (!this.selectedBarberId) return;

    this.api.getBarberAvailability(this.selectedBarberId)
      .subscribe({
        next: result => {
          this.blocks = result;
          this.loadSlots();
        },
        error: () => this.error = 'Unable to load availability.'
      });
  }

  private todayInput(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  label(slot: TimeSlot): string {
    const [h, m] = slot.time.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  get filteredSlots(): TimeSlot[] {
    return this.applyFilter(this.slots);
  }

  applyFilter(list: TimeSlot[]): TimeSlot[] {
    const f = this.slotFilter;
    if (!f) return list;
    return list.filter(s => f === 'open' ? s.available : s.reason === f);
  }

  private get countedSlots(): TimeSlot[] {
    return this.viewMode === 'week' ? this.weekDays.flatMap(d => d.slots) : this.slots;
  }

  countSlots(kind: 'open' | 'booked' | 'past' | 'lunch'): number {
    return this.countedSlots.filter(s =>
      kind === 'open' ? s.available : s.reason === kind).length;
  }

  get visibleWeekDays() {
    return this.selectedWeekDay
      ? this.weekDays.filter(d => d.date === this.selectedWeekDay)
      : this.weekDays;
  }

  get weekEnding(): string {
    if (!this.slotDate) return '';
    const d = this.parseDate(this.slotDate);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  setViewMode(mode: 'day' | 'week'): void {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.loadSlots();
  }

  shiftDate(direction: number): void {
    if (!this.slotDate) return;
    const d = this.parseDate(this.slotDate);
    d.setDate(d.getDate() + direction * (this.viewMode === 'week' ? 7 : 1));
    this.slotDate = this.formatDate(d);
    this.loadSlots();
  }

  private parseDate(value: string): Date {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private formatDate(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  loadSlots(): void {
    this.slots = [];
    this.weekDays = [];
    this.slotsError = '';
    if (!this.selectedBarberId || !this.slotDate) return;

    const barberId = this.selectedBarberId;
    const date = this.slotDate;
    const mode = this.viewMode;
    const stale = () => barberId !== this.selectedBarberId || date !== this.slotDate || mode !== this.viewMode;
    this.slotsLoading = true;

    if (mode === 'week') {
      const start = this.parseDate(date);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      if (this.selectedWeekDay && !(this.selectedWeekDay >= this.formatDate(start) &&
          this.selectedWeekDay <= this.formatDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)))) {
        this.selectedWeekDay = '';
      }
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
      forkJoin(dates.map(d => this.api.barberSlots(barberId, null, this.formatDate(d)))).subscribe({
        next: results => {
          if (stale()) return;
          this.slotsLoading = false;
          this.weekDays = dates.map((d, i) => ({
            date: this.formatDate(d),
            label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
            slots: results[i].slots
          }));
        },
        error: e => {
          if (stale()) return;
          this.slotsLoading = false;
          this.slotsError = e.error?.error || 'Unable to load time slots.';
        }
      });
      return;
    }

    this.api.barberSlots(barberId, null, date).subscribe({
      next: result => {
        if (stale()) return;
        this.slotsLoading = false;
        this.slots = result.slots;
      },
      error: e => {
        if (stale()) return;
        this.slotsLoading = false;
        this.slotsError = e.error?.error || 'Unable to load time slots.';
      }
    });
  }

  getBlocks(day: number): AvailabilityBlock[] {
    return this.blocks.filter(b => b.dayOfWeek === day);
  }

  addBlock(day: number): void {
    this.blocks = [
      ...this.blocks,
      {
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '17:00',
        isActive: true
      }
    ];
  }

  removeBlock(block: AvailabilityBlock): void {
    this.blocks = this.blocks.filter(b => b !== block);
  }

  clearLunch(block: AvailabilityBlock): void {
    block.lunchStart = null;
    block.lunchEnd = null;
  }

  saveSchedule(): void {
    if (!this.selectedBarberId) return;

    this.error = '';
    this.message = '';

    // Check individual time ranges.
    for (const block of this.blocks) {
      if (
        !block.startTime ||
        !block.endTime ||
        block.startTime >= block.endTime
      ) {
        this.error = 'Please enter valid working hours.';
        return;
      }

      const hasStart = !!block.lunchStart;
      const hasEnd = !!block.lunchEnd;
      if (hasStart !== hasEnd) {
        this.error = 'Enter both a lunch start and end time.';
        return;
      }
      if (
        hasStart && hasEnd &&
        (block.lunchStart! >= block.lunchEnd! ||
          block.lunchStart! < block.startTime ||
          block.lunchEnd! > block.endTime)
      ) {
        this.error = 'Lunch must fall within the working hours.';
        return;
      }
    }

    // Check overlapping active blocks.
    for (let i = 0; i < this.blocks.length; i++) {
      for (let j = i + 1; j < this.blocks.length; j++) {
        const a = this.blocks[i];
        const b = this.blocks[j];

        if (
          a.isActive &&
          b.isActive &&
          a.dayOfWeek === b.dayOfWeek &&
          a.startTime < b.endTime &&
          b.startTime < a.endTime
        ) {
          this.error = 'Working hours cannot overlap.';
          return;
        }
      }
    }

    this.saving = true;

    this.api.saveBarberAvailability(
      this.selectedBarberId,
      this.blocks
    ).subscribe({
      next: () => {
        this.saving = false;
        this.message = 'Weekly schedule saved successfully.';
        this.loadSchedule(true);
      },
      error: e => {
        this.saving = false;
        this.error = (typeof e.error === 'string' && e.error.trim())
          || e.error?.error || 'Unable to save schedule.';
      }
    });
  }
}
