package research

import (
	"encoding/json"
	"strconv"

	"github.com/siblingsl/xy-tool/research-server/internal/models"
)

// cardField extracts a string field from a project's card_json (which holds
// name/type/price/audience/etc.). Returns "" when missing or unparsable.
func cardField(p models.ResearchProject, key string) string {
	if len(p.CardJSON) == 0 {
		return ""
	}
	var m map[string]interface{}
	if err := json.Unmarshal(p.CardJSON, &m); err != nil {
		return ""
	}
	if v, ok := m[key]; ok {
		switch t := v.(type) {
		case string:
			return t
		case float64:
			return strconv.FormatFloat(t, 'f', -1, 64)
		case bool:
			return strconv.FormatBool(t)
		default:
			b, _ := json.Marshal(t)
			return string(b)
		}
	}
	return ""
}

// projectName returns a display name for a project (from card_json, else id).
func projectName(p models.ResearchProject) string {
	if n := cardField(p, "name"); n != "" {
		return n
	}
	return p.ID.String()
}

func strOrNil(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// strPtrVal safely dereferences a *string, returning "" when nil.
func strPtrVal(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func intPtr(i int) *int { return &i }

func intOrEmpty(i *int) string {
	if i == nil {
		return ""
	}
	return strconv.Itoa(*i)
}

// filterByScoreMin keeps projects whose average score_json dimension is >= min.
// An empty/minScore value or unparsable score_json drops the project.
func filterByScoreMin(projects []models.ResearchProject, minStr string) []models.ResearchProject {
	if minStr == "" {
		return projects
	}
	min, err := strconv.ParseFloat(minStr, 64)
	if err != nil {
		return projects
	}
	out := projects[:0]
	for _, p := range projects {
		if avg := avgScore(p.ScoreJSON); avg >= min {
			out = append(out, p)
		}
	}
	return out
}

func avgScore(raw []byte) float64 {
	if len(raw) == 0 {
		return 0
	}
	var m map[string]float64
	if err := json.Unmarshal(raw, &m); err != nil {
		return 0
	}
	if len(m) == 0 {
		return 0
	}
	var sum float64
	for _, v := range m {
		sum += v
	}
	return sum / float64(len(m))
}

func parseScoreMap(raw []byte) map[string]float64 {
	out := map[string]float64{}
	if len(raw) == 0 {
		return out
	}
	_ = json.Unmarshal(raw, &out)
	return out
}
