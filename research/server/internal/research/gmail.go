package research

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/siblingsl/xy-tool/research-server/internal/config"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/queue"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/gmail/v1"
	"google.golang.org/api/option"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type GmailHandler struct {
	db     *gorm.DB
	cfg    *config.Config
	worker *queue.Worker
}

func NewGmailHandler(db *gorm.DB, cfg *config.Config, worker *queue.Worker) *GmailHandler {
	return &GmailHandler{db: db, cfg: cfg, worker: worker}
}

func (h *GmailHandler) SetWorker(worker *queue.Worker) {
	h.worker = worker
}

func (h *GmailHandler) RegisterRoutes(rg *gin.RouterGroup, auth gin.HandlerFunc) {
	rg.GET("/gmail/auth-url", auth, h.authURL)
	rg.GET("/gmail/callback", h.callback)
	rg.GET("/gmail/status", auth, h.status)
	rg.POST("/gmail/sync", auth, h.sync)
}

func (h *GmailHandler) authURL(c *gin.Context) {
	tenantID := middleware.TenantID(c)
	oauthCfg := h.oauthConfig()
	state := strconv.FormatInt(tenantID, 10)
	authURL := oauthCfg.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce)
	response.OK(c, gin.H{"url": authURL})
}

func (h *GmailHandler) callback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	frontend := strings.TrimRight(h.cfg.ResearchFrontendURL, "/")

	if code == "" || state == "" {
		c.Redirect(http.StatusFound, frontend+"/settings?gmail=error&msg=missing_code")
		return
	}

	tenantID, err := strconv.ParseInt(state, 10, 64)
	if err != nil {
		c.Redirect(http.StatusFound, frontend+"/settings?gmail=error&msg=invalid_state")
		return
	}

	if err := h.handleOAuthCallback(c.Request.Context(), code, tenantID); err != nil {
		msg := url.QueryEscape(err.Error())
		c.Redirect(http.StatusFound, frontend+"/settings?gmail=error&msg="+msg)
		return
	}

	c.Redirect(http.StatusFound, frontend+"/settings?gmail=connected")
}

func (h *GmailHandler) status(c *gin.Context) {
	tenantID := middleware.TenantID(c)

	var account models.ResearchGmailAccount
	err := h.db.Where("tenant_id = ? AND status = ?", tenantID, "active").First(&account).Error
	if err != nil {
		response.OK(c, gin.H{"connected": false, "email": nil, "lastSyncAt": nil})
		return
	}

	var lastEmail models.ResearchEmail
	var lastSync *string
	if err := h.db.Where("tenant_id = ?", tenantID).Order("created_at DESC").First(&lastEmail).Error; err == nil {
		s := lastEmail.CreatedAt.UTC().Format(time.RFC3339)
		lastSync = &s
	}

	response.OK(c, gin.H{
		"connected":  true,
		"email":      account.Email,
		"lastSyncAt": lastSync,
	})
}

func (h *GmailHandler) sync(c *gin.Context) {
	tenantID := middleware.TenantID(c)

	var account models.ResearchGmailAccount
	if err := h.db.Where("tenant_id = ? AND status = ?", tenantID, "active").First(&account).Error; err != nil {
		response.Error(c, http.StatusBadRequest, "Gmail 未授权，请先完成 OAuth 授权")
		return
	}

	job := models.ResearchPipelineJob{
		ResearchBase: models.ResearchBase{TenantID: tenantID},
		Stage:        "sync",
		Status:       "queued",
	}
	if err := h.db.Create(&job).Error; err != nil {
		response.Error(c, http.StatusInternalServerError, "创建同步任务失败")
		return
	}

	h.worker.Enqueue(queue.JobPayload{
		JobID:    job.ID,
		TenantID: tenantID,
		Type:     queue.JobSync,
	})

	response.OK(c, gin.H{"jobId": job.ID.String()})
}

func (h *GmailHandler) oauthConfig() *oauth2.Config {
	cfg := &oauth2.Config{
		ClientID:     h.cfg.GoogleClientID,
		ClientSecret: h.cfg.GoogleClientSecret,
		RedirectURL:  h.cfg.GoogleRedirectURI,
		Scopes: []string{
			gmail.GmailReadonlyScope,
			gmail.GmailModifyScope,
		},
		Endpoint: google.Endpoint,
	}

	if h.cfg.GoogleProxyURL != "" {
		cfg.Endpoint = oauth2.Endpoint{
			AuthURL:  h.cfg.GoogleProxyURL + "/oauth2.googleapis.com/auth",
			TokenURL: h.cfg.GoogleProxyURL + "/oauth2.googleapis.com/token",
		}
	}

	return cfg
}

func (h *GmailHandler) handleOAuthCallback(ctx context.Context, code string, tenantID int64) error {
	oauthCfg := h.oauthConfig()
	token, err := h.exchangeToken(ctx, oauthCfg, code)
	if err != nil {
		return fmt.Errorf("token exchange failed: %w", err)
	}
	if token.RefreshToken == "" {
		return fmt.Errorf("未能获取 refresh_token，请重新授权")
	}

	client := h.oauthHTTPClient(ctx, oauthCfg, token)
	svc, err := gmail.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return err
	}

	profile, err := svc.Users.GetProfile("me").Do()
	if err != nil {
		return err
	}

	email := profile.EmailAddress
	var historyID *string
	if profile.HistoryId > 0 {
		s := strconv.FormatUint(profile.HistoryId, 10)
		historyID = &s
	}

	var account models.ResearchGmailAccount
	err = h.db.Where("tenant_id = ?", tenantID).First(&account).Error
	if err == gorm.ErrRecordNotFound {
		account = models.ResearchGmailAccount{
			ResearchBase:    models.ResearchBase{TenantID: tenantID},
			Email:           email,
			RefreshTokenEnc: token.RefreshToken,
			SyncCursor:      historyID,
			Status:          "active",
		}
		return h.db.Create(&account).Error
	}
	if err != nil {
		return err
	}

	account.Email = email
	account.RefreshTokenEnc = token.RefreshToken
	account.SyncCursor = historyID
	account.Status = "active"
	return h.db.Save(&account).Error
}

func (h *GmailHandler) exchangeToken(ctx context.Context, cfg *oauth2.Config, code string) (*oauth2.Token, error) {
	if h.cfg.GoogleProxyURL == "" {
		return cfg.Exchange(ctx, code)
	}

	v := url.Values{
		"code":          {code},
		"client_id":     {cfg.ClientID},
		"client_secret": {cfg.ClientSecret},
		"redirect_uri":  {cfg.RedirectURL},
		"grant_type":    {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.Endpoint.TokenURL, strings.NewReader(v.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if h.cfg.GoogleProxyKey != "" {
		req.Header.Set("x-proxy-key", h.cfg.GoogleProxyKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("token endpoint %d: %s", resp.StatusCode, string(body))
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	tok := &oauth2.Token{AccessToken: fmt.Sprint(raw["access_token"])}
	if rt, ok := raw["refresh_token"].(string); ok {
		tok.RefreshToken = rt
	}
	if exp, ok := raw["expires_in"].(float64); ok {
		tok.Expiry = time.Now().Add(time.Duration(exp) * time.Second)
	}
	return tok, nil
}

func (h *GmailHandler) oauthHTTPClient(ctx context.Context, cfg *oauth2.Config, token *oauth2.Token) *http.Client {
	if h.cfg.GoogleProxyURL == "" {
		return cfg.Client(ctx, token)
	}

	transport := &proxyTransport{
		base:       http.DefaultTransport,
		proxyURL:   h.cfg.GoogleProxyURL,
		proxyKey:   h.cfg.GoogleProxyKey,
		token:      token,
		tokenURL:   cfg.Endpoint.TokenURL,
		oauthCfg:   cfg,
	}
	return &http.Client{Transport: transport}
}

type proxyTransport struct {
	base     http.RoundTripper
	proxyURL string
	proxyKey string
	token    *oauth2.Token
	tokenURL string
	oauthCfg *oauth2.Config
}

func (t *proxyTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if t.token != nil && t.token.Expiry.Before(time.Now()) && t.token.RefreshToken != "" {
		newTok, err := t.oauthCfg.TokenSource(req.Context(), t.token).Token()
		if err == nil {
			t.token = newTok
		}
	}

	cloned := req.Clone(req.Context())
	if t.token != nil && t.token.AccessToken != "" {
		cloned.Header.Set("Authorization", "Bearer "+t.token.AccessToken)
	}

	target := cloned.URL.String()
	if strings.HasPrefix(target, "https://gmail.googleapis.com/") {
		target = t.proxyURL + "/gmail.googleapis.com/" + strings.TrimPrefix(target, "https://gmail.googleapis.com/")
	} else if strings.HasPrefix(target, "https://www.googleapis.com/gmail/") {
		target = t.proxyURL + "/gmail.googleapis.com/" + strings.TrimPrefix(target, "https://www.googleapis.com/")
	}
	parsed, err := url.Parse(target)
	if err != nil {
		return nil, err
	}
	cloned.URL = parsed
	if t.proxyKey != "" {
		cloned.Header.Set("x-proxy-key", t.proxyKey)
	}

	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(cloned)
}

// SyncEmails fetches recent Gmail messages and upserts research_emails rows.
func (h *GmailHandler) SyncEmails(tenantID int64) (int, error) {
	var account models.ResearchGmailAccount
	if err := h.db.Where("tenant_id = ? AND status = ?", tenantID, "active").First(&account).Error; err != nil {
		return 0, fmt.Errorf("Gmail 未授权")
	}

	ctx := context.Background()
	oauthCfg := h.oauthConfig()
	token := &oauth2.Token{RefreshToken: account.RefreshTokenEnc}
	client := h.oauthHTTPClient(ctx, oauthCfg, token)
	svc, err := gmail.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return 0, err
	}

	oneDayAgo := time.Now().Add(-24 * time.Hour).Unix()
	list, err := svc.Users.Messages.List("me").Q(fmt.Sprintf("after:%d", oneDayAgo)).MaxResults(50).Do()
	if err != nil {
		if isAuthError(err) {
			_ = h.db.Model(&account).Update("status", "revoked").Error
		}
		return 0, err
	}

	synced := 0
	for _, msg := range list.Messages {
		if msg.Id == "" {
			continue
		}

		var existing int64
		h.db.Model(&models.ResearchEmail{}).Where("gmail_message_id = ?", msg.Id).Count(&existing)
		if existing > 0 {
			continue
		}

		full, err := svc.Users.Messages.Get("me", msg.Id).Format("full").Do()
		if err != nil {
			log.Printf("gmail get message %s: %v", msg.Id, err)
			continue
		}

		email := h.parseMessage(tenantID, full)
		if err := h.db.Create(&email).Error; err != nil {
			log.Printf("save email %s: %v", msg.Id, err)
			continue
		}
		synced++

		// Pipeline: parse the email into a research project (heuristic, no LLM).
		// Skip emails that have already produced a project.
		var dup int64
		h.db.Model(&models.ResearchProject{}).Where("tenant_id = ? AND email_id = ?", tenantID, email.ID).Count(&dup)
		if dup == 0 {
			if project := ParseEmailToProject(tenantID, email); project != nil {
				if cerr := h.db.Create(project).Error; cerr != nil {
					log.Printf("create project from email %s: %v", msg.Id, cerr)
				} else if key := ClusterKeyOf(project); key != "" {
					if cid := assignOrCreateCluster(h.db, tenantID, key, project.ID); cid != nil {
						_ = h.db.Model(project).Update("cluster_id", cid).Error
					}
				}
			}
		}
	}

	if list.ResultSizeEstimate > 0 {
		cursor := strconv.FormatInt(list.ResultSizeEstimate, 10)
		_ = h.db.Model(&account).Update("sync_cursor", cursor).Error
	}

	return synced, nil
}

func (h *GmailHandler) parseMessage(tenantID int64, msg *gmail.Message) models.ResearchEmail {
	subject, fromAddr, receivedAt := parseHeaders(msg.Payload.Headers)
	bodyText := extractBody(msg.Payload)
	links := extractLinks(bodyText)
	extracted := map[string]interface{}{
		"links": links,
		"githubUrls":   filterURLs(links, `(?i)github\.com`),
		"youtubeUrls":  filterURLs(links, `(?i)(youtube\.com|youtu\.be)`),
		"productUrls":  filterURLs(links, `(?i)producthunt\.com`),
		"redditUrls":   filterURLs(links, `(?i)reddit\.com`),
		"twitterUrls":  filterURLs(links, `(?i)(twitter\.com|x\.com)`),
		"attachments":  []string{},
	}
	raw, _ := json.Marshal(extracted)

	status := "pending"
	var filterReason *string
	if bodyText == "" && len(links) == 0 {
		status = "skipped"
		reason := "empty_content"
		filterReason = &reason
	}

	return models.ResearchEmail{
		ResearchBase:   models.ResearchBase{TenantID: tenantID},
		GmailMessageID: msg.Id,
		Subject:        subject,
		FromAddr:       fromAddr,
		ReceivedAt:     receivedAt,
		BodyText:       strPtr(bodyText),
		ExtractedJSON:  datatypes.JSON(raw),
		Status:         status,
		FilterReason:   filterReason,
	}
}

func parseHeaders(headers []*gmail.MessagePartHeader) (subject, from string, received time.Time) {
	received = time.Now()
	for _, h := range headers {
		switch strings.ToLower(h.Name) {
		case "subject":
			subject = h.Value
		case "from":
			from = h.Value
		case "date":
			if t, err := mailParseDate(h.Value); err == nil {
				received = t
			}
		}
	}
	return
}

func mailParseDate(v string) (time.Time, error) {
	layouts := []string{
		time.RFC1123Z, time.RFC1123, time.RFC822Z, time.RFC822,
		"Mon, 2 Jan 2006 15:04:05 -0700",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, v); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unparseable date")
}

func extractBody(part *gmail.MessagePart) string {
	if part == nil {
		return ""
	}
	if part.MimeType == "text/plain" && part.Body != nil && part.Body.Data != "" {
		return decodeBase64URL(part.Body.Data)
	}
	var sb strings.Builder
	for _, p := range part.Parts {
		sb.WriteString(extractBody(p))
	}
	return sb.String()
}

func decodeBase64URL(s string) string {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		b, err = base64.URLEncoding.DecodeString(s)
		if err != nil {
			return ""
		}
	}
	return string(b)
}

func extractLinks(text string) []string {
	re := regexp.MustCompile(`https?://[^\s<>"']+`)
	return re.FindAllString(text, -1)
}

func filterURLs(links []string, pattern string) []string {
	re := regexp.MustCompile(pattern)
	out := []string{}
	for _, l := range links {
		if re.MatchString(l) {
			out = append(out, l)
		}
	}
	return out
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func isAuthError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "401") || strings.Contains(msg, "invalid_grant")
}
