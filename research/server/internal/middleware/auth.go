package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
)

type Claims struct {
	Sub      int64  `json:"sub"`
	Username string `json:"username"`
	TenantID int64  `json:"tenantId"`
	Role     string `json:"role"`
	Type     string `json:"type"`
	jwt.RegisteredClaims
}

func AuthRequired(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			response.Abort(c, http.StatusUnauthorized, "未授权")
			return
		}

		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if t.Method != jwt.SigningMethodHS256 {
				return nil, jwt.ErrTokenSignatureInvalid
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid || claims.Type != "access" {
			response.Abort(c, http.StatusUnauthorized, "token 无效或已过期")
			return
		}

		c.Set("userId", claims.Sub)
		c.Set("username", claims.Username)
		c.Set("tenantId", claims.TenantID)
		c.Set("role", claims.Role)
		c.Next()
	}
}

func TenantID(c *gin.Context) int64 {
	v, _ := c.Get("tenantId")
	id, _ := v.(int64)
	return id
}

func UserID(c *gin.Context) int64 {
	v, _ := c.Get("userId")
	id, _ := v.(int64)
	return id
}
