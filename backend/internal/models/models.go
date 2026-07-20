package models

// The whole app is built on Statistics Finland's monthly national average
// fuel prices, so the model is just that: one history series per fuel.

// TrendPoint is one month of a series. Month is a PxWeb period key such as
// "2026M06" — kept verbatim rather than parsed to a date, because the value
// describes a whole month, not an instant.
type TrendPoint struct {
	Month string  `json:"month"`
	Price float64 `json:"price"`
}

// TrendSeries is the national average history for a single fuel, oldest first.
type TrendSeries struct {
	// Fuel is a normalised key the frontend recognises: 95E10, 98E5, diesel,
	// biokaasu. Upstream commodity codes are mapped onto these in statfin.go.
	Fuel   string       `json:"fuel"`
	Points []TrendPoint `json:"points"`
}

// Trend is what /api/trend returns: every series plus provenance the frontend
// renders as an attribution line (the source licence requires it).
type Trend struct {
	Series    []TrendSeries `json:"series"`
	FetchedAt string        `json:"fetchedAt"`
	Source    string        `json:"source"`
}
