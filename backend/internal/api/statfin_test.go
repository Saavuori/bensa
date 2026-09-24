package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"bensa/internal/models"
)

// A trimmed PxWeb JSON-stat2 response: three months × three commodities (one
// of them unmapped light heating oil), with biogas missing its first month the
// way the real table reports months before a series starts.
const statFinFixture = `{
  "id": ["timeperiod_m", "coicop_13_20160512", "contentscode"],
  "size": [3, 3, 1],
  "dimension": {
    "timeperiod_m": {"category": {"index": {"2025M01": 0, "2025M02": 1, "2025M03": 2}}},
    "coicop_13_20160512": {"category": {"index": {"0700200": 0, "0400500": 1, "0700800": 2}}},
    "contentscode": {"category": {"index": {"keskihinta": 0}}}
  },
  "value": [1.8, 1.2, null,
            1.9, 1.3, 1.6,
            2.0, 1.4, 1.7]
}`

func decodeFixture(t *testing.T, raw string) *jsonStat2 {
	t.Helper()
	var ds jsonStat2
	if err := json.Unmarshal([]byte(raw), &ds); err != nil {
		t.Fatalf("fixture: %v", err)
	}
	return &ds
}

func TestDecodeTrend(t *testing.T) {
	got, err := decodeTrend(decodeFixture(t, statFinFixture))
	if err != nil {
		t.Fatal(err)
	}
	want := []models.TrendSeries{
		{Fuel: "95E10", Points: []models.TrendPoint{
			{Month: "2025M01", Price: 1.8}, {Month: "2025M02", Price: 1.9}, {Month: "2025M03", Price: 2.0},
		}},
		{Fuel: "biokaasu", Points: []models.TrendPoint{
			{Month: "2025M02", Price: 1.6}, {Month: "2025M03", Price: 1.7},
		}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("decodeTrend =\n  %+v\nwant\n  %+v", got, want)
	}
}

// PxWeb may list the dimensions in another order; the strides must follow.
func TestDecodeTrendDimensionOrder(t *testing.T) {
	raw := `{
	  "id": ["coicop_13_20160512", "timeperiod_m"],
	  "size": [2, 2],
	  "dimension": {
	    "timeperiod_m": {"category": {"index": {"2025M01": 0, "2025M02": 1}}},
	    "coicop_13_20160512": {"category": {"index": {"0700100": 0, "0700300": 1}}}
	  },
	  "value": [1.5, 1.6, 2.1, 2.2]
	}`
	got, err := decodeTrend(decodeFixture(t, raw))
	if err != nil {
		t.Fatal(err)
	}
	want := []models.TrendSeries{
		{Fuel: "98E5", Points: []models.TrendPoint{{Month: "2025M01", Price: 2.1}, {Month: "2025M02", Price: 2.2}}},
		{Fuel: "diesel", Points: []models.TrendPoint{{Month: "2025M01", Price: 1.5}, {Month: "2025M02", Price: 1.6}}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("decodeTrend =\n  %+v\nwant\n  %+v", got, want)
	}
}

func TestDecodeTrendRejectsMalformed(t *testing.T) {
	cases := map[string]struct{ from, to, wantErr string }{
		"short value array":            {`2.0, 1.4, 1.7]`, `2.0, 1.4]`, "values for a cube"},
		"size too small":               {`"size": [3, 3, 1]`, `"size": [3, 2, 1]`, "values for a cube"},
		"month missing from index":     {`, "2025M03": 2}`, `}`, "category counts"},
		"duplicate month index":        {`"2025M03": 2`, `"2025M03": 1`, "bad month index"},
		"commodity index out of range": {`"0700800": 2`, `"0700800": 7`, "bad commodity index"},
		"missing time dimension":       {`"id": ["timeperiod_m"`, `"id": ["month"`, "missing time dimension"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			raw := strings.Replace(statFinFixture, c.from, c.to, 1)
			if raw == statFinFixture {
				t.Fatalf("fixture edit %q did not apply", c.from)
			}
			_, err := decodeTrend(decodeFixture(t, raw))
			if err == nil || !strings.Contains(err.Error(), c.wantErr) {
				t.Errorf("err = %v, want one containing %q", err, c.wantErr)
			}
		})
	}
}

// The query must ask for every month, not a fixed "top N" count that the
// table (296 months in 2026, growing by 12 a year) would eventually outgrow.
func TestFetchNationalTrendRequestsFullHistory(t *testing.T) {
	var got statFinQuery
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Errorf("request body: %v", err)
		}
		io.WriteString(w, statFinFixture)
	}))
	defer srv.Close()
	defer func(orig string) { statFinTableURL = orig }(statFinTableURL)
	statFinTableURL = srv.URL

	series, err := FetchNationalTrend(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(series) != 2 {
		t.Errorf("got %d series, want 2", len(series))
	}

	var months *statFinSelection
	for i := range got.Query {
		if got.Query[i].Code == dimMonth {
			months = &got.Query[i]
		}
	}
	if months == nil {
		t.Fatalf("query %+v has no %s selection", got.Query, dimMonth)
	}
	if months.Selection.Filter != "all" || !reflect.DeepEqual(months.Selection.Values, []string{"*"}) {
		t.Errorf("month selection = %+v, want all/*", months.Selection)
	}
}
