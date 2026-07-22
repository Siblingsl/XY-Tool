package auth

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/siblingsl/xy-tool/research-server/internal/models"
	"github.com/siblingsl/xy-tool/research-server/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.POST("/register", h.register)
	rg.POST("/login", h.login)
	rg.POST("/refresh", h.refresh)
	rg.POST("/logout", h.logout)
}

type credentials struct {
	Username string `json:"username" binding:"required,min=3,max=64"`
	Password string `json:"password" binding:"required,min=6"`
}

type refreshRequest struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
}

type authResponse struct {
	AccessToken  string  `json:"accessToken"`
	RefreshToken string  `json:"refreshToken"`
	User         userDTO `json:"user"`
}

type userDTO struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	TenantID int64  `json:"tenantId"`
	Role     string `json:"role"`
}

func (h *Handler) register(c *gin.Context) {
	var req credentials
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "请求参数无效 啦啦啦啦啦啦")
		return
	}

	user, tokens, err := h.svc.Register(req.Username, req.Password)
	if err != nil {
		if errors.Is(err, errUsernameTaken) {
			response.Error(c, http.StatusConflict, "用户名已被注册")
			return
		}
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	response.OK(c, authResponse{
		AccessToken:  tokens.Access,
		RefreshToken: tokens.Refresh,
		User:         toUserDTO(user),
	})
}

func (h *Handler) login(c *gin.Context) {
	var req credentials
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "请求参数无效")
		return
	}

	user, tokens, err := h.svc.Login(req.Username, req.Password)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, "用户名或密码错误")
		return
	}

	response.OK(c, authResponse{
		AccessToken:  tokens.Access,
		RefreshToken: tokens.Refresh,
		User:         toUserDTO(user),
	})
}

func (h *Handler) refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "缺少 refreshToken")
		return
	}

	access, err := h.svc.Refresh(req.RefreshToken)
	if err != nil {
		response.Error(c, http.StatusUnauthorized, err.Error())
		return
	}

	response.OK(c, gin.H{"accessToken": access})
}

func (h *Handler) logout(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	_ = c.ShouldBindJSON(&req)
	_ = h.svc.Logout(req.RefreshToken)
	response.OK(c, gin.H{"ok": true})
}

func toUserDTO(u *models.User) userDTO {
	return userDTO{
		ID:       u.ID,
		Username: u.Username,
		TenantID: u.TenantID,
		Role:     u.Role,
	}
}
