package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/siblingsl/xy-tool/research-server/internal/config"
	"github.com/siblingsl/xy-tool/research-server/internal/middleware"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var errUsernameTaken = errors.New("username taken")

type Service struct {
	db  *gorm.DB
	cfg *config.Config
}

func NewService(db *gorm.DB, cfg *config.Config) *Service {
	return &Service{db: db, cfg: cfg}
}

type tokenPair struct {
	Access  string
	Refresh string
}

func (s *Service) Register(username, password string) (*models.User, *tokenPair, error) {
	if s.cfg.JWTSecret == "" || s.cfg.JWTRefreshSecret == "" {
		return nil, nil, errors.New("JWT 未配置")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, nil, err
	}

	user := &models.User{
		Username:     username,
		PasswordHash: string(hash),
		Role:         "user",
		Status:       "active",
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(user).Error; err != nil {
			if isDuplicateKey(err) {
				return errUsernameTaken
			}
			return err
		}
		user.TenantID = user.ID
		return tx.Model(user).Update("tenant_id", user.ID).Error
	})
	if err != nil {
		return nil, nil, err
	}

	tokens, err := s.issueTokens(user)
	if err != nil {
		return nil, nil, err
	}
	return user, tokens, nil
}

func (s *Service) Login(username, password string) (*models.User, *tokenPair, error) {
	var user models.User
	if err := s.db.Where("username = ?", username).First(&user).Error; err != nil {
		return nil, nil, err
	}
	if user.Status != "active" {
		return nil, nil, errors.New("disabled")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, nil, err
	}
	return s.buildLoginResponse(&user)
}

func (s *Service) Refresh(refreshToken string) (string, error) {
	claims := &middleware.Claims{}
	_, err := jwt.ParseWithClaims(refreshToken, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(s.cfg.JWTRefreshSecret), nil
	})
	if err != nil || claims.Type != "refresh" {
		return "", errors.New("refreshToken 无效或已过期")
	}

	var user models.User
	if err := s.db.First(&user, claims.Sub).Error; err != nil {
		return "", errors.New("用户不存在或已被禁用")
	}
	if user.Status != "active" {
		return "", errors.New("用户不存在或已被禁用")
	}
	if !verifyRefreshHash(user.RefreshTokenHash, refreshToken) {
		return "", errors.New("refreshToken 已失效")
	}

	return s.signAccess(&user)
}

func (s *Service) Logout(refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	claims := &middleware.Claims{}
	_, err := jwt.ParseWithClaims(refreshToken, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(s.cfg.JWTRefreshSecret), nil
	})
	if err != nil {
		return nil
	}
	return s.db.Model(&models.User{}).Where("id = ?", claims.Sub).Update("refresh_token_hash", "").Error
}

func (s *Service) buildLoginResponse(user *models.User) (*models.User, *tokenPair, error) {
	tokens, err := s.issueTokens(user)
	if err != nil {
		return nil, nil, err
	}
	return user, tokens, nil
}

func (s *Service) issueTokens(user *models.User) (*tokenPair, error) {
	access, err := s.signAccess(user)
	if err != nil {
		return nil, err
	}
	refresh, err := s.signRefresh(user)
	if err != nil {
		return nil, err
	}
	hash := hashRefresh(refresh)
	if err := s.db.Model(user).Update("refresh_token_hash", hash).Error; err != nil {
		return nil, err
	}
	return &tokenPair{Access: access, Refresh: refresh}, nil
}

func (s *Service) signAccess(user *models.User) (string, error) {
	claims := middleware.Claims{
		Sub:      user.ID,
		Username: user.Username,
		TenantID: user.TenantID,
		Role:     user.Role,
		Type:     "access",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func (s *Service) signRefresh(user *models.User) (string, error) {
	claims := middleware.Claims{
		Sub:      user.ID,
		Username: user.Username,
		TenantID: user.TenantID,
		Role:     user.Role,
		Type:     "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTRefreshSecret))
}

func hashRefresh(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func verifyRefreshHash(stored, token string) bool {
	if stored == "" {
		return false
	}
	return stored == hashRefresh(token)
}

func isDuplicateKey(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return errors.Is(err, gorm.ErrDuplicatedKey) ||
		contains(msg, "duplicate key") ||
		contains(msg, "UNIQUE constraint")
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
