package research

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"gorm.io/gorm"
)

// ProjectCard is the structured representation extracted (heuristically) from an
// email. It mirrors the frontend ProjectCard contract so the UI can render without
// an extra transformation layer.
type ProjectCard struct {
	Name           string   `json:"name"`
	Type           string   `json:"type"`
	Price          string   `json:"price"`
	Audience       string   `json:"audience"`
	Model          string   `json:"model,omitempty"`
	OpenSource     bool     `json:"openSource"`
	Website        string   `json:"website"`
	LaunchYear     int      `json:"launchYear,omitempty"`
	Author         string   `json:"author"`
	Competitors    []string `json:"competitorsMentioned,omitempty"`
	Market         string   `json:"market,omitempty"`
	ClusterKey     string   `json:"clusterKey,omitempty"`
}

// ParseEmailToProject turns a synced email into a ResearchProject using a
// dependency-free heuristic extractor. The "real" NLP/LLM layer is an explicit
// extension point: swap this function for an LLM-backed one without touching
// callers.
//
// Returns nil when the email has no usable signal (caller should skip).
func ParseEmailToProject(tenantID int64, email models.ResearchEmail) *models.ResearchProject {
	body := strPtrVal(email.BodyText)
	subject := strings.TrimSpace(email.Subject)
	if subject == "" && body == "" {
		return nil
	}

	card := extractCard(subject, body, email)
	cardJSON, err := json.Marshal(card)
	if err != nil {
		return nil
	}

	summary := summarize(body, 220)
	now := time.Now()
	project := &models.ResearchProject{
		ResearchBase: models.ResearchBase{
			TenantID:  tenantID,
			CreatedAt: now,
			UpdatedAt: now,
		},
		EmailID:           email.ID,
		CardJSON:          cardJSON,
		VerifyStatus:       "pending",
		FeasibilityIndex:   intPtr(0),
		Lifecycle:          strPtr("idea"),
		Summary:           strPtr(summary),
		Stars:             intPtr(0),
		Favorited:         false,
	}
	return project
}

// ClusterKeyOf reads the cluster bucket computed during parsing.
func ClusterKeyOf(p *models.ResearchProject) string {
	return cardField(*p, "clusterKey")
}

// extractCard runs the heuristic field extraction.
func extractCard(subject, body string, email models.ResearchEmail) ProjectCard {
	lower := strings.ToLower(subject + " " + body)
	links := extractURLsFromExtracted(email.ExtractedJSON)

	card := ProjectCard{
		Name:    cleanName(subject),
		Author:  cleanAuthor(email.FromAddr),
		Website: firstWebsite(links),
	}
	card.Type = detectType(lower)
	card.OpenSource = hasGitHub(links)
	if card.OpenSource {
		card.Model = "open-source"
	}
	if p := detectPrice(lower); p != "" {
		card.Price = p
	}
	if a := detectAudience(lower); a != "" {
		card.Audience = a
	}
	if y := detectYear(lower); y > 0 {
		card.LaunchYear = y
	}
	if m := detectMarket(lower); m != "" {
		card.Market = m
	}
	card.ClusterKey = clusterKeyFor(card.Type, lower)
	return card
}

// ---- heuristic helpers ----

var priceRe = regexp.MustCompile(`(?:[\$¥€]\s?(\d[\d,]*(?:\.\d+)?))|(?:free)|(?:gratis)`)

func detectPrice(lower string) string {
	m := priceRe.FindStringSubmatch(lower)
	if m == nil {
		return ""
	}
	if m[1] != "" {
		return "$" + strings.ReplaceAll(m[1], ",", "")
	}
	return "free"
}

var typeKeywords = []struct {
	kw   string
	typ  string
}{
	{"ai agent", "AI Agent"},
	{"ai tool", "AI Tool"},
	{"ai ", "AI Tool"},
	{"saas", "SaaS"},
	{"chrome extension", "Browser Extension"},
	{"extension", "Browser Extension"},
	{"indie game", "Game"},
	{"game", "Game"},
	{"mobile app", "Mobile App"},
	{"ios app", "Mobile App"},
	{"app", "App"},
	{"newsletter", "Newsletter"},
	{"course", "Course"},
	{"template", "Template"},
	{"notion", "Template"},
	{"api", "Developer Tool"},
	{"sdk", "Developer Tool"},
	{"developer tool", "Developer Tool"},
	{"plugin", "Plugin"},
	{"bot", "Bot"},
}

func detectType(lower string) string {
	for _, t := range typeKeywords {
		if strings.Contains(lower, t.kw) {
			return t.typ
		}
	}
	return "Other"
}

var audienceKeywords = []struct {
	kw   string
	aud  string
}{
	{"founder", "Founders"},
	{"indie hacker", "Indie Hackers"},
	{"developer", "Developers"},
	{"designer", "Designers"},
	{"marketer", "Marketers"},
	{"creator", "Content Creators"},
	{"student", "Students"},
	{"enterprise", "Enterprises"},
	{"small business", "Small Businesses"},
}

func detectAudience(lower string) string {
	for _, a := range audienceKeywords {
		if strings.Contains(lower, a.kw) {
			return a.aud
		}
	}
	return ""
}

func detectYear(lower string) int {
	re := regexp.MustCompile(`\b(20[2-3]\d)\b`)
	m := re.FindStringSubmatch(lower)
	if m == nil {
		return 0
	}
	var y int
	if _, err := fmt.Sscanf(m[1], "%d", &y); err == nil {
		return y
	}
	return 0
}

var marketKeywords = []struct {
	kw     string
	market string
}{
	{"productivity", "Productivity"},
	{"finance", "Fintech"},
	{"fintech", "Fintech"},
	{"health", "Health"},
	{"education", "EdTech"},
	{"ecommerce", "E-commerce"},
	{"e-commerce", "E-commerce"},
	{"marketing", "Marketing"},
	{"crypto", "Crypto"},
	{"web3", "Crypto"},
	{"gaming", "Gaming"},
}

func detectMarket(lower string) string {
	for _, m := range marketKeywords {
		if strings.Contains(lower, m.kw) {
			return m.market
		}
	}
	return ""
}

// clusterKeyFor derives a stable cluster bucket from the detected type, with a
// keyword fallback so related projects group together without an LLM.
func clusterKeyFor(typ string, lower string) string {
	if typ != "" && typ != "Other" {
		return "type:" + strings.ToLower(strings.ReplaceAll(typ, " ", "-"))
	}
	for _, m := range marketKeywords {
		if strings.Contains(lower, m.kw) {
			return "market:" + strings.ToLower(m.market)
		}
	}
	return "misc"
}

func cleanName(subject string) string {
	s := subject
	for _, prefix := range []string{"re:", "fw:", "fwd:", "re：", "转发："} {
		s = strings.TrimSpace(strings.TrimPrefix(strings.ToLower(s), prefix))
	}
	// Strip common newsletter/marketing wrappers.
	if i := strings.IndexAny(s, "|-–—"); i > 0 && i < len(s) {
		candidate := strings.TrimSpace(s[:i])
		if len(candidate) >= 3 {
			s = candidate
		}
	}
	s = strings.TrimSpace(s)
	if len(s) > 80 {
		s = s[:80]
	}
	if s == "" {
		s = "Untitled Project"
	}
	return s
}

func cleanAuthor(from string) string {
	// "Name <a@b.com>" -> "Name"; "a@b.com" -> "a@b.com"
	if i := strings.Index(from, "<"); i >= 0 {
		return strings.TrimSpace(from[:i])
	}
	return strings.TrimSpace(from)
}

func firstWebsite(links []string) string {
	for _, l := range links {
		ll := strings.ToLower(l)
		if strings.Contains(ll, "github.com") || strings.Contains(ll, "youtube.com") ||
			strings.Contains(ll, "youtu.be") || strings.Contains(ll, "twitter.com") ||
			strings.Contains(ll, "x.com") || strings.Contains(ll, "reddit.com") {
			continue
		}
		return l
	}
	return ""
}

func hasGitHub(links []string) bool {
	for _, l := range links {
		if strings.Contains(strings.ToLower(l), "github.com") {
			return true
		}
	}
	return false
}

func extractURLsFromExtracted(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	out := []string{}
	collect := func(key string) {
		if v, ok := m[key]; ok {
			if arr, ok := v.([]interface{}); ok {
				for _, item := range arr {
					if s, ok := item.(string); ok {
						out = append(out, s)
					}
				}
			}
		}
	}
	collect("links")
	collect("githubUrls")
	collect("youtubeUrls")
	collect("productUrls")
	collect("redditUrls")
	collect("twitterUrls")
	return out
}

func summarize(body string, max int) string {
	b := strings.TrimSpace(body)
	b = strings.ReplaceAll(b, "\r", " ")
	b = strings.ReplaceAll(b, "\n", " ")
	for strings.Contains(b, "  ") {
		b = strings.ReplaceAll(b, "  ", " ")
	}
	if len(b) > max {
		return b[:max] + "…"
	}
	return b
}

// assignOrCreateCluster returns the cluster id for the given key, creating the
// cluster row (and recording the project id) when missing. It is idempotent.
func assignOrCreateCluster(tx *gorm.DB, tenantID int64, key string, projectID uuid.UUID) *uuid.UUID {
	var cluster models.ResearchCluster
	err := tx.Where("tenant_id = ? AND key = ?", tenantID, key).First(&cluster).Error
	if err == gorm.ErrRecordNotFound {
		cluster = models.ResearchCluster{
			ResearchBase: models.ResearchBase{TenantID: tenantID},
			Key:          key,
			Label:        clusterLabel(key),
			ProjectIDs:   models.UUIDArray{projectID},
		}
		if cerr := tx.Create(&cluster).Error; cerr != nil {
			return nil
		}
		return &cluster.ID
	} else if err != nil {
		return nil
	}
	// Append project id if not already present.
	found := false
	for _, id := range cluster.ProjectIDs {
		if id == projectID {
			found = true
			break
		}
	}
	if !found {
		cluster.ProjectIDs = append(cluster.ProjectIDs, projectID)
		_ = tx.Model(&cluster).Update("project_ids", models.UUIDArray(cluster.ProjectIDs)).Error
	}
	return &cluster.ID
}

func clusterLabel(key string) string {
	parts := strings.SplitN(key, ":", 2)
	if len(parts) == 2 {
		switch parts[0] {
		case "type":
			return "类型 · " + titleize(parts[1])
		case "market":
			return "市场 · " + parts[1]
		}
	}
	return titleize(key)
}

func titleize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
