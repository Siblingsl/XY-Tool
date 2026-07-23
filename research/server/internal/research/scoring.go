package research

import (
	"github.com/siblingsl/xy-tool/research-server/internal/models"
)

// computeAuthenticity derives a 1-5 authenticity/trust score from the project's
// available signal. It is a transparent heuristic standing in for an LLM-based
// verification pass.
func computeAuthenticity(p models.ResearchProject) int {
	score := 1
	if cardField(p, "website") != "" {
		score++
	}
	if cardField(p, "price") != "" && cardField(p, "price") != "free" {
		score++ // a concrete paid offering is easier to validate
	}
	if cardField(p, "type") != "" && cardField(p, "type") != "Other" {
		score++
	}
	if cardField(p, "openSource") == "true" {
		score++ // open source is independently verifiable
	}
	if score > 5 {
		score = 5
	}
	return score
}

// computeScores returns a multi-dimension feasibility/quality assessment.
// Each dimension is 0-100; the average backs feasibility_index.
func computeScores(p models.ResearchProject) map[string]float64 {
	card := func(k string) string { return cardField(p, k) }

	clarity := 40
	if card("name") != "" {
		clarity += 20
	}
	if card("type") != "" && card("type") != "Other" {
		clarity += 20
	}
	if card("audience") != "" {
		clarity += 10
	}
	if card("price") != "" {
		clarity += 10
	}

	marketFit := 30
	if card("market") != "" {
		marketFit += 30
	}
	if card("audience") != "" {
		marketFit += 20
	}
	if marketFit > 100 {
		marketFit = 100
	}

	execution := 20
	if card("website") != "" {
		execution += 30
	}
	if card("openSource") == "true" {
		execution += 30
	}
	if card("launchYear") != "" {
		execution += 20
	}
	if execution > 100 {
		execution = 100
	}

	momentum := 25
	if card("launchYear") != "" {
		momentum += 35
	}
	if card("model") == "open-source" {
		momentum += 20
	}
	if momentum > 100 {
		momentum = 100
	}

	return map[string]float64{
		"clarity":    float64(clarity),
		"marketFit":  float64(marketFit),
		"execution":  float64(execution),
		"momentum":   float64(momentum),
	}
}
