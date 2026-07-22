package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                 string
	DatabaseURL          string
	JWTSecret            string
	JWTRefreshSecret     string
	CORSOrigins          []string
	GoogleClientID       string
	GoogleClientSecret   string
	GoogleRedirectURI    string
	GoogleProxyURL       string
	GoogleProxyKey       string
	ResearchFrontendURL  string
	ResearchTokenKey     string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		Port:                getEnv("PORT", "8080"),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
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
		port := getEnv("DB_PORT", "5432")
		user := getEnv("DB_USER", "postgres")
		password := os.Getenv("DB_PASSWORD")
		name := getEnv("DB_NAME", "research")
		sslmode := getEnv("DB_SSLMODE", "disable")
		cfg.DatabaseURL = fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			host, port, user, password, name, sslmode,
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

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
