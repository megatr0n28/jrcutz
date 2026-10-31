package models

type AvailabilityBlock struct {
	ID        int64  `json:"id"`
	BarberID  int64  `json:"barberId"`
	DayOfWeek int    `json:"dayOfWeek"`
	StartTime string `json:"startTime"`
	EndTime   string `json:"endTime"`
	IsActive  bool   `json:"isActive"`
}
