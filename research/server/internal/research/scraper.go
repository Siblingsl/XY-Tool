package research

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html"
)

const scrapeUserAgent = "xy-tool-research-bot/1.0 (+https://localhost; respectful crawler)"

var (
	hostLastHitMu sync.Mutex
	hostLastHit   = map[string]time.Time{}
	minHostGap    = 2 * time.Second
)

// ExtractedContent is the structured result of scraping a single webpage.
type ExtractedContent struct {
	URL       string `json:"url"`
	Title     string `json:"title"`
	Author    string `json:"author"`
	SiteName  string `json:"siteName"`
	Excerpt   string `json:"excerpt"`
	Image     string `json:"image"`
	Text      string `json:"text"`
	Length    int    `json:"length"`
	FetchedAt string `json:"fetchedAt"`
}

// throttleHost enforces a minimum gap between requests to the same host so we
// stay polite to target servers (no robots.txt parsing yet, but rate-limited).
func throttleHost(rawURL string) {
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return
	}
	hostLastHitMu.Lock()
	last, ok := hostLastHit[u.Host]
	now := time.Now()
	hostLastHit[u.Host] = now
	hostLastHitMu.Unlock()
	if ok {
		if wait := minHostGap - now.Sub(last); wait > 0 {
			time.Sleep(wait)
		}
	}
}

// FetchAndExtract downloads the page at rawURL and returns its cleaned main
// text using a Readability-lite heuristic. It refuses non-HTML content types
// and caps the response body at 5MB.
func FetchAndExtract(rawURL string) (*ExtractedContent, error) {
	throttleHost(rawURL)

	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("invalid url: %w", err)
	}
	req.Header.Set("User-Agent", scrapeUserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	client := &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(strings.ToLower(ct), "html") {
		return nil, fmt.Errorf("not an HTML page (content-type: %s)", ct)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	doc, err := html.Parse(strings.NewReader(string(body)))
	if err != nil {
		return nil, fmt.Errorf("parse html: %w", err)
	}

	out := &ExtractedContent{URL: rawURL, FetchedAt: time.Now().Format(time.RFC3339)}
	extractMeta(doc, out)
	out.Text = extractMainText(doc)
	out.Length = len([]rune(out.Text))
	if out.Excerpt == "" && out.Text != "" {
		out.Excerpt = truncate(out.Text, 200)
	}
	return out, nil
}

// extractMeta reads <title> and OpenGraph/meta tags into the result.
func extractMeta(doc *html.Node, out *ExtractedContent) {
	meta := map[string]string{}
	var titleText string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "title":
				titleText = strings.TrimSpace(textContent(n))
			case "meta":
				name, prop, content := "", "", ""
				for _, a := range n.Attr {
					switch strings.ToLower(a.Key) {
					case "name":
						name = strings.ToLower(a.Val)
					case "property":
						prop = strings.ToLower(a.Val)
					case "content":
						content = a.Val
					}
				}
				if content == "" {
					break
				}
				if name != "" {
					meta[name] = content
				}
				if prop != "" {
					meta[prop] = content
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	out.Title = pick(meta["og:title"], meta["twitter:title"], titleText)
	out.Author = pick(meta["article:author"], meta["author"], meta["twitter:creator"])
	out.SiteName = pick(meta["og:site_name"], meta["application-name"])
	out.Image = pick(meta["og:image"], meta["og:image:url"], meta["twitter:image"])
	out.Excerpt = pick(meta["og:description"], meta["description"], meta["twitter:description"])
}

func pick(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// extractMainText returns the largest text-bearing block via a Readability-lite
// scoring pass over candidate containers (div/article/section/main/td/li/p).
func extractMainText(doc *html.Node) string {
	removeNodes(doc, func(n *html.Node) bool {
		if n.Type != html.ElementNode {
			return false
		}
		switch n.Data {
		case "script", "style", "noscript", "iframe", "nav", "footer", "header",
			"aside", "form", "button", "svg", "template", "link", "meta", "head":
			return true
		}
		return false
	})

	var best *html.Node
	bestScore := 0
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "div", "article", "section", "main", "td", "li", "blockquote", "p":
				text := textContent(n)
				score := len([]rune(text))
				score += strings.Count(text, "，") * 2
				score += strings.Count(text, "。") * 2
				score += strings.Count(text, ".") * 1
				score += strings.Count(text, ",") * 1
				score += strings.Count(text, "\n") * 1
				if score > bestScore {
					bestScore = score
					best = n
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	if best == nil {
		best = doc
	}
	return strings.TrimSpace(textContent(best))
}

// removeNodes walks the tree and deletes nodes for which drop returns true.
func removeNodes(root *html.Node, drop func(*html.Node) bool) {
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		for c := n.FirstChild; c != nil; {
			next := c.NextSibling
			if drop(c) {
				n.RemoveChild(c)
			} else {
				walk(c)
			}
			c = next
		}
	}
	walk(root)
}

// textContent recursively concatenates the text of a node and its descendants.
func textContent(n *html.Node) string {
	if n.Type == html.TextNode {
		return n.Data
	}
	var sb strings.Builder
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		sb.WriteString(textContent(c))
		if c.Data == "p" || c.Data == "br" || c.Data == "div" {
			sb.WriteString("\n")
		}
	}
	return sb.String()
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return strings.TrimSpace(string(r[:n])) + "…"
}

func isHTTPURL(s string) bool {
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func domainOf(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return "web"
	}
	return u.Host
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
