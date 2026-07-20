package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"bensa/internal/models"
)

// Statistics Finland PxWeb table 11xx: "Polttonesteiden keskihintoja",
// monthly national average consumer prices (incl. VAT) from 2002M01 onwards.
// Open data under CC BY 4.0 — attribution is rendered in the frontend footer.
const statFinTableURL = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/khi/11xx.px"

// PxWeb commodity codes, mapped to the same fuel keys the station feed uses so
// the frontend can put a station's price and the national average on one axis.
// Light heating oil (0400500) is deliberately omitted — it isn't sold at the
// pump, so it has no station-level counterpart.
var statFinCommodities = map[string]string{
	"0700100": "diesel",
	"0700200": "95E10",
	"0700300": "98E5",
	"0700800": "biokaasu",
}

// statFinQuery asks for every commodity we map, over the last n months.
type statFinQuery struct {
	Query []struct {
		Code      string `json:"code"`
		Selection struct {
			Filter string   `json:"filter"`
			Values []string `json:"values"`
		} `json:"selection"`
	} `json:"query"`
	Response struct {
		Format string `json:"format"`
	} `json:"response"`
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

// FetchNationalTrend pulls the last `months` months of national average prices.
// Returns one series per fuel, oldest point first.
func FetchNationalTrend(ctx context.Context, months int) ([]models.TrendSeries, error) {
	codes := make([]string, 0, len(statFinCommodities))
	for code := range statFinCommodities {
		codes = append(codes, code)
	}

	var q statFinQuery
	q.Query = make([]struct {
		Code      string `json:"code"`
		Selection struct {
			Filter string   `json:"filter"`
			Values []string `json:"values"`
		} `json:"selection"`
	}, 2)
	q.Query[0].Code = "coicop_13_20160512"
	q.Query[0].Selection.Filter = "item"
	q.Query[0].Selection.Values = codes
	q.Query[1].Code = "timeperiod_m"
	q.Query[1].Selection.Filter = "top"
	q.Query[1].Selection.Values = []string{fmt.Sprintf("%d", months)}
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

	dimPos := func(name string) (int, bool) {
		for i, id := range ds.ID {
			if id == name {
				return i, true
			}
		}
		return 0, false
	}

	timePos, ok := dimPos("timeperiod_m")
	if !ok {
		return nil, fmt.Errorf("statfin: missing time dimension")
	}
	commodityPos, ok := dimPos("coicop_13_20160512")
	if !ok {
		return nil, fmt.Errorf("statfin: missing commodity dimension")
	}

	months := ds.Dimension["timeperiod_m"].Category.Index
	commodities := ds.Dimension["coicop_13_20160512"].Category.Index

	// PxWeb returns months already in chronological order, but the category
	// index is a map, so sort by the index it carries rather than by iteration.
	orderedMonths := make([]string, len(months))
	for month, idx := range months {
		if idx < 0 || idx >= len(orderedMonths) {
			return nil, fmt.Errorf("statfin: month index %d out of range", idx)
		}
		orderedMonths[idx] = month
	}

	series := make([]models.TrendSeries, 0, len(commodities))
	for code, cIdx := range commodities {
		fuel, mapped := statFinCommodities[code]
		if !mapped {
			continue
		}
		points := make([]models.TrendPoint, 0, len(orderedMonths))
		for mIdx, month := range orderedMonths {
			offset := mIdx*strides[timePos] + cIdx*strides[commodityPos]
			if offset >= len(ds.Value) {
				continue
			}
			// PxWeb uses null for suppressed/missing months; skip rather than
			// charting a zero.
			if v := ds.Value[offset]; v != nil {
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
	return series, nil
}

// Shared across every upstream client in this package.
var httpClient = &http.Client{Timeout: 30 * time.Second}

const userAgent = "bensa/1.0 (+https://polttoaine.duckdns.org)"
