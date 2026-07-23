package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                string
	DatabaseURL         string
	JWTSecret           string
	JWTRefreshSecret    string
	CORSOrigins         []string
	GoogleClientID      string
	GoogleClientSecret  string
	GoogleRedirectURI   string
	GoogleProxyURL      string
	GoogleProxyKey      string
	ResearchFrontendURL string
	ResearchTokenKey    string
}

func Load() (*Config, error) {
	loadDotEnv()

	cfg := &Config{
		Port:                getEnv("PORT", "8080"),
		DatabaseURL:         strings.TrimSpace(os.Getenv("DATABASE_URL")),
		JWTSecret:           os.Getenv("JWT_SECRET"),
		JWTRefreshSecret:    os.Getenv("JWT_REFRESH_SECRET"),
		GoogleClientID:      os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret:  os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleRedirectURI:   getEnv("GOOGLE_REDIRECT_URI", "http://localhost:8080/api/research/gmail/callback"),
		GoogleProxyURL:      strings.TrimRight(os.Getenv("GOOGLE_PROXY_URL"), "/"),
		GoogleProxyKey:      os.Getenv("GOOGLE_PROXY_KEY"),
		ResearchFrontendURL: getEnv("RESEARCH_FRONTEND_URL", "http://localhost:5174"),
		ResearchTokenKey:    os.Getenv("RESEARCH_TOKEN_KEY"),
	}

	if cfg.DatabaseURL == "" {
		host := getEnv("DB_HOST", "localhost")
		port := getEnv("DB_PORT", "5434")
		user := getEnv("DB_USER", "research")
		password := os.Getenv("DB_PASSWORD")
		name := getEnv("DB_NAME", "research")
		sslmode := getEnv("DB_SSLMODE", "disable")
		// Quote values so empty password / special chars stay valid in libpq keyword/value format.
		cfg.DatabaseURL = fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			quoteConn(host), quoteConn(port), quoteConn(user), quoteConn(password), quoteConn(name), quoteConn(sslmode),
		)
	}

	if origin := os.Getenv("CORS_ORIGIN"); origin != "" {
		for _, o := range strings.Split(origin, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				cfg.CORSOrigins = append(cfg.CORSOrigins, o)
			}
		}
	}
	if len(cfg.CORSOrigins) == 0 {
		cfg.CORSOrigins = []string{"http://localhost:5174", "http://localhost:5173"}
	}

	return cfg, nil
}

// loadDotEnv reads .env and strips a UTF-8 BOM (PowerShell Set-Content -Encoding UTF8 adds one,
// which makes joho/godotenv reject the file and fall back to wrong DB defaults).
func loadDotEnv() {
	data, err := os.ReadFile(".env")
	if err != nil {
		_ = godotenv.Load()
		return
	}
	if len(data) >= 3 && data[0] == 0xEF && data[1] == 0xBB && data[2] == 0xBF {
		data = data[3:]
	}
	env, err := godotenv.Unmarshal(string(data))
	if err != nil {
		_ = godotenv.Load()
		return
	}
	for k, v := range env {
		if _, exists := os.LookupEnv(k); !exists {
			_ = os.Setenv(k, v)
		}
	}
}

func quoteConn(v string) string {
	if v == "" || strings.ContainsAny(v, " '\\") {
		return "'" + strings.ReplaceAll(v, "'", `\'`) + "'"
	}
	return v
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
