package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"

	"bensa/internal/models"
)

// Statistics Finland PxWeb table 11xx: "Polttonesteiden keskihintoja",
// monthly national average consumer prices (incl. VAT) from 2002M01 onwards.
// Open data under CC BY 4.0 — attribution is rendered in the frontend footer.
// A var only so tests can point the client at a fake server.
var statFinTableURL = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/khi/11xx.px"

// PxWeb dimension codes of table 11xx.
const (
	dimCommodity = "coicop_13_20160512"
	dimMonth     = "timeperiod_m"
)

// PxWeb commodity codes, mapped to the fuel keys the frontend's lib/fuels.ts
// colours and orders. Light heating oil (0400500) is deliberately omitted — it
// isn't sold at the pump.
var statFinCommodities = map[string]string{
	"0700100": "diesel",
	"0700200": "95E10",
	"0700300": "98E5",
	"0700800": "biokaasu",
}

// statFinQuery is a PxWeb data request: one selection per dimension.
type statFinQuery struct {
	Query    []statFinSelection `json:"query"`
	Response struct {
		Format string `json:"format"`
	} `json:"response"`
}

type statFinSelection struct {
	Code      string `json:"code"`
	Selection struct {
		Filter string   `json:"filter"`
		Values []string `json:"values"`
	} `json:"selection"`
}

func selection(code, filter string, values ...string) statFinSelection {
	var s statFinSelection
	s.Code = code
	s.Selection.Filter = filter
	s.Selection.Values = values
	return s
}

// jsonStat2 is the subset of the JSON-stat2 response we actually read. The
// `value` array is flat and indexed in row-major order over `size`, which here
// is [months, commodities, 1] — see decode below.
type jsonStat2 struct {
	Size      []int      `json:"size"`
	ID        []string   `json:"id"`
	Value     []*float64 `json:"value"`
	Dimension map[string]struct {
		Category struct {
			Index map[string]int `json:"index"`
		} `json:"category"`
	} `json:"dimension"`
	Updated string `json:"updated"`
}

// FetchNationalTrend pulls the whole history of national average prices.
// Returns one series per fuel, oldest point first.
func FetchNationalTrend(ctx context.Context) ([]models.TrendSeries, error) {
	codes := make([]string, 0, len(statFinCommodities))
	for code := range statFinCommodities {
		codes = append(codes, code)
	}
	sort.Strings(codes)

	var q statFinQuery
	q.Query = []statFinSelection{
		selection(dimCommodity, "item", codes...),
		// Every month the table has, rather than a "top N" count that would
		// quietly start dropping the oldest months once the table outgrew it.
		selection(dimMonth, "all", "*"),
	}
	q.Response.Format = "json-stat2"

	body, err := json.Marshal(q)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, statFinTableURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", userAgent)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("statfin: unexpected status %d", resp.StatusCode)
	}

	var ds jsonStat2
	if err := json.NewDecoder(resp.Body).Decode(&ds); err != nil {
		return nil, fmt.Errorf("statfin: decode: %w", err)
	}
	return decodeTrend(&ds)
}

// decodeTrend flattens JSON-stat2 into per-fuel series. The value array is
// row-major over the dimensions listed in `id`, so the offset of a given
// (month, commodity) pair is monthIdx*commodityCount + commodityIdx — but we
// derive the strides from `size` rather than assuming that ordering, because
// PxWeb is free to return the dimensions in a different order.
func decodeTrend(ds *jsonStat2) ([]models.TrendSeries, error) {
	if len(ds.Size) != len(ds.ID) {
		return nil, fmt.Errorf("statfin: size/id mismatch (%d vs %d)", len(ds.Size), len(ds.ID))
	}

	// Stride for each dimension, row-major: the product of all sizes to its right.
	strides := make([]int, len(ds.Size))
	stride := 1
	for i := len(ds.Size) - 1; i >= 0; i-- {
		strides[i] = stride
		stride *= ds.Size[i]
	}
	// A value array that doesn't cover the declared cube means the strides are
	// wrong, and every price read through them would belong to another cell.
	if len(ds.Value) != stride {
		return nil, fmt.Errorf("statfin: %d values for a cube of %d cells", len(ds.Value), stride)
	}

	dimPos := func(name string) (int, bool) {
		for i, id := range ds.ID {
			if id == name {
				return i, true
			}
		}
		return 0, false
	}

	timePos, ok := dimPos(dimMonth)
	if !ok {
		return nil, fmt.Errorf("statfin: missing time dimension")
	}
	commodityPos, ok := dimPos(dimCommodity)
	if !ok {
		return nil, fmt.Errorf("statfin: missing commodity dimension")
	}

	months := ds.Dimension[dimMonth].Category.Index
	commodities := ds.Dimension[dimCommodity].Category.Index
	if len(months) != ds.Size[timePos] || len(commodities) != ds.Size[commodityPos] {
		return nil, fmt.Errorf("statfin: category counts (%d months, %d commodities) don't match size %v",
			len(months), len(commodities), ds.Size)
	}

	// PxWeb returns months already in chronological order, but the category
	// index is a map, so sort by the index it carries rather than by iteration.
	orderedMonths := make([]string, len(months))
	for month, idx := range months {
		if idx < 0 || idx >= len(orderedMonths) || orderedMonths[idx] != "" {
			return nil, fmt.Errorf("statfin: bad month index %d for %s", idx, month)
		}
		orderedMonths[idx] = month
	}

	series := make([]models.TrendSeries, 0, len(commodities))
	for code, cIdx := range commodities {
		fuel, mapped := statFinCommodities[code]
		if !mapped {
			continue
		}
		if cIdx < 0 || cIdx >= ds.Size[commodityPos] {
			return nil, fmt.Errorf("statfin: bad commodity index %d for %s", cIdx, code)
		}
		points := make([]models.TrendPoint, 0, len(orderedMonths))
		for mIdx, month := range orderedMonths {
			// PxWeb uses null for suppressed/missing months (biogas, for one,
			// only starts in 2025); skip rather than charting a zero.
			if v := ds.Value[mIdx*strides[timePos]+cIdx*strides[commodityPos]]; v != nil {
				points = append(points, models.TrendPoint{Month: month, Price: *v})
			}
		}
		if len(points) > 0 {
			series = append(series, models.TrendSeries{Fuel: fuel, Points: points})
		}
	}

	if len(series) == 0 {
		return nil, fmt.Errorf("statfin: no usable series in response")
	}
	// Map iteration order is random; keep the payload stable between polls.
	sort.Slice(series, func(i, j int) bool { return series[i].Fuel < series[j].Fuel })
	return series, nil
}

var httpClient = &http.Client{Timeout: 30 * time.Second}

const userAgent = "bensa/1.0 (+https://polttoaine.duckdns.org)"
